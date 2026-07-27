from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request, Response, Depends, Form
from fastapi.responses import JSONResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import tempfile
import shutil
import aiofiles


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# LLM API Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Keycloak config (used across auth + admin routes)
KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "https://auth.sigcr.com.br")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "sigcr")
KC_INTERNAL_URL = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://sigcr-keycloak:8080")
KEYCLOAK_ADMIN_USER = os.environ.get("KEYCLOAK_ADMIN", "admin")
KEYCLOAK_ADMIN_PASS = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "")

# Cache JWKS global
_jwks_cache = None
_jwks_cache_time = None


# ============ Models ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    perfil: Optional[str] = "registradora"
    roles: List[str] = []
    detran_uf: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company_id: str = Field(default_factory=lambda: f"company_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    nome_fantasia: str
    cnpj: str
    endereco: str
    email_comercial: EmailStr
    whatsapp: str
    gestor_contrato: str
    logo_url: Optional[str] = None
    detrans_atuacao: List[str] = []
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CompanyCreate(BaseModel):
    name: str
    nome_fantasia: str
    cnpj: str
    endereco: str
    email_comercial: EmailStr
    whatsapp: str
    gestor_contrato: str
    detrans_atuacao: List[str]


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    document_id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:12]}")
    company_id: str
    document_type: str  # cnpj, licenca, certidao, balanco, iso_27001, iso_27301, etc
    document_name: str  # Nome específico do documento
    file_name: str
    file_path: str
    file_size: int
    status: str = "pending"  # pending, approved, rejected
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentUpload(BaseModel):
    company_id: str
    document_type: str


class Portaria(BaseModel):
    model_config = ConfigDict(extra="ignore")
    portaria_id: str = Field(default_factory=lambda: f"port_{uuid.uuid4().hex[:12]}")
    title: str
    content: str
    source: str  # DOU, DODF, etc
    date: datetime
    detran: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PortariaCreate(BaseModel):
    title: str
    content: str
    source: str
    date: datetime
    detran: Optional[str] = None


class AnalyzeRequest(BaseModel):
    text: str


class EstadoCredenciamento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    estado_id: str = Field(default_factory=lambda: f"estado_{uuid.uuid4().hex[:12]}")
    estado_sigla: str  # SP, RJ, MG, etc
    estado_nome: str  # São Paulo, Rio de Janeiro, etc
    portaria_vigente: Optional[str] = None
    portaria_file_path: Optional[str] = None
    empresas_credenciadas: List[str] = []  # List of company_ids
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CredenciamentoDetalhes(BaseModel):
    model_config = ConfigDict(extra="ignore")
    credenciamento_id: str = Field(default_factory=lambda: f"cred_{uuid.uuid4().hex[:12]}")
    company_id: str
    estado_sigla: str
    extrato_contrato: str
    status: str = "ativo"  # ativo, sem_efeito, pendente
    validade: Optional[datetime] = None
    valor_total_registro: Optional[float] = None
    valor_detran: Optional[float] = None
    valor_registradora: Optional[float] = None
    termo_credenciamento_path: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SystemUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    system_user_id: str = Field(default_factory=lambda: f"sysuser_{uuid.uuid4().hex[:12]}")
    name: str
    cpf: str
    company_id: Optional[str] = None
    email: EmailStr
    contato: str
    nivel_acesso: str  # GESTOR or OPERACIONAL
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SystemUserCreate(BaseModel):
    name: str
    cpf: str
    company_id: Optional[str] = None
    email: EmailStr
    contato: str
    nivel_acesso: str


# ============ Auth Helper ============

async def get_current_user(request: Request) -> User:
    """Valida token JWT do Keycloak ou session_token legado"""
    import httpx as _httpx

    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if not token:
        token = request.cookies.get("session_token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Tenta validar como JWT do Keycloak
    try:
        from jose import jwt as jose_jwt, JWTError
        JWKS_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"

        # Busca JWKS com cache global (evita chamada a cada request)
        global _jwks_cache, _jwks_cache_time
        import time
        now = time.time()
        if not _jwks_cache or not _jwks_cache_time or (now - _jwks_cache_time) > 3600:
            async with _httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.get(JWKS_URL)
                _jwks_cache = resp.json()
                _jwks_cache_time = now

        jwks = _jwks_cache
        header = jose_jwt.get_unverified_header(token)
        kid = header.get("kid")
        rsa_key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)

        if not rsa_key:
            async with _httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.get(JWKS_URL)
                _jwks_cache = resp.json()
                _jwks_cache_time = now
            jwks = _jwks_cache
            rsa_key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)

        if rsa_key:
            payload = jose_jwt.decode(
                token, rsa_key, algorithms=["RS256"],
                options={"verify_aud": False}
            )

            # Extrai roles
            roles = payload.get("realm_access", {}).get("roles", [])
            sigcr_roles = [r for r in roles if r in ["registradora","detran","detran_admin","financeira","sigcr_admin"]]

            if "sigcr_admin" in sigcr_roles: perfil = "sigcr_admin"
            elif "detran_admin" in sigcr_roles: perfil = "detran_admin"
            elif "detran" in sigcr_roles: perfil = "detran"
            elif "financeira" in sigcr_roles: perfil = "financeira"
            else: perfil = "registradora"

            user_id = payload["sub"]
            email = payload.get("email", "")
            name = payload.get("name", payload.get("preferred_username", ""))
            detran_uf = payload.get("detran_uf")

            # Upsert usuário no MongoDB
            existing = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if not existing:
                await db.users.insert_one({
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "picture": payload.get("picture"),
                    "perfil": perfil,
                    "detran_uf": detran_uf,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
            else:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"name": name, "perfil": perfil}}
                )

            return User(
                user_id=user_id,
                email=email,
                name=name,
                picture=payload.get("picture"),
                perfil=perfil,
                roles=sigcr_roles,
                detran_uf=detran_uf,
            )
    except Exception as e:
        logger.warning(f"JWT Keycloak inválido: {e}")

    # Fallback: session_token legado
    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Token inválido")

    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sessão expirada")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    return User(**user_doc)


# ============ Auth Routes ============

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for user data and create session"""
    body = await request.json()
    session_id = body.get("session_id")

    logger.info(f"🔍 Auth session request received with session_id: {session_id[:20]}...")

    if not session_id:
        logger.error("❌ No session_id provided")
        raise HTTPException(status_code=400, detail="session_id required")

    # Call Emergent Auth API
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            logger.info("🔄 Calling Emergent Auth API...")
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )

            logger.info(f"📡 Emergent Auth API response status: {auth_response.status_code}")

            if auth_response.status_code != 200:
                logger.error(f"❌ Invalid session_id. Response: {auth_response.text}")
                raise HTTPException(status_code=400, detail="Invalid session_id")

            auth_data = auth_response.json()
            logger.info(f"✅ Auth data received for email: {auth_data.get('email')}")
    except Exception as e:
        logger.error(f"❌ Error calling Emergent Auth API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Auth API error: {str(e)}")

    # Create or update user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})

    if existing_user:
        user_id = existing_user["user_id"]
        logger.info(f"👤 Existing user found: {user_id}")
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": auth_data["name"],
                "picture": auth_data.get("picture")
            }}
        )
    else:
        logger.info(f"👤 Creating new user: {user_id}")
        user_doc = {
            "user_id": user_id,
            "email": auth_data["email"],
            "name": auth_data["name"],
            "picture": auth_data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)

    # Create session
    session_token = auth_data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    logger.info(f"🔐 Creating session with token: {session_token[:20]}...")

    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)

    # Set cookie
    logger.info("🍪 Setting session cookie")
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )

    # Get user data
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    logger.info(f"✅ Auth session created successfully for user: {user_id}")
    return User(**user_doc)


@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})

    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}


# ============ Company Routes ============

@api_router.get("/companies", response_model=List[Company])
async def get_companies(current_user: User = Depends(get_current_user)):
    """Get all companies for current user"""
    companies = await db.companies.find({"user_id": current_user.user_id}, {"_id": 0}).to_list(1000)
    return companies


@api_router.post("/companies", response_model=Company)
async def create_company(company_data: CompanyCreate, current_user: User = Depends(get_current_user)):
    """Create new company"""
    company = Company(
        user_id=current_user.user_id,
        name=company_data.name,
        nome_fantasia=company_data.nome_fantasia,
        cnpj=company_data.cnpj,
        endereco=company_data.endereco,
        email_comercial=company_data.email_comercial,
        whatsapp=company_data.whatsapp,
        gestor_contrato=company_data.gestor_contrato,
        detrans_atuacao=company_data.detrans_atuacao
    )

    doc = company.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()

    await db.companies.insert_one(doc)
    return company


@api_router.get("/companies/{company_id}", response_model=Company)
async def get_company(company_id: str, current_user: User = Depends(get_current_user)):
    """Get company by ID"""
    company = await db.companies.find_one(
        {"company_id": company_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return Company(**company)


@api_router.patch("/companies/{company_id}/status")
async def update_company_status(company_id: str, status: str, current_user: User = Depends(get_current_user)):
    """Update company status"""
    result = await db.companies.update_one(
        {"company_id": company_id, "user_id": current_user.user_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"message": "Status updated"}


@api_router.post("/companies/{company_id}/upload-logo")
async def upload_company_logo(
    company_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload company logo"""
    # Verify company belongs to user
    company = await db.companies.find_one(
        {"company_id": company_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Generate unique filename
    file_extension = Path(file.filename).suffix if file.filename else ".png"
    unique_filename = f"logo_{company_id}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    # Save file
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
    except Exception as e:
        logger.error(f"Error saving logo: {str(e)}")
        raise HTTPException(status_code=500, detail="Error saving logo")

    # Update company with logo URL
    logo_url = f"/api/companies/{company_id}/logo"
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"logo_url": logo_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {"logo_url": logo_url}


@api_router.get("/companies/{company_id}/logo")
async def get_company_logo(company_id: str):
    """Get company logo"""
    # Find logo file
    for ext in ['.png', '.jpg', '.jpeg', '.gif']:
        file_path = UPLOAD_DIR / f"logo_{company_id}{ext}"
        if file_path.exists():
            return FileResponse(path=file_path, media_type=f"image/{ext[1:]}")

    raise HTTPException(status_code=404, detail="Logo not found")


# ============ Document Routes ============

@api_router.get("/documents/{company_id}", response_model=List[Document])
async def get_documents(company_id: str, current_user: User = Depends(get_current_user)):
    """Get all documents for a company"""
    # Verify company belongs to user
    company = await db.companies.find_one(
        {"company_id": company_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    documents = await db.documents.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    return documents


@api_router.post("/documents/upload")
async def upload_document(
    company_id: str = Form(...),
    document_type: str = Form(...),
    document_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload document for company"""
    # Verify company belongs to user
    company = await db.companies.find_one(
        {"company_id": company_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Generate unique filename
    file_extension = Path(file.filename).suffix if file.filename else ""
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    # Save file
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)

        file_size = len(content)
    except Exception as e:
        logger.error(f"Error saving file: {str(e)}")
        raise HTTPException(status_code=500, detail="Error saving file")

    # Create document record
    document = Document(
        company_id=company_id,
        document_type=document_type,
        document_name=document_name,
        file_name=file.filename or "unknown",
        file_path=str(file_path),
        file_size=file_size
    )

    doc = document.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.documents.insert_one(doc)
    logger.info(f"Document uploaded: {document.document_id}")
    return document


@api_router.get("/documents/download/{document_id}")
async def download_document(document_id: str, current_user: User = Depends(get_current_user)):
    """Download document"""
    # Get document
    document = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user owns the company
    company = await db.companies.find_one(
        {"company_id": document["company_id"], "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not company:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if file exists
    file_path = Path(document["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=document["file_name"],
        media_type="application/octet-stream"
    )


@api_router.patch("/documents/{document_id}/status")
async def update_document_status(
    document_id: str,
    status: str,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Update document status"""
    update_data = {"status": status}
    if notes:
        update_data["notes"] = notes

    result = await db.documents.update_one(
        {"document_id": document_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Status updated"}


# ============ Portaria Routes ============

@api_router.get("/portarias", response_model=List[Portaria])
async def get_portarias(current_user: User = Depends(get_current_user)):
    """Get all portarias"""
    portarias = await db.portarias.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    return portarias


@api_router.post("/portarias", response_model=Portaria)
async def create_portaria(portaria_data: PortariaCreate, current_user: User = Depends(get_current_user)):
    """Create new portaria"""
    portaria = Portaria(**portaria_data.model_dump())

    doc = portaria.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.portarias.insert_one(doc)
    return portaria


@api_router.post("/portarias/analyze")
async def analyze_portaria(analyze_data: AnalyzeRequest, current_user: User = Depends(get_current_user)):
    """Analyze portaria text with AI"""
    raise HTTPException(status_code=501, detail="Análise por IA temporariamente indisponível (integração LLM não configurada)")


@api_router.get("/portarias/search")
async def search_portarias(q: str, current_user: User = Depends(get_current_user)):
    """Search portarias by keyword"""
    portarias = await db.portarias.find(
        {"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"detran": {"$regex": q, "$options": "i"}}
        ]},
        {"_id": 0}
    ).to_list(100)
    return portarias


# =========== Querido Diario Integration ===========

@api_router.get("/portarias/queridodiario")
async def buscar_portarias_queridodiario(
    territory_id: str,
    querystring: str = "portaria credenciamento registradora",
    published_since: Optional[str] = None,
    published_until: Optional[str] = None,
    size: int = 10,
    current_user: User = Depends(get_current_user)
):
    """Busca portarias no Querido Diario (Diarios Oficiais brasileiros)"""
    QD_URL = "https://api.queridodiario.ok.org.br/gazettes"
    params = {
        "territory_ids": territory_id,
        "querystring": querystring,
        "excerpt_size": 500,
        "number_of_excerpts": 1,
        "size": size,
    }
    if published_since:
        params["published_since"] = published_since
    if published_until:
        params["published_until"] = published_until
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(QD_URL, params=params)
            response.raise_for_status()
            data = response.json()
            return {
                "total": data.get("total_gazettes", 0),
                "resultados": data.get("gazettes", []),
                "fonte": "Querido Diario",
                "territory_id": territory_id,
                "querystring": querystring,
            }
    except httpx.HTTPError as e:
        logging.error(f"Erro ao consultar Querido Diario: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Querido Diario: {str(e)}")



# ============ Estados/Credenciamento Routes ============

@api_router.get("/estados")
async def get_estados(current_user: User = Depends(get_current_user)):
    """Get all estados with credenciamento info"""
    estados_brasil = [
        {"sigla": "AC", "nome": "Acre"},
        {"sigla": "AL", "nome": "Alagoas"},
        {"sigla": "AP", "nome": "Amapá"},
        {"sigla": "AM", "nome": "Amazonas"},
        {"sigla": "BA", "nome": "Bahia"},
        {"sigla": "CE", "nome": "Ceará"},
        {"sigla": "DF", "nome": "Distrito Federal"},
        {"sigla": "ES", "nome": "Espírito Santo"},
        {"sigla": "GO", "nome": "Goiás"},
        {"sigla": "MA", "nome": "Maranhão"},
        {"sigla": "MT", "nome": "Mato Grosso"},
        {"sigla": "MS", "nome": "Mato Grosso do Sul"},
        {"sigla": "MG", "nome": "Minas Gerais"},
        {"sigla": "PA", "nome": "Pará"},
        {"sigla": "PB", "nome": "Paraíba"},
        {"sigla": "PR", "nome": "Paraná"},
        {"sigla": "PE", "nome": "Pernambuco"},
        {"sigla": "PI", "nome": "Piauí"},
        {"sigla": "RJ", "nome": "Rio de Janeiro"},
        {"sigla": "RN", "nome": "Rio Grande do Norte"},
        {"sigla": "RS", "nome": "Rio Grande do Sul"},
        {"sigla": "RO", "nome": "Rondônia"},
        {"sigla": "RR", "nome": "Roraima"},
        {"sigla": "SC", "nome": "Santa Catarina"},
        {"sigla": "SP", "nome": "São Paulo"},
        {"sigla": "SE", "nome": "Sergipe"},
        {"sigla": "TO", "nome": "Tocantins"}
    ]

    # Get credenciamento count for each state
    for estado in estados_brasil:
        count = await db.credenciamentos.count_documents({"estado_sigla": estado["sigla"]})
        estado["empresas_credenciadas_count"] = count

    return estados_brasil


@api_router.get("/estados/{sigla}")
async def get_estado_detalhes(sigla: str, current_user: User = Depends(get_current_user)):
    """Get detailed info for a specific state"""
    # Get all credenciamentos for this state
    credenciamentos = await db.credenciamentos.find({"estado_sigla": sigla}, {"_id": 0}).to_list(100)

    # Get company details for each credenciamento
    empresas = []
    for cred in credenciamentos:
        company = await db.companies.find_one({"company_id": cred["company_id"]}, {"_id": 0})
        if company:
            empresas.append({
                "company_id": company["company_id"],
                "name": company["name"],
                "nome_fantasia": company["nome_fantasia"],
                "credenciamento": cred
            })

    return {
        "estado_sigla": sigla,
        "empresas_credenciadas": empresas,
        "total_empresas": len(empresas)
    }


# ============ System Users Routes ============

@api_router.get("/system-users")
async def get_system_users(current_user: User = Depends(get_current_user)):
    """Get all system users"""
    users = await db.system_users.find({}, {"_id": 0}).to_list(100)
    return users


@api_router.post("/system-users")
async def create_system_user(user_data: SystemUserCreate, current_user: User = Depends(get_current_user)):
    """Create new system user"""
    system_user = SystemUser(**user_data.model_dump())

    doc = system_user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.system_users.insert_one(doc)
    return system_user


@api_router.delete("/system-users/{system_user_id}")
async def delete_system_user(system_user_id: str, current_user: User = Depends(get_current_user)):
    """Delete system user"""
    result = await db.system_users.delete_one({"system_user_id": system_user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


@api_router.patch("/system-users/{system_user_id}")
async def update_system_user(system_user_id: str, updates: dict, current_user: User = Depends(get_current_user)):
    """Update system user"""
    result = await db.system_users.update_one(
        {"system_user_id": system_user_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated"}


# ============ Dashboard Stats ============

@api_router.get("/stats")
async def get_stats(current_user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    total_companies = await db.companies.count_documents({"user_id": current_user.user_id})
    pending_companies = await db.companies.count_documents({"user_id": current_user.user_id, "status": "pending"})
    approved_companies = await db.companies.count_documents({"user_id": current_user.user_id, "status": "approved"})
    total_portarias = await db.portarias.count_documents({})

    return {
        "total_companies": total_companies,
        "pending_companies": pending_companies,
        "approved_companies": approved_companies,
        "total_portarias": total_portarias
    }


# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "SIGCR API v1.0"}


# Include the router in the main app
#  ADMIN: Gestão de Usuários via Keycloak Admin API

SIGCR_ROLES = ["registradora", "detran", "detran_admin", "financeira", "sigcr_admin"]

async def get_kc_admin_token():
    """Obtém token de admin do Keycloak via password grant no realm master."""
    import httpx
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{KC_INTERNAL_URL}/realms/master/protocol/openid-connect/token",
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": KEYCLOAK_ADMIN_USER,
                "password": KEYCLOAK_ADMIN_PASS,
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


def _extract_perfil(roles: list) -> str:
    for r in ["sigcr_admin", "detran_admin", "detran", "registradora", "financeira"]:
        if r in roles:
            return r
    return "registradora"


@api_router.get("/admin/usuarios")
async def listar_usuarios(current_user: User = Depends(get_current_user)):
    if current_user.perfil != "sigcr_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador SIGCR")
    import httpx
    token = await get_kc_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        # Busca usuários
        r = await client.get(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users?max=200",
            headers=headers,
        )
        r.raise_for_status()
        users = r.json()
        result = []
        for u in users:
            # Busca roles de cada usuário
            rr = await client.get(
                f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{u['id']}/role-mappings/realm",
                headers=headers,
            )
            roles = [x["name"] for x in rr.json()] if rr.status_code == 200 else []
            sigcr_roles = [x for x in roles if x in SIGCR_ROLES]
            perfil = _extract_perfil(sigcr_roles)
            result.append({
                "id": u["id"],
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "firstName": u.get("firstName", ""),
                "lastName": u.get("lastName", ""),
                "enabled": u.get("enabled", True),
                "perfil": perfil,
                "roles": sigcr_roles,
                "uf": u.get("attributes", {}).get("detran_uf", [None])[0],
            })
    return result


class NovoUsuarioPayload(BaseModel):
    username: str
    email: str
    firstName: str = ""
    lastName: str = ""
    password: str
    role: str = "registradora"
    uf: str = ""
    enabled: bool = True


@api_router.post("/admin/usuarios")
async def criar_usuario(payload: NovoUsuarioPayload, current_user: User = Depends(get_current_user)):
    if current_user.perfil != "sigcr_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador SIGCR")
    # Hierarquia LGPD — cada perfil só pode criar abaixo do seu nível
    CRIACAO_PERMITIDA = {
        "sigcr_admin":   ["registradora", "detran", "detran_admin", "financeira", "sigcr_admin"],
        "detran_admin":  ["registradora", "detran"],
        "detran":        ["registradora"],
        "registradora":  ["financeira"],
        "financeira":    [],
    }
    perfil_criador = current_user.perfil or "financeira"
    roles_criador = CRIACAO_PERMITIDA.get(perfil_criador, [])
    if payload.role not in roles_criador:
        raise HTTPException(
            status_code=403,
            detail=f"Perfil '{perfil_criador}' não pode criar usuários com role '{payload.role}'"
        )
    if payload.role not in SIGCR_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida: {payload.role}")
    import httpx
    token = await get_kc_admin_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    user_data = {
        "username": payload.username,
        "email": payload.email,
        "firstName": payload.firstName,
        "lastName": payload.lastName,
        "enabled": payload.enabled,
        "credentials": [{"type": "password", "value": payload.password, "temporary": False}],
    }
    if payload.uf:
        user_data["attributes"] = {"detran_uf": [payload.uf]}
    async with httpx.AsyncClient() as client:
        # Cria usuário
        r = await client.post(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users",
            headers=headers,
            json=user_data,
        )
        if r.status_code == 409:
            raise HTTPException(status_code=409, detail="Username ou e-mail já existe")
        r.raise_for_status()
        # Busca ID do usuário criado
        ru = await client.get(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users?username={payload.username}&exact=true",
            headers=headers,
        )
        users = ru.json()
        if not users:
            raise HTTPException(status_code=500, detail="Usuário criado mas não encontrado")
        user_id = users[0]["id"]
        # Busca role object
        rr = await client.get(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/roles/{payload.role}",
            headers=headers,
        )
        rr.raise_for_status()
        role_obj = rr.json()
        # Atribui role
        await client.post(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm",
            headers=headers,
            json=[role_obj],
        )
    return {"message": "Usuário criado com sucesso", "user_id": user_id}


@api_router.delete("/admin/usuarios/{user_id}")
async def deletar_usuario(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.perfil != "sigcr_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador SIGCR")
    import httpx
    token = await get_kc_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}",
            headers=headers,
        )
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        r.raise_for_status()
    return {"message": "Usuário removido com sucesso"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ============ SEMÁFORO DE COMPLIANCE (v2.1) ============

from datetime import date

def calcular_status_documento(doc: dict) -> str:
    """Verde, Amarelo ou Vermelho baseado no vencimento"""
    vencimento = doc.get("vencimento")
    if not vencimento:
        return "sem_vencimento"
    try:
        if isinstance(vencimento, str):
            venc_date = datetime.fromisoformat(vencimento).date()
        else:
            venc_date = vencimento.date() if hasattr(vencimento, 'date') else vencimento
        hoje = date.today()
        diff = (venc_date - hoje).days
        if diff < 0:
            return "vencido"       # 🔴 Vermelho
        elif diff <= 30:
            return "vencendo"      # 🟡 Amarelo
        else:
            return "valido"        # 🟢 Verde
    except:
        return "sem_vencimento"


@api_router.get("/compliance/{company_id}")
async def get_compliance(company_id: str, current_user: User = Depends(get_current_user)):
    """Retorna status de compliance da empresa com semáforo"""
    docs = await db.documents.find({"company_id": company_id}, {"_id": 0}).to_list(100)

    certidoes_criticas = ["cnpj", "certidao_fiscal", "certidao_fgts", "certidao_trabalhista"]
    status_geral = "valido"
    bloqueada = False
    resumo = []

    for doc in docs:
        status = calcular_status_documento(doc)
        doc["status_vencimento"] = status
        resumo.append({
            "document_id": doc["document_id"],
            "document_name": doc["document_name"],
            "document_type": doc["document_type"],
            "status_vencimento": status,
            "vencimento": doc.get("vencimento")
        })
        if status == "vencido":
            status_geral = "vencido"
            if doc["document_type"] in certidoes_criticas:
                bloqueada = True
        elif status == "vencendo" and status_geral != "vencido":
            status_geral = "vencendo"

    return {
        "company_id": company_id,
        "status_geral": status_geral,
        "bloqueada_novos_editais": bloqueada,
        "documentos": resumo,
        "total": len(docs),
        "vencidos": len([d for d in resumo if d["status_vencimento"] == "vencido"]),
        "vencendo": len([d for d in resumo if d["status_vencimento"] == "vencendo"]),
        "validos": len([d for d in resumo if d["status_vencimento"] == "valido"]),
    }


@api_router.get("/compliance-geral")
async def get_compliance_geral(current_user: User = Depends(get_current_user)):
    """Visão geral de compliance de todas as empresas do usuário"""
    companies = await db.companies.find({"user_id": current_user.user_id}, {"_id": 0}).to_list(100)
    resultado = []
    for company in companies:
        docs = await db.documents.find({"company_id": company["company_id"]}, {"_id": 0}).to_list(100)
        vencidos = 0
        vencendo = 0
        for doc in docs:
            status = calcular_status_documento(doc)
            if status == "vencido": vencidos += 1
            elif status == "vencendo": vencendo += 1
        if vencidos > 0:
            status_geral = "vencido"
        elif vencendo > 0:
            status_geral = "vencendo"
        else:
            status_geral = "valido"
        resultado.append({
            "company_id": company["company_id"],
            "name": company["name"],
            "status_geral": status_geral,
            "vencidos": vencidos,
            "vencendo": vencendo,
            "total_docs": len(docs)
        })
    return resultado


@api_router.patch("/documents/{document_id}/vencimento")
async def set_vencimento(document_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Define data de vencimento de um documento"""
    body = await request.json()
    vencimento = body.get("vencimento")
    result = await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {"vencimento": vencimento}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return {"message": "Vencimento atualizado"}


# ============ LOG DE AUDITORIA (v2.1) ============

class AuditoriaLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    user_email: str
    acao: str
    entidade: str
    entidade_id: str
    detalhes: Optional[dict] = None
    ip: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def registrar_auditoria(
    user: User,
    acao: str,
    entidade: str,
    entidade_id: str,
    detalhes: dict = None,
    ip: str = None
):
    """Registra ação no log de auditoria imutável"""
    log = {
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "user_email": user.email,
        "user_name": user.name,
        "acao": acao,
        "entidade": entidade,
        "entidade_id": entidade_id,
        "detalhes": detalhes or {},
        "ip": ip,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.auditoria.insert_one(log)


@api_router.get("/auditoria")
async def get_auditoria(
    entidade: Optional[str] = None,
    entidade_id: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Retorna log de auditoria — admin vê tudo, outros veem o seu"""
    query = {}
    if current_user.perfil not in ["sigcr_admin", "detran_admin"]:
        query["user_id"] = current_user.user_id
    if entidade:
        query["entidade"] = entidade
    if entidade_id:
        query["entidade_id"] = entidade_id
    logs = await db.auditoria.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs


@api_router.get("/auditoria/{entidade_id}")
async def get_auditoria_entidade(
    entidade_id: str,
    current_user: User = Depends(get_current_user)
):
    """Histórico completo de uma entidade específica"""
    logs = await db.auditoria.find(
        {"entidade_id": entidade_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return logs


# ============ EDITAIS ============

@api_router.get("/editais")
async def get_editais(current_user: User = Depends(get_current_user)):
    editais = await db.editais.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return editais

@api_router.post("/editais")
async def create_edital(request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    edital = {
        "edital_id": f"edital_{uuid.uuid4().hex[:12]}",
        "titulo": body.get("titulo"),
        "descricao": body.get("descricao"),
        "uf": body.get("uf"),
        "status": "aberto",
        "data_encerramento": body.get("data_encerramento"),
        "documentos_obrigatorios": body.get("documentos_obrigatorios", []),
        "criado_por": current_user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.editais.insert_one(edital)
    await registrar_auditoria(current_user, "criar_edital", "edital", edital["edital_id"], {"titulo": edital["titulo"]})
    return edital


# ============ SOLICITAÇÕES ============

@api_router.get("/solicitacoes")
async def get_solicitacoes(current_user: User = Depends(get_current_user)):
    if current_user.perfil in ["detran", "detran_admin", "sigcr_admin"]:
        query = {}
    else:
        query = {"user_id": current_user.user_id}
    solicitacoes = await db.solicitacoes.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return solicitacoes

@api_router.post("/solicitacoes")
async def create_solicitacao(request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    sol = {
        "solicitacao_id": f"sol_{uuid.uuid4().hex[:12]}",
        "edital_id": body.get("edital_id"),
        "company_id": body.get("company_id"),
        "user_id": current_user.user_id,
        "uf": body.get("uf"),
        "status": "rascunho",
        "etapa_atual": "Documentação",
        "progresso": 10,
        "observacoes_detran": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.solicitacoes.insert_one(sol)
    await registrar_auditoria(current_user, "criar_solicitacao", "solicitacao", sol["solicitacao_id"])
    return sol

@api_router.post("/solicitacoes/{solicitacao_id}/submeter")
async def submeter_solicitacao(solicitacao_id: str, current_user: User = Depends(get_current_user)):
    result = await db.solicitacoes.update_one(
        {"solicitacao_id": solicitacao_id},
        {"$set": {"status": "submetida", "etapa_atual": "Análise DETRAN", "progresso": 40}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    await registrar_auditoria(current_user, "submeter_solicitacao", "solicitacao", solicitacao_id)
    return {"message": "Solicitação submetida ao DETRAN"}

@api_router.patch("/solicitacoes/{solicitacao_id}/status")
async def atualizar_status_solicitacao(solicitacao_id: str, request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    status = body.get("status")
    obs = body.get("observacoes")
    progresso = {"em_analise": 60, "aprovada": 100, "rejeitada": 0}.get(status, 50)
    await db.solicitacoes.update_one(
        {"solicitacao_id": solicitacao_id},
        {"$set": {"status": status, "observacoes_detran": obs, "progresso": progresso}}
    )
    await registrar_auditoria(current_user, f"status_{status}", "solicitacao", solicitacao_id, {"observacoes": obs})
    return {"message": f"Status atualizado para {status}"}


# ============ NOTIFICAÇÕES ============

@api_router.get("/notificacoes")
async def get_notificacoes(current_user: User = Depends(get_current_user)):
    notifs = await db.notificacoes.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return notifs

@api_router.patch("/notificacoes/{notificacao_id}/lida")
async def marcar_lida(notificacao_id: str, current_user: User = Depends(get_current_user)):
    await db.notificacoes.update_one(
        {"notificacao_id": notificacao_id, "user_id": current_user.user_id},
        {"$set": {"lida": True}}
    )
    return {"message": "Marcada como lida"}

@api_router.patch("/notificacoes/todas/lidas")
async def marcar_todas_lidas(current_user: User = Depends(get_current_user)):
    await db.notificacoes.update_many(
        {"user_id": current_user.user_id},
        {"$set": {"lida": True}}
    )
    return {"message": "Todas marcadas como lidas"}


async def criar_notificacao(user_id: str, tipo: str, titulo: str, mensagem: str, dados: dict = None):
    """Cria uma notificação para um usuário"""
    notif = {
        "notificacao_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "tipo": tipo,
        "titulo": titulo,
        "mensagem": mensagem,
        "dados": dados or {},
        "lida": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notificacoes.insert_one(notif)
    return notif


# ============ MAPA NACIONAL ============

@api_router.get("/mapa-nacional")
async def get_mapa_nacional(current_user: User = Depends(get_current_user)):
    ufs = [
        "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
        "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
        "RS","RO","RR","SC","SP","SE","TO"
    ]
    nomes = {
        "AC":"Acre","AL":"Alagoas","AP":"Amapá","AM":"Amazonas","BA":"Bahia",
        "CE":"Ceará","DF":"Distrito Federal","ES":"Espírito Santo","GO":"Goiás",
        "MA":"Maranhão","MT":"Mato Grosso","MS":"Mato Grosso do Sul","MG":"Minas Gerais",
        "PA":"Pará","PB":"Paraíba","PR":"Paraná","PE":"Pernambuco","PI":"Piauí",
        "RJ":"Rio de Janeiro","RN":"Rio Grande do Norte","RS":"Rio Grande do Sul",
        "RO":"Rondônia","RR":"Roraima","SC":"Santa Catarina","SP":"São Paulo",
        "SE":"Sergipe","TO":"Tocantins"
    }
    resultado = []
    for uf in ufs:
        editais_ativos = await db.editais.count_documents({"uf": uf, "status": "aberto"})
        aprovadas = await db.solicitacoes.count_documents({"uf": uf, "status": "aprovada"})
        em_processo = await db.solicitacoes.count_documents({"uf": uf, "status": {"$in": ["submetida","em_analise"]}})
        if aprovadas > 0:
            status_mapa = "credenciada"
        elif editais_ativos > 0:
            status_mapa = "edital_aberto"
        elif em_processo > 0:
            status_mapa = "em_processo"
        else:
            status_mapa = "sem_edital"
        resultado.append({
            "sigla": uf,
            "nome": nomes.get(uf, uf),
            "status_mapa": status_mapa,
            "editais_ativos": editais_ativos,
            "aprovadas": aprovadas,
        })
    return resultado


# ============ MÓDULO CRIAR EVENTO (Semana 2) ============

TEMPLATES_EVENTO = {
    "credenciamento": {
        "nome": "Credenciamento",
        "descricao": "Habilitação técnica e documental contínua de registradoras",
        "cor": "orange",
        "icone": "shield",
        "documentos_padrao": [
            "CNPJ", "Certidão Fiscal Federal", "Certidão FGTS",
            "Certidão Trabalhista", "Contrato Social", "Alvará Municipal",
            "ISO 27001", "Atestado Técnico", "Balanço Patrimonial"
        ],
        "timeline_padrao": [
            {"etapa": "Publicação", "dias_corridos": 0},
            {"etapa": "Prazo de Impugnação", "dias_corridos": 5},
            {"etapa": "Abertura de Inscrições", "dias_corridos": 10},
            {"etapa": "Encerramento de Inscrições", "dias_corridos": 30},
            {"etapa": "Análise Documental", "dias_corridos": 45},
            {"etapa": "Resultado Preliminar", "dias_corridos": 55},
            {"etapa": "Recursos", "dias_corridos": 60},
            {"etapa": "Homologação", "dias_corridos": 70},
        ]
    },
    "licitacao": {
        "nome": "Licitação",
        "descricao": "Processo licitatório conforme Lei 14.133/21",
        "cor": "blue",
        "icone": "gavel",
        "documentos_padrao": [
            "CNPJ", "Certidão Fiscal Federal", "Certidão FGTS",
            "Certidão Trabalhista", "Proposta Comercial", "Garantia de Proposta"
        ],
        "timeline_padrao": [
            {"etapa": "Publicação do Edital", "dias_corridos": 0},
            {"etapa": "Prazo de Impugnação", "dias_corridos": 3},
            {"etapa": "Sessão de Abertura", "dias_corridos": 15},
            {"etapa": "Fase de Lances", "dias_corridos": 15},
            {"etapa": "Julgamento", "dias_corridos": 16},
            {"etapa": "Habilitação", "dias_corridos": 20},
            {"etapa": "Resultado Definitivo", "dias_corridos": 25},
            {"etapa": "Homologação", "dias_corridos": 30},
        ]
    },
    "dispensa": {
        "nome": "Dispensa Eletrônica",
        "descricao": "Contratação direta simplificada para valores permitidos",
        "cor": "emerald",
        "icone": "zap",
        "documentos_padrao": [
            "CNPJ", "Certidão Fiscal Federal", "Proposta Comercial"
        ],
        "timeline_padrao": [
            {"etapa": "Publicação", "dias_corridos": 0},
            {"etapa": "Recebimento de Propostas", "dias_corridos": 3},
            {"etapa": "Julgamento", "dias_corridos": 5},
            {"etapa": "Contratação", "dias_corridos": 7},
        ]
    },
    "chamamento": {
        "nome": "Chamamento Público",
        "descricao": "Seleção de parceiros para convênios e parcerias",
        "cor": "purple",
        "icone": "users",
        "documentos_padrao": [
            "CNPJ", "Certidão Fiscal Federal", "Estatuto Social",
            "Plano de Trabalho", "Certidão de Regularidade"
        ],
        "timeline_padrao": [
            {"etapa": "Publicação", "dias_corridos": 0},
            {"etapa": "Prazo de Inscrição", "dias_corridos": 20},
            {"etapa": "Análise das Propostas", "dias_corridos": 35},
            {"etapa": "Resultado Preliminar", "dias_corridos": 40},
            {"etapa": "Recursos", "dias_corridos": 45},
            {"etapa": "Resultado Final", "dias_corridos": 50},
            {"etapa": "Celebração", "dias_corridos": 60},
        ]
    }
}


@api_router.get("/eventos/templates")
async def get_templates(current_user: User = Depends(get_current_user)):
    return TEMPLATES_EVENTO


@api_router.post("/eventos")
async def criar_evento(request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    template_key = body.get("template", "credenciamento")
    template = TEMPLATES_EVENTO.get(template_key, TEMPLATES_EVENTO["credenciamento"])
    token_publico = uuid.uuid4().hex[:16]
    evento_id = f"evt_{uuid.uuid4().hex[:12]}"

    # Calcula datas da timeline baseado na data de abertura
    data_abertura_str = body.get("data_abertura")
    timeline_calculada = []
    if data_abertura_str:
        try:
            from datetime import timedelta
            data_base = datetime.fromisoformat(data_abertura_str.replace('Z', '+00:00'))
            for item in body.get("timeline", template["timeline_padrao"]):
                data_etapa = data_base + timedelta(days=item.get("dias_corridos", 0))
                timeline_calculada.append({
                    "etapa": item["etapa"],
                    "dias_corridos": item.get("dias_corridos", 0),
                    "data": data_etapa.isoformat(),
                    "concluida": False
                })
        except:
            timeline_calculada = body.get("timeline", template["timeline_padrao"])

    evento = {
        "evento_id": evento_id,
        "titulo": body.get("titulo"),
        "descricao": body.get("descricao", template["descricao"]),
        "template": template_key,
        "template_nome": template["nome"],
        "uf": body.get("uf"),
        "orgao": body.get("orgao", ""),
        "status": "rascunho",
        "documentos_obrigatorios": body.get("documentos_obrigatorios", template["documentos_padrao"]),
        "timeline": timeline_calculada,
        "data_abertura": body.get("data_abertura"),
        "data_encerramento": body.get("data_encerramento"),
        "token_publico": token_publico,
        "link_publico": f"https://sigcr.com.br/evento-publico/{token_publico}",
        "criado_por": current_user.user_id,
        "criado_por_nome": current_user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "publicado_at": None,
    }

    await db.eventos.insert_one(evento)
    await registrar_auditoria(current_user, "criar_evento", "evento", evento_id, {
        "titulo": evento["titulo"], "template": template_key
    })
    return evento


@api_router.get("/eventos")
async def get_eventos(current_user: User = Depends(get_current_user)):
    if current_user.perfil == "sigcr_admin":
        query = {}
    elif current_user.perfil in ["detran", "detran_admin"]:
        query = {"criado_por": current_user.user_id}
    else:
        query = {"status": "publicado"}
    eventos = await db.eventos.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return eventos


@api_router.get("/eventos/publico/{token}")
async def get_evento_publico(token: str):
    evento = await db.eventos.find_one({"token_publico": token}, {"_id": 0})
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    return evento


@api_router.get("/eventos/{evento_id}")
async def get_evento(evento_id: str, current_user: User = Depends(get_current_user)):
    evento = await db.eventos.find_one({"evento_id": evento_id}, {"_id": 0})
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    return evento


@api_router.patch("/eventos/{evento_id}/publicar")
async def publicar_evento(evento_id: str, current_user: User = Depends(get_current_user)):
    evento = await db.eventos.find_one({"evento_id": evento_id}, {"_id": 0})
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    await db.eventos.update_one(
        {"evento_id": evento_id},
        {"$set": {"status": "publicado", "publicado_at": datetime.now(timezone.utc).isoformat()}}
    )
    # Notifica registradoras sobre novo edital
    registradoras = await db.users.find({"perfil": "registradora"}, {"_id": 0, "user_id": 1}).to_list(1000)
    for u in registradoras:
        await criar_notificacao(
            u["user_id"], "novo_edital",
            f"Novo Evento — {evento['template_nome']} DETRAN-{evento.get('uf', '')}",
            f"Evento publicado: {evento['titulo']}",
            {"evento_id": evento_id}
        )
    await registrar_auditoria(current_user, "publicar_evento", "evento", evento_id)
    evento_atualizado = await db.eventos.find_one({"evento_id": evento_id}, {"_id": 0})
    return evento_atualizado


@api_router.patch("/eventos/{evento_id}")
async def atualizar_evento(evento_id: str, request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    await db.eventos.update_one({"evento_id": evento_id}, {"$set": body})
    await registrar_auditoria(current_user, "atualizar_evento", "evento", evento_id)
    return {"message": "Evento atualizado"}


@api_router.delete("/eventos/{evento_id}")
async def deletar_evento(evento_id: str, current_user: User = Depends(get_current_user)):
    result = await db.eventos.delete_one({"evento_id": evento_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    return {"message": "Evento removido"}



# ============================================================
# MÓDULO ESTEIRAS DE CREDENCIAMENTO
# ============================================================

class EsteiraEvento(BaseModel):
    etapa_id: int
    status: str = "pendente"
    data: Optional[str] = None
    prazo: Optional[str] = None
    responsavel: Optional[str] = None
    docs: Optional[str] = None
    obs: Optional[str] = None

class EsteiraCreate(BaseModel):
    registradora: str
    cnpj: str
    detran: str
    responsavel: Optional[str] = None

class Esteira(BaseModel):
    model_config = ConfigDict(extra="ignore")
    esteira_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    registradora: str
    cnpj: str
    detran: str
    responsavel: Optional[str] = None
    iniciado_em: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    eventos: List[dict] = Field(default_factory=lambda: [
        {"etapa_id": 1, "status": "em_andamento", "data": datetime.now(timezone.utc).isoformat()[:10], "obs": ""},
        {"etapa_id": 2, "status": "pendente", "data": None, "obs": ""},
        {"etapa_id": 3, "status": "pendente", "data": None, "obs": ""},
        {"etapa_id": 4, "status": "pendente", "data": None, "obs": ""},
        {"etapa_id": 5, "status": "pendente", "data": None, "obs": ""},
    ])


@api_router.get("/esteiras")
async def listar_esteiras(current_user: User = Depends(get_current_user)):
    """Lista todas as esteiras do usuário"""
    esteiras = await db.esteiras.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return esteiras


@api_router.post("/esteiras")
async def criar_esteira(data: EsteiraCreate, current_user: User = Depends(get_current_user)):
    """Cria nova esteira de credenciamento"""
    esteira = Esteira(
        user_id=current_user.user_id,
        registradora=data.registradora,
        cnpj=data.cnpj,
        detran=data.detran,
        responsavel=data.responsavel or current_user.email,
    )
    doc = esteira.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.esteiras.insert_one(doc)
    return esteira


@api_router.get("/esteiras/{esteira_id}")
async def get_esteira(esteira_id: str, current_user: User = Depends(get_current_user)):
    """Retorna uma esteira pelo ID"""
    esteira = await db.esteiras.find_one(
        {"esteira_id": esteira_id, "user_id": current_user.user_id}, {"_id": 0}
    )
    if not esteira:
        raise HTTPException(status_code=404, detail="Esteira não encontrada")
    return esteira


@api_router.patch("/esteiras/{esteira_id}/eventos/{etapa_id}")
async def atualizar_evento_esteira(
    esteira_id: str,
    etapa_id: int,
    evento: EsteiraEvento,
    current_user: User = Depends(get_current_user)
):
    """Atualiza um evento (etapa) dentro da esteira"""
    esteira = await db.esteiras.find_one(
        {"esteira_id": esteira_id, "user_id": current_user.user_id}, {"_id": 0}
    )
    if not esteira:
        raise HTTPException(status_code=404, detail="Esteira não encontrada")

    eventos = esteira.get("eventos", [])
    atualizado = False
    for ev in eventos:
        if ev["etapa_id"] == etapa_id:
            ev.update({k: v for k, v in evento.model_dump().items() if v is not None})
            atualizado = True
            break

    if not atualizado:
        raise HTTPException(status_code=404, detail="Etapa não encontrada na esteira")

    await db.esteiras.update_one(
        {"esteira_id": esteira_id},
        {"$set": {"eventos": eventos, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Evento atualizado com sucesso", "esteira_id": esteira_id, "etapa_id": etapa_id}


@api_router.delete("/esteiras/{esteira_id}")
async def deletar_esteira(esteira_id: str, current_user: User = Depends(get_current_user)):
    """Remove uma esteira"""
    result = await db.esteiras.delete_one(
        {"esteira_id": esteira_id, "user_id": current_user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Esteira não encontrada")
    return {"message": "Esteira removida com sucesso"}


# ============================================================
# MÓDULO DOCUMENTOS — GOV-CRD-001 (v2.2)
# CRUD de documentos de credenciamento da HD Registros, com vínculo
# opcional a estado/DETRAN e à Matriz RACI GOV-CRD-001 (40 atividades).
# ============================================================

DOC_CATEGORIAS = [
    "pedido_credenciamento",
    "espelho_homologacao",
    "societario_juridico",
    "estado_detran",
    "atividade_raci",
]

# Categorias internas da HD Registros — nunca expostas a DETRAN/registradora/financeira
CATEGORIAS_INTERNAS_HD = {"societario_juridico", "atividade_raci"}

UF_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}

ALLOWED_MIME_POR_CATEGORIA = {
    "pedido_credenciamento": {"application/pdf"},
    "espelho_homologacao": {"application/pdf", "image/jpeg", "image/png"},
    "societario_juridico": {
        "application/pdf", "image/jpeg", "image/png",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    "estado_detran": {"application/pdf", "image/jpeg", "image/png"},
    "atividade_raci": {
        "application/pdf", "image/jpeg", "image/png",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
}

TIPOS_SUGERIDOS_DOCUMENTO = {
    "pedido_credenciamento": ["Pedido de Credenciamento", "Ofício de Solicitação", "Formulário de Inscrição"],
    "espelho_homologacao": ["Espelho de Homologação", "Ata de Homologação", "Relatório de POC"],
    "societario_juridico": ["Contrato Social", "Procuração", "Certidão de Regularidade", "Estatuto Social", "Ata de Assembleia"],
    "estado_detran": ["Portaria", "Extrato de Contrato", "Termo de Credenciamento", "Termo de Renovação", "Ofício DETRAN"],
    "atividade_raci": ["Evidência de Execução", "Ata de Aprovação", "Parecer", "Checklist"],
}

MAX_DOC_SIZE = 20 * 1024 * 1024  # 20MB

AREAS_RACI = {
    "DIR": "Diretoria Executiva",
    "CRE": "Gerência de Credenciamento",
    "JUR": "Jurídico",
    "FIN": "Financeiro",
    "RH": "Recursos Humanos",
    "COM": "Comercial",
    "TEC": "Tecnologia",
    "INF": "Infraestrutura",
    "SEG": "Segurança da Informação / Compliance",
    "OPE": "Operações",
    "CLI": "Cliente / Órgão Credenciante",
}

# Matriz RACI GOV-CRD-001 v1.0 (01/06/2026) — transcrita do documento oficial
# fornecido pela HD Registros. Os campos R (Responsável) e A (Aprovador) foram
# conferidos com alta confiança; algumas células C (Consultado) foram
# reconstruídas a partir da extração do PDF e podem conter pequenos desvios
# de coluna. Ajustável via PATCH /api/atividades-raci/{numero}, sem deploy.
ATIVIDADES_RACI_SEED = [
    {"numero": 1, "nome": "Monitorar novos editais", "raci": {"DIR": "I", "CRE": "R", "COM": "C"}},
    {"numero": 2, "nome": "Registrar oportunidade", "raci": {"DIR": "I", "CRE": "R"}},
    {"numero": 3, "nome": "Baixar edital e anexos", "raci": {"DIR": "I", "CRE": "R"}},
    {"numero": 4, "nome": "Estudar requisitos do edital", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "COM": "C", "SEG": "C", "TEC": "C"}},
    {"numero": 5, "nome": "Elaborar parecer de viabilidade", "raci": {"DIR": "A", "CRE": "R", "JUR": "C", "FIN": "C", "COM": "C", "SEG": "C", "TEC": "C"}},
    {"numero": 6, "nome": "Aprovação para participação", "raci": {"DIR": "A", "CRE": "I", "JUR": "I", "FIN": "I", "RH": "I", "COM": "I", "SEG": "I", "TEC": "I"}},
    {"numero": 7, "nome": "Elaborar cronograma", "raci": {"DIR": "I", "CRE": "R", "COM": "C"}},
    {"numero": 8, "nome": "Solicitar documentação às áreas", "raci": {"DIR": "I", "CRE": "R"}},
    {"numero": 9, "nome": "Disponibilizar documentos jurídicos", "raci": {"DIR": "I", "CRE": "C", "JUR": "R"}},
    {"numero": 10, "nome": "Disponibilizar documentos financeiros", "raci": {"DIR": "I", "CRE": "C", "FIN": "R"}},
    {"numero": 11, "nome": "Disponibilizar documentos do RH", "raci": {"DIR": "I", "CRE": "C", "RH": "R"}},
    {"numero": 12, "nome": "Disponibilizar documentos técnicos", "raci": {"DIR": "I", "CRE": "C", "TEC": "R", "INF": "C", "OPE": "C"}},
    {"numero": 13, "nome": "Emitir certidões atualizadas", "raci": {"DIR": "I", "CRE": "C", "JUR": "R", "FIN": "C"}},
    {"numero": 14, "nome": "Conferir validade documental", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "SEG": "C"}},
    {"numero": 15, "nome": "Elaborar declarações", "raci": {"DIR": "I", "CRE": "R", "JUR": "C"}},
    {"numero": 16, "nome": "Elaborar ofícios", "raci": {"DIR": "I", "CRE": "R", "JUR": "C"}},
    {"numero": 17, "nome": "Preencher anexos do edital", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C"}},
    {"numero": 18, "nome": "Revisão documental", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "SEG": "C"}},
    {"numero": 19, "nome": "Aprovação final da documentação", "raci": {"DIR": "A", "CRE": "R", "JUR": "C", "FIN": "C"}},
    {"numero": 20, "nome": "Assinaturas", "raci": {"DIR": "A", "CRE": "R", "JUR": "C"}},
    {"numero": 21, "nome": "Protocolar documentação", "raci": {"DIR": "I", "CRE": "R", "CLI": "C"}},
    {"numero": 22, "nome": "Registrar protocolo", "raci": {"DIR": "I", "CRE": "R"}},
    {"numero": 23, "nome": "Arquivar comprovantes", "raci": {"DIR": "I", "CRE": "R"}},
    {"numero": 24, "nome": "Acompanhar andamento", "raci": {"DIR": "I", "CRE": "R", "CLI": "C"}},
    {"numero": 25, "nome": "Receber diligências", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "SEG": "C", "TEC": "C", "CLI": "C"}},
    {"numero": 26, "nome": "Coordenar respostas", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "SEG": "C", "TEC": "C"}},
    {"numero": 27, "nome": "Enviar complementações", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "CLI": "C"}},
    {"numero": 28, "nome": "Receber convocação técnica", "raci": {"DIR": "I", "CRE": "R", "SEG": "C", "CLI": "C"}},
    {"numero": 29, "nome": "Formalizar handoff para Tecnologia", "raci": {"DIR": "I", "CRE": "R", "TEC": "C"}},
    {"numero": 30, "nome": "Assumir projeto técnico", "raci": {"DIR": "I", "CRE": "I", "TEC": "R"}},
    {"numero": 31, "nome": "Analisar requisitos técnicos", "raci": {"DIR": "I", "CRE": "I", "SEG": "C", "TEC": "R", "INF": "C"}},
    {"numero": 32, "nome": "Desenvolver integrações", "raci": {"DIR": "I", "TEC": "R", "INF": "C"}},
    {"numero": 33, "nome": "Configurar infraestrutura", "raci": {"DIR": "I", "TEC": "C", "INF": "R"}},
    {"numero": 34, "nome": "Preparar ambiente de homologação", "raci": {"DIR": "I", "TEC": "R", "INF": "R"}},
    {"numero": 35, "nome": "Executar POC", "raci": {"DIR": "I", "CRE": "I", "SEG": "C", "TEC": "R", "INF": "C", "OPE": "C", "CLI": "C"}},
    {"numero": 36, "nome": "Corrigir apontamentos", "raci": {"DIR": "I", "SEG": "C", "TEC": "R", "INF": "C", "CLI": "C"}},
    {"numero": 37, "nome": "Obter homologação", "raci": {"DIR": "I", "CRE": "I", "TEC": "R", "OPE": "C", "CLI": "A"}},
    {"numero": 38, "nome": "Configurar produção", "raci": {"DIR": "I", "TEC": "R", "INF": "R", "OPE": "C"}},
    {"numero": 39, "nome": "Iniciar operação", "raci": {"DIR": "I", "CRE": "I", "COM": "C", "SEG": "C", "TEC": "C", "OPE": "R", "CLI": "A"}},
    {"numero": 40, "nome": "Controlar validade do credenciamento", "raci": {"DIR": "I", "CRE": "R", "JUR": "C", "FIN": "C", "COM": "C", "SEG": "C", "OPE": "C"}},
]

FASES_RACI = [
    (1, 6, "Prospecção e Aprovação"),
    (7, 20, "Documentação"),
    (21, 24, "Protocolo e Acompanhamento"),
    (25, 28, "Diligências"),
    (29, 34, "Handoff e Preparação Técnica"),
    (35, 37, "POC e Homologação"),
    (38, 40, "Produção e Renovação"),
]


def _fase_raci(numero: int) -> Optional[str]:
    for inicio, fim, nome in FASES_RACI:
        if inicio <= numero <= fim:
            return nome
    return None


class Documento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    documento_id: str = Field(default_factory=lambda: f"docm_{uuid.uuid4().hex[:12]}")
    categoria: str
    tipo: str
    nome: str
    estado_sigla: Optional[str] = None
    atividade_raci_numero: Optional[int] = None
    file_name: str
    file_path: str
    file_size: int
    content_type: Optional[str] = None
    versao: int = 1
    documento_anterior_id: Optional[str] = None
    uploaded_by: str
    uploaded_by_nome: str
    uploaded_by_email: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class DocumentoUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    notes: Optional[str] = None


def _pode_ver_documento(user: User, doc: dict) -> bool:
    """Hierarquia LGPD de privilégio mínimo: sigcr_admin vê tudo; DETRAN só
    enxerga documentos não-internos do próprio estado; registradora e
    financeira não têm acesso a este módulo (é o dossiê de credenciamento
    da própria HD Registros, não das empresas clientes da plataforma)."""
    if user.perfil == "sigcr_admin":
        return True
    if doc["categoria"] in CATEGORIAS_INTERNAS_HD:
        return False
    if user.perfil in ("detran", "detran_admin"):
        return bool(user.detran_uf) and doc.get("estado_sigla") == user.detran_uf
    return False


async def _checar_permissao_escrita(user: User, categoria: str, estado_sigla: Optional[str]):
    """Quem pode criar/editar/remover documentos: sigcr_admin sempre;
    detran_admin somente para categorias não-internas do próprio estado."""
    if user.perfil == "sigcr_admin":
        return
    if user.perfil == "detran_admin":
        if categoria in CATEGORIAS_INTERNAS_HD:
            raise HTTPException(status_code=403, detail="Perfil detran_admin não pode gerenciar documentos desta categoria")
        if not user.detran_uf or estado_sigla != user.detran_uf:
            raise HTTPException(status_code=403, detail="detran_admin só pode gerenciar documentos do próprio estado")
        return
    raise HTTPException(status_code=403, detail="Perfil sem permissão para gerenciar documentos")


@api_router.get("/documentos/tipos-sugeridos")
async def get_tipos_sugeridos_documento(current_user: User = Depends(get_current_user)):
    return TIPOS_SUGERIDOS_DOCUMENTO


@api_router.get("/atividades-raci")
async def listar_atividades_raci(current_user: User = Depends(get_current_user)):
    atividades = await db.atividades_raci.find({}, {"_id": 0}).sort("numero", 1).to_list(100)
    return {"areas": AREAS_RACI, "atividades": atividades}


@api_router.get("/atividades-raci/{numero}")
async def get_atividade_raci(numero: int, current_user: User = Depends(get_current_user)):
    atividade = await db.atividades_raci.find_one({"numero": numero}, {"_id": 0})
    if not atividade:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    return atividade


@api_router.patch("/atividades-raci/{numero}")
async def atualizar_atividade_raci(numero: int, request: Request, current_user: User = Depends(get_current_user)):
    if current_user.perfil != "sigcr_admin":
        raise HTTPException(status_code=403, detail="Apenas sigcr_admin pode editar a matriz RACI")
    body = await request.json()
    campos = {k: v for k, v in body.items() if k in ("nome", "raci", "fase") and v is not None}
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    result = await db.atividades_raci.update_one({"numero": numero}, {"$set": campos})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    await registrar_auditoria(current_user, "atualizar_atividade_raci", "atividade_raci", str(numero), campos)
    return await db.atividades_raci.find_one({"numero": numero}, {"_id": 0})


@api_router.post("/documentos/upload")
async def upload_documento(
    categoria: str = Form(...),
    tipo: str = Form(...),
    nome: str = Form(...),
    estado_sigla: Optional[str] = Form(None),
    atividade_raci_numero: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    nova_versao_de: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload de documento de credenciamento (multipart). Categorias:
    pedido_credenciamento, espelho_homologacao, societario_juridico,
    estado_detran (exige estado_sigla) e atividade_raci (exige
    atividade_raci_numero, 1-40)."""
    if categoria not in DOC_CATEGORIAS:
        raise HTTPException(status_code=400, detail=f"Categoria inválida. Use uma de: {', '.join(DOC_CATEGORIAS)}")

    if estado_sigla:
        estado_sigla = estado_sigla.upper()
        if estado_sigla not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")

    if categoria == "estado_detran" and not estado_sigla:
        raise HTTPException(status_code=400, detail="estado_sigla é obrigatório para a categoria estado_detran")

    raci_numero = None
    if categoria == "atividade_raci":
        try:
            raci_numero = int(atividade_raci_numero) if atividade_raci_numero else None
        except ValueError:
            raci_numero = None
        if not raci_numero or not (1 <= raci_numero <= 40):
            raise HTTPException(status_code=400, detail="atividade_raci_numero (1-40) é obrigatório para a categoria atividade_raci")
        if not await db.atividades_raci.find_one({"numero": raci_numero}):
            raise HTTPException(status_code=400, detail="Atividade RACI não encontrada")

    await _checar_permissao_escrita(current_user, categoria, estado_sigla)

    allowed = ALLOWED_MIME_POR_CATEGORIA.get(categoria, set())
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido para esta categoria ({file.content_type})")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite de 20MB")

    versao = 1
    documento_anterior_id = None
    if nova_versao_de:
        anterior = await db.documentos_gov.find_one({"documento_id": nova_versao_de, "deleted_at": None}, {"_id": 0})
        if not anterior:
            raise HTTPException(status_code=404, detail="Documento anterior não encontrado (ou já removido)")
        versao = anterior.get("versao", 1) + 1
        documento_anterior_id = nova_versao_de

    doc_upload_dir = UPLOAD_DIR / "documentos"
    doc_upload_dir.mkdir(exist_ok=True)
    file_extension = Path(file.filename).suffix if file.filename else ""
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = doc_upload_dir / unique_filename

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    documento = Documento(
        categoria=categoria,
        tipo=tipo,
        nome=nome,
        estado_sigla=estado_sigla,
        atividade_raci_numero=raci_numero,
        file_name=file.filename or "documento",
        file_path=str(file_path),
        file_size=len(content),
        content_type=file.content_type,
        versao=versao,
        documento_anterior_id=documento_anterior_id,
        uploaded_by=current_user.user_id,
        uploaded_by_nome=current_user.name,
        uploaded_by_email=current_user.email,
        notes=notes,
    )

    doc = documento.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.documentos_gov.insert_one(doc)
    await registrar_auditoria(current_user, "upload_documento", "documento_gov", documento.documento_id, {
        "categoria": categoria, "tipo": tipo, "estado_sigla": estado_sigla, "versao": versao
    })
    return documento


@api_router.get("/documentos")
async def listar_documentos(
    categoria: Optional[str] = None,
    estado_sigla: Optional[str] = None,
    atividade_raci_numero: Optional[int] = None,
    tipo: Optional[str] = None,
    incluir_removidos: bool = False,
    current_user: User = Depends(get_current_user),
):
    query = {}
    if categoria:
        if categoria not in DOC_CATEGORIAS:
            raise HTTPException(status_code=400, detail="Categoria inválida")
        query["categoria"] = categoria
    if estado_sigla:
        query["estado_sigla"] = estado_sigla.upper()
    if atividade_raci_numero:
        query["atividade_raci_numero"] = atividade_raci_numero
    if tipo:
        query["tipo"] = {"$regex": tipo, "$options": "i"}
    if not incluir_removidos:
        query["deleted_at"] = None

    if current_user.perfil == "sigcr_admin":
        pass
    elif current_user.perfil in ("detran", "detran_admin"):
        if not current_user.detran_uf:
            raise HTTPException(status_code=403, detail="Usuário DETRAN sem UF configurada")
        if categoria and categoria in CATEGORIAS_INTERNAS_HD:
            raise HTTPException(status_code=403, detail="Perfil sem acesso a esta categoria")
        if not categoria:
            query["categoria"] = {"$in": list(set(DOC_CATEGORIAS) - CATEGORIAS_INTERNAS_HD)}
        query["estado_sigla"] = current_user.detran_uf
    else:
        raise HTTPException(status_code=403, detail="Perfil sem acesso ao módulo de documentos")

    documentos = await db.documentos_gov.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return documentos


@api_router.get("/documentos/{documento_id}")
async def get_documento(documento_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.documentos_gov.find_one({"documento_id": documento_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not _pode_ver_documento(current_user, doc):
        raise HTTPException(status_code=403, detail="Acesso negado")
    return doc


@api_router.get("/documentos/{documento_id}/download")
async def download_documento(documento_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.documentos_gov.find_one({"documento_id": documento_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not _pode_ver_documento(current_user, doc):
        raise HTTPException(status_code=403, detail="Acesso negado")
    file_path = Path(doc["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no armazenamento")
    await registrar_auditoria(current_user, "download_documento", "documento_gov", documento_id)
    return FileResponse(path=file_path, filename=doc["file_name"], media_type=doc.get("content_type") or "application/octet-stream")


@api_router.get("/documentos/{documento_id}/versoes")
async def historico_versoes_documento(documento_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.documentos_gov.find_one({"documento_id": documento_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not _pode_ver_documento(current_user, doc):
        raise HTTPException(status_code=403, detail="Acesso negado")

    cadeia = {doc["documento_id"]: doc}
    cursor = doc
    while cursor.get("documento_anterior_id"):
        anterior = await db.documentos_gov.find_one({"documento_id": cursor["documento_anterior_id"]}, {"_id": 0})
        if not anterior or anterior["documento_id"] in cadeia:
            break
        cadeia[anterior["documento_id"]] = anterior
        cursor = anterior

    posteriores = await db.documentos_gov.find({"documento_anterior_id": documento_id}, {"_id": 0}).to_list(50)
    for p in posteriores:
        cadeia[p["documento_id"]] = p

    resultado = sorted(cadeia.values(), key=lambda d: d.get("versao", 1))
    return resultado


@api_router.patch("/documentos/{documento_id}")
async def atualizar_documento(documento_id: str, updates: DocumentoUpdate, current_user: User = Depends(get_current_user)):
    doc = await db.documentos_gov.find_one({"documento_id": documento_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado ou removido")
    await _checar_permissao_escrita(current_user, doc["categoria"], doc.get("estado_sigla"))

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return doc

    await db.documentos_gov.update_one({"documento_id": documento_id}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_documento", "documento_gov", documento_id, campos)
    return await db.documentos_gov.find_one({"documento_id": documento_id}, {"_id": 0})


@api_router.delete("/documentos/{documento_id}")
async def remover_documento(documento_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.documentos_gov.find_one({"documento_id": documento_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado ou já removido")
    await _checar_permissao_escrita(current_user, doc["categoria"], doc.get("estado_sigla"))

    await db.documentos_gov.update_one(
        {"documento_id": documento_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "remover_documento", "documento_gov", documento_id)
    return {"message": "Documento removido"}


@app.on_event("startup")
async def seed_atividades_raci():
    """Popula a Matriz RACI GOV-CRD-001 (40 atividades) na primeira execução."""
    if await db.atividades_raci.count_documents({}) > 0:
        return
    docs = []
    for item in ATIVIDADES_RACI_SEED:
        docs.append({
            "numero": item["numero"],
            "nome": item["nome"],
            "raci": item["raci"],
            "area_responsavel": [a for a, letra in item["raci"].items() if letra == "R"],
            "fase": _fase_raci(item["numero"]),
        })
    await db.atividades_raci.insert_many(docs)
    logger.info("Seed: 40 atividades da Matriz RACI GOV-CRD-001 inseridas em atividades_raci")


app.include_router(api_router)
