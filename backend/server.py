from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request, Response, Depends
from fastapi.responses import JSONResponse
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
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
import tempfile
import shutil


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# LLM API Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')


# ============ Models ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
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
    cnpj: str
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CompanyCreate(BaseModel):
    name: str
    cnpj: str


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    document_id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:12]}")
    company_id: str
    document_type: str  # cnpj, licenca, certidao, balanco, iso_27001, iso_27301, etc
    file_name: str
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


# ============ Auth Helper ============

async def get_current_user(request: Request) -> User:
    """Extract user from session_token (cookie or header)"""
    session_token = None
    
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user_doc)


# ============ Auth Routes ============

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for user data and create session"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        
        auth_data = auth_response.json()
    
    # Create or update user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": auth_data["name"],
                "picture": auth_data.get("picture")
            }}
        )
    else:
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
    
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
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
        cnpj=company_data.cnpj
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
    company_id: str = File(...),
    document_type: str = File(...),
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
    
    # Create document record
    document = Document(
        company_id=company_id,
        document_type=document_type,
        file_name=file.filename or "unknown"
    )
    
    doc = document.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.documents.insert_one(doc)
    return document


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
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"analyze_{uuid.uuid4().hex[:8]}",
            system_message="Você é um assistente especializado em análise de portarias do Diário Oficial. Extraia informações relevantes sobre credenciamento de registradoras de contratos de financiamento de veículos."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(
            text=f"""Analise o seguinte texto de portaria e extraia:
            1. Título da portaria
            2. DETRAN mencionado (estado)
            3. Empresas credenciadas ou mencionadas
            4. Data da publicação (se disponível)
            5. Resumo em 2-3 linhas
            
            Texto:
            {analyze_data.text}
            
            Forneça a resposta em formato JSON com as chaves: title, detran, companies (lista), date, summary.
            """
        )
        
        response = await chat.send_message(user_message)
        return {"analysis": response}
    except Exception as e:
        logging.error(f"Error analyzing portaria: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


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
app.include_router(api_router)

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
