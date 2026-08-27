# git-sync-or-die.sh validado end-to-end em 2026-08-12 (PENDING_ACTIONS.md item 18)
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request, Response, Depends, Form, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
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

# Fatia B (2026-08-25, ver PENDING_ACTIONS.md item 25): /docs, /redoc e
# /openapi.json fechados em produção via env — comportamento hoje inalterado
# até ENVIRONMENT=production ou DISABLE_API_DOCS=true serem setados no .env.
_docs_off = (
    os.environ.get("ENVIRONMENT", "").lower() == "production"
    or os.environ.get("DISABLE_API_DOCS", "false").lower() == "true"
)
app = FastAPI(
    docs_url=None if _docs_off else "/docs",
    redoc_url=None if _docs_off else "/redoc",
    openapi_url=None if _docs_off else "/openapi.json",
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Fatia B: rate limiting em memória para endpoints públicos sensíveis
# (login/cadastro fica de fora aqui porque AUTH_MODE=local é Fatia D, ainda
# fora de escopo — hoje só se aplica a /public/cadastro).
_rate_buckets: dict = {}


def _rate_limit(request: Request, bucket: str, max_hits: int, window_s: int):
    import time as _t
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    key = f"{bucket}:{ip}"
    now = _t.time()
    hits = [t for t in _rate_buckets.get(key, []) if now - t < window_s]
    if len(hits) >= max_hits:
        raise HTTPException(status_code=429, detail="Muitas requisições — aguarde alguns instantes")
    hits.append(now)
    _rate_buckets[key] = hits


from validate_docbr import CNPJ as _CNPJValidator
_cnpj_validator = _CNPJValidator()


def _validar_cnpj(cnpj: str):
    if not _cnpj_validator.validate(cnpj):
        raise HTTPException(status_code=400, detail="CNPJ inválido")


async def _verificar_captcha(captcha_token: Optional[str]):
    """CAPTCHA plugável (Cloudflare Turnstile). Sem TURNSTILE_SECRET_KEY na
    env, a verificação fica desativada — ativa só configurando a chave."""
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "")
    if not secret:
        return
    if not captcha_token:
        raise HTTPException(status_code=400, detail="Verificação anti-robô obrigatória")
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": captcha_token},
        )
        if not r.json().get("success"):
            raise HTTPException(status_code=400, detail="Falha na verificação anti-robô")


from email_service import enviar_email

# LLM API Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
# Módulo de vencimento de documentos com OCR (Bloco 1, Lei 14.133) — extração
# via LLM local (Ollama/Llama, container próprio na sigcr-net). Se o Ollama
# não estiver acessível por qualquer motivo, o campo vencimento simplesmente
# fica vazio esperando preenchimento manual (mesmo padrão de indisponibilidade
# de /portarias/analyze) — nunca derruba o upload.
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://sigcr-ollama:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2:3b')

# Keycloak config (used across auth + admin routes)
KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "https://auth.sigcr.com.br")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "sigcr")
KC_INTERNAL_URL = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://sigcr-keycloak:8080")
KEYCLOAK_ADMIN_USER = os.environ.get("KEYCLOAK_ADMIN", "admin")
KEYCLOAK_ADMIN_PASS = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "")

# Cache JWKS global
_jwks_cache = None
_jwks_cache_time = None

# UFs válidas — usado por validação de estado_sigla em documentos, portarias e estados
UF_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}

UF_NOMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}

MAX_PORTARIA_PDF_SIZE = 20 * 1024 * 1024  # 20MB


# ============ Checklist CONTRAN 807 (Registradora) ============
# Catálogo fixo — os itens em si não mudam por empresa, só o status de envio
# (derivado de db.documents via Document.checklist_item_id, não duplicado
# numa coleção própria). item_id é estável de propósito: nunca gerado via
# uuid, pra não perder o vínculo com documentos já enviados a cada restart.

CHECKLIST_CONTRAN_807_BLOCOS = {
    1: "Habilitação Jurídica e Regularidade Fiscal e Trabalhista",
    2: "Qualificação Econômico-Financeira",
    3: "Qualificação Técnica e de Pessoal",
    4: "Infraestrutura, Segurança e Tecnologia",
    5: "Segurança da Informação e LGPD",
    6: "Declaratórias Gerais",
}

CHECKLIST_CONTRAN_807 = [
    # Bloco 1
    {"item_id": "b1_ato_constitutivo", "bloco": 1, "nome": "Ato Constitutivo",
     "descricao": "Contrato social + alterações/consolidação; S/A: ata de eleição da diretoria; sociedade civil: ato constitutivo + prova da diretoria atual."},
    {"item_id": "b1_cnpj", "bloco": 1, "nome": "Inscrição no CNPJ", "descricao": None},
    {"item_id": "b1_inscricao_estadual_municipal", "bloco": 1, "nome": "Inscrição Estadual/Municipal", "descricao": None},
    {"item_id": "b1_certidao_negativa_falencia", "bloco": 1, "nome": "Certidão Negativa de Falência e Recuperação",
     "descricao": "Do distribuidor da sede, emitida com até 30 dias de antecedência."},
    {"item_id": "b1_certidoes_regularidade_fiscal", "bloco": 1, "nome": "Certidões de Regularidade Fiscal",
     "descricao": "Tributos e dívida ativa: Municipal, Estadual e Federal."},
    {"item_id": "b1_fgts", "bloco": 1, "nome": "Certidão de Regularidade do FGTS", "descricao": None},
    {"item_id": "b1_cndt", "bloco": 1, "nome": "CNDT — Certidão Negativa de Débitos Trabalhistas",
     "descricao": "Ou certidão positiva com efeito de negativa."},
    # Bloco 2
    {"item_id": "b2_balanco_patrimonial", "bloco": 2, "nome": "Balanço Patrimonial",
     "descricao": "Último exercício social, na forma da lei — balancetes provisórios não são aceitos."},
    {"item_id": "b2_patrimonio_liquido_minimo", "bloco": 2, "nome": "Comprovação de Patrimônio Líquido Mínimo",
     "descricao": "Mínimo de R$ 5.000.000,00, atualizado por IPCA."},
    # Bloco 3
    {"item_id": "b3_declaracao_estrutura_equipe", "bloco": 3, "nome": "Declaração de Estrutura e Equipe",
     "descricao": "Instalações, hardware/software e equipe qualificada."},
    {"item_id": "b3_certificacao_cissp", "bloco": 3, "nome": "Profissional de TI com Certificação CISSP", "descricao": None},
    {"item_id": "b3_certificacao_itil", "bloco": 3, "nome": "Profissional de TI com Certificação ITIL", "descricao": None},
    {"item_id": "b3_certificacao_cobit", "bloco": 3, "nome": "Profissional de TI com Certificação COBIT", "descricao": None},
    {"item_id": "b3_capacidade_operacional", "bloco": 3, "nome": "Capacidade Operacional Comprovada",
     "descricao": "Mínimo de 60.000 contratos registrados nos últimos 12 meses."},
    {"item_id": "b3_atestado_capacidade_dados_pessoais", "bloco": 3, "nome": "Atestado de Capacidade Técnica em Dados Pessoais",
     "descricao": "Dispensável mediante certificação ISO 27701."},
    # Bloco 4
    {"item_id": "b4_datacenter_disponibilidade", "bloco": 4, "nome": "Comprovação de Datacenter",
     "descricao": "Disponibilidade mensal mínima de 99,0%."},
    {"item_id": "b4_certificacao_tier_iii", "bloco": 4, "nome": "Certificação Tier III",
     "descricao": "Próprio ou terceirizado, com termo de responsabilidade solidária de 5 anos."},
    {"item_id": "b4_link_dedicado", "bloco": 4, "nome": "Declaração de Link Dedicado Exclusivo", "descricao": None},
    {"item_id": "b4_pentest", "bloco": 4, "nome": "Laudo de Pentest Atualizado",
     "descricao": "Últimos 12 meses, metodologia black/grey/white-box."},
    {"item_id": "b4_ia_pln", "bloco": 4, "nome": "Comprovação de Recursos de IA/PLN",
     "descricao": "Busca semântica em contratos."},
    {"item_id": "b4_suporte_tecnico", "bloco": 4, "nome": "Declaração de Suporte Técnico Multicanal", "descricao": None},
    # Bloco 5
    {"item_id": "b5_iso_27001", "bloco": 5, "nome": "Certificação ISO/IEC 27001", "descricao": None},
    {"item_id": "b5_iso_27701", "bloco": 5, "nome": "Certificação ISO/IEC 27701", "descricao": None},
    {"item_id": "b5_conformidade_lgpd", "bloco": 5, "nome": "Laudo/Certidão de Conformidade LGPD", "descricao": None},
    # Bloco 6 — assinadas pelo representante legal
    {"item_id": "b6_requerimento_inicial", "bloco": 6, "nome": "Requerimento Inicial", "descricao": "Com firma reconhecida."},
    {"item_id": "b6_inexistencia_relacao_vedada", "bloco": 6, "nome": "Declaração de Inexistência de Relação Comercial Vedada",
     "descricao": "Empresas impedidas pelo CONTRAN."},
    {"item_id": "b6_aceite_conformidade_edital", "bloco": 6, "nome": "Aceite de Conformidade com o Edital/Portaria", "descricao": None},
    {"item_id": "b6_declaracao_infraestrutura", "bloco": 6, "nome": "Declaração de Infraestrutura", "descricao": None},
    {"item_id": "b6_declaracao_idoneidade", "bloco": 6, "nome": "Declaração de Idoneidade", "descricao": None},
    {"item_id": "b6_incompatibilidade_atividades", "bloco": 6, "nome": "Declaração de Incompatibilidade de Atividades",
     "descricao": "Não presta serviço de anotação de gravame."},
    {"item_id": "b6_termo_representacao_local", "bloco": 6, "nome": "Termo de Representação Local",
     "descricao": "Filial/preposto na circunscrição do órgão."},
]

CHECKLIST_CONTRAN_807_IDS = {item["item_id"] for item in CHECKLIST_CONTRAN_807}

# ============ Checklist DETRAN-DF Edital nº 003/2022 (Financeira) ============
# Credenciamento como Agente Arrecadador. Mesmo catálogo fixo de propósito
# que o CONTRAN 807 acima — item_id estável, nunca via uuid.

CHECKLIST_DETRAN_DF_003_2022_BLOCOS = {
    1: "Habilitação Jurídica",
    2: "Regularidade Fiscal e Trabalhista",
    3: "Qualificação Técnica",
    4: "Declaratórias",
}

CHECKLIST_DETRAN_DF_003_2022 = [
    # Bloco 1
    {"item_id": "fin_b1_ato_constitutivo", "bloco": 1, "nome": "Ato Constitutivo/Contrato Social",
     "descricao": "Sociedade comercial, com ata de eleição da diretoria se S/A."},
    {"item_id": "fin_b1_inscricao_ato_constitutivo", "bloco": 1, "nome": "Inscrição do Ato Constitutivo",
     "descricao": "Sociedades civis, com designação de diretoria."},
    # Bloco 2
    {"item_id": "fin_b2_cnpj", "bloco": 2, "nome": "Inscrição no CNPJ", "descricao": None},
    {"item_id": "fin_b2_inscricao_estadual_municipal", "bloco": 2, "nome": "Inscrição Estadual/Municipal", "descricao": None},
    {"item_id": "fin_b2_certidao_fiscal_federal", "bloco": 2, "nome": "Certidão de Regularidade Fiscal Federal", "descricao": None},
    {"item_id": "fin_b2_certidao_fiscal_estadual", "bloco": 2, "nome": "Certidão de Regularidade Fiscal Estadual/Distrital", "descricao": None},
    {"item_id": "fin_b2_certidao_fiscal_municipal", "bloco": 2, "nome": "Certidão de Regularidade Fiscal Municipal", "descricao": None},
    {"item_id": "fin_b2_inss_fgts", "bloco": 2, "nome": "Regularidade relativa ao INSS e FGTS", "descricao": None},
    {"item_id": "fin_b2_cndt", "bloco": 2, "nome": "CNDT — Certidão Negativa de Débitos Trabalhistas", "descricao": None},
    # Bloco 3
    {"item_id": "fin_b3_autorizacao_bacen", "bloco": 3, "nome": "Comprovação de Autorização do Banco Central do Brasil",
     "descricao": "Banco Comercial, Banco Múltiplo ou Cooperativa de Crédito."},
    # Bloco 4
    {"item_id": "fin_b4_termo_compromisso", "bloco": 4, "nome": "Termo de Compromisso Assinado",
     "descricao": "Equivalente ao Anexo I."},
    {"item_id": "fin_b4_aceite_contrato_credenciamento", "bloco": 4, "nome": "Aceite das Condições do Contrato de Credenciamento", "descricao": None},
]

CHECKLIST_DETRAN_DF_003_2022_IDS = {item["item_id"] for item in CHECKLIST_DETRAN_DF_003_2022}

# ============ Catálogo reutilizável de checklist — fluxo de portaria ============
# Diferente dos catálogos fixos acima (CHECKLIST_CONTRAN_807 etc.), este vive
# na coleção db.checklist_catalogo_portaria: o DETRAN pode adicionar itens
# novos em runtime pela UI de Nova Portaria. Os itens não têm perfil_alvo
# fixo — são exigências genéricas de habilitação de empresa; quem decide se
# um item vale pra Registradora, Financeira ou ambos é o DETRAN, item a item,
# no momento em que monta o checklist de uma portaria específica (ver
# PortariaChecklistItem.perfil_alvo).

BLOCO_PORTARIA_NOMES = {
    1: "Habilitação Jurídica, Fiscal e Trabalhista",
    2: "Qualificação Econômico-Financeira",
    3: "Qualificação Técnica",
}

CHECKLIST_CATALOGO_PORTARIA_SEED = [
    # Bloco I
    {"item_id": "cat_b1_ato_constitutivo", "bloco": 1, "nome": "Ato constitutivo/estatuto/contrato social vigente", "descricao": None, "perfil_alvo": "registradora"},
    {"item_id": "cat_b1_alvara_funcionamento", "bloco": 1, "nome": "Licença/alvará de funcionamento", "descricao": None, "perfil_alvo": "registradora"},
    {"item_id": "cat_b1_cnpj", "bloco": 1, "nome": "Comprovante de inscrição no CNPJ", "descricao": "Situação ativa.", "perfil_alvo": "registradora"},
    {"item_id": "cat_b1_regularidade_fiscal", "bloco": 1, "nome": "Prova de regularidade fiscal", "descricao": "Federal/Estadual ou Distrital/Municipal.", "perfil_alvo": "registradora"},
    {"item_id": "cat_b1_seguridade_fgts", "bloco": 1, "nome": "Prova de regularidade com Seguridade Social e FGTS", "descricao": None, "perfil_alvo": "registradora"},
    {"item_id": "cat_b1_declaracao_unica", "bloco": 1, "nome": "Declaração única de regularidade",
     "descricao": "Documento único cobrindo: (1) não envolvimento do proprietário/sócios em atividades conflitantes, (2) não suspensão de direitos pra licitar/contratar com a administração pública, (3) não inidoneidade junto ao TCU.", "perfil_alvo": "registradora"},
    # Bloco II
    {"item_id": "cat_b2_balanco", "bloco": 2, "nome": "Balanço patrimonial e demonstrações contábeis", "descricao": "Último exercício.", "perfil_alvo": "registradora"},
    {"item_id": "cat_b2_certidao_falencia", "bloco": 2, "nome": "Certidão negativa de falência/concordata ou execução patrimonial", "descricao": None, "perfil_alvo": "registradora"},
    # Bloco III
    {"item_id": "cat_b3_atestado_capacidade_dados", "bloco": 3, "nome": "Atestado de capacidade técnica para tratamento de dados",
     "descricao": "Cobrindo: avaliação de impacto na privacidade, controle de acesso, transparência/direitos dos titulares, criptografia/segurança, gestão de incidentes.", "perfil_alvo": "registradora"},
    {"item_id": "cat_b3_iso27701", "bloco": 3, "nome": "Certificação ISO/IEC 27701", "descricao": None, "perfil_alvo": "registradora"},
    {"item_id": "cat_b3_compliance", "bloco": 3, "nome": "Comprovação de programa de integridade/compliance", "descricao": None, "perfil_alvo": "registradora"},
    {"item_id": "cat_b3_sac", "bloco": 3, "nome": "Declaração de manutenção de SAC", "descricao": "Serviço de Atendimento ao Cliente.", "perfil_alvo": "registradora"},
    {"item_id": "cat_b3_iso27001", "bloco": 3, "nome": "Certificação ISO/IEC 27001", "descricao": "Cobrindo também menções a ITIL/COBIT/CISSP como parte do mesmo documento.", "perfil_alvo": "registradora"},
]


class ChecklistCatalogoItem(BaseModel):
    """Item reutilizável do catálogo de checklist de portaria. perfil_alvo é
    fixo no item do catálogo (ao contrário de PortariaChecklistItem, que
    também tem perfil_alvo mas é o snapshot copiado daqui pra uma portaria
    específica) — os itens seed são todos "registradora" porque é a única
    spec verificada até agora; "financeira" fica pra quando existir spec real.
    item_id é estável de propósito: gerado uma única vez na criação, nunca
    regenerado, pra PortariaChecklistItem.catalogo_item_id não perder o
    vínculo."""
    item_id: str = Field(default_factory=lambda: f"cat_{uuid.uuid4().hex[:10]}")
    bloco: int
    nome: str
    descricao: Optional[str] = None
    perfil_alvo: Literal["registradora", "financeira"]
    ativo: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChecklistCatalogoItemCreate(BaseModel):
    bloco: int
    nome: str
    descricao: Optional[str] = None
    perfil_alvo: Literal["registradora", "financeira"]


class ChecklistCatalogoItemUpdate(BaseModel):
    bloco: Optional[int] = None
    nome: Optional[str] = None
    descricao: Optional[str] = None
    perfil_alvo: Optional[Literal["registradora", "financeira"]] = None


# Fase A: checklist parametrizado por tipo_empresa. "registradora" usa a
# Resolução CONTRAN 807; "financeira" usa o Edital DETRAN-DF nº 003/2022
# (credenciamento como Agente Arrecadador).
CHECKLISTS_POR_TIPO_EMPRESA = {
    "registradora": CHECKLIST_CONTRAN_807,
    "financeira": CHECKLIST_DETRAN_DF_003_2022,
}
CHECKLISTS_BLOCOS_POR_TIPO_EMPRESA = {
    "registradora": CHECKLIST_CONTRAN_807_BLOCOS,
    "financeira": CHECKLIST_DETRAN_DF_003_2022_BLOCOS,
}
CHECKLISTS_IDS_POR_TIPO_EMPRESA = {
    tipo: {item["item_id"] for item in itens} for tipo, itens in CHECKLISTS_POR_TIPO_EMPRESA.items()
}


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
    # Fase 1 (autorização por status de conta): None para perfis internos
    # (sigcr_admin/detran/detran_admin) que não têm companies nem contas_pf.
    tipo_conta: Optional[str] = None       # "empresa" | "pessoa_fisica" | None
    account_status: Optional[str] = None   # espelha companies.status ou contas_pf.status


class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Responsavel(BaseModel):
    """Pessoa física responsável por uma empresa (Financeira/Registradora/DETRAN).
    Introduzido na Fase 0 do cadastro público — Optional em Company até as fases
    de cadastro (3/4) passarem a preenchê-lo; empresas existentes ficam sem isso."""
    nome: str
    cpf: str
    documento_foto_path: str


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
    tipo_empresa: str = "registradora"  # registradora, financeira, detran
    # Fase A: vínculo 1:N — uma registradora tem várias financeiras; só
    # preenchido quando tipo_empresa == "financeira". Validado contra uma
    # registradora ativa de verdade tanto na criação quanto numa atualização
    # posterior — o campo em si aceita qualquer string pra não travar leitura
    # de dados migrados/legados que não passaram por essa validação.
    registradora_id: Optional[str] = None
    # NOTA (Fase 0): default deliberadamente mantido em "pending" (vocabulário antigo) —
    # POST /companies (rota existente, inalterada nesta fase) ainda cria empresas assim.
    # A troca do default para o vocabulário novo (pendente_aprovacao/aprovado_acesso_limitado/
    # ativo_contrato_assinado/rejeitado) e a atualização de quem lê esse default acontece na
    # Fase 1, junto com a camada de autorização por status — trocar aqui sem isso quebraria
    # silenciosamente as contagens de /stats pra empresas novas criadas entre as duas fases.
    # 2026-08-12: achado durante o merge da fatia 2 que o lote pendente já tinha essa troca
    # feita (pra "pendente_aprovacao"), mas não commitada — mantido "pending" aqui de propósito
    # (é o que está rodando em produção agora) até essa mudança ser revisada e deployada
    # separadamente; ver PENDING_ACTIONS.md item 19.
    status: str = "pending"  # legado: pending/approved/rejected. Migrados: pendente_aprovacao/aprovado_acesso_limitado/ativo_contrato_assinado/rejeitado
    responsavel: Optional[Responsavel] = None
    contrato_social_path: Optional[str] = None
    aprovado_por: Optional[str] = None
    aprovado_em: Optional[str] = None
    historico_rejeicoes: List[dict] = []  # Fase 2: cada rejeição vira uma entrada aqui, nunca sobrescrita — permite reenvio pelo mesmo usuário após correção
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class ContaPF(BaseModel):
    """Conta de pessoa física avulsa (Fase 5) — sem vínculo com nenhuma empresa.
    Sem endpoints ainda nesta fase; só a definição de schema + coleção vazia."""
    model_config = ConfigDict(extra="ignore")
    conta_pf_id: str = Field(default_factory=lambda: f"pf_{uuid.uuid4().hex[:12]}")
    user_id: str
    cpf: str
    nome: str
    documento_foto_path: str
    status: str = "pendente_pagamento"  # pendente_pagamento, ativa, inadimplente, cancelada
    stripe_customer_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Assinatura(BaseModel):
    """Assinatura Stripe recorrente de uma ContaPF (Fase 5). Sem endpoints ainda."""
    model_config = ConfigDict(extra="ignore")
    assinatura_id: str = Field(default_factory=lambda: f"assinatura_{uuid.uuid4().hex[:12]}")
    conta_pf_id: str
    stripe_subscription_id: str
    plano: str  # mensal, anual
    status: str = "incomplete"  # active, past_due, canceled, incomplete (espelha Stripe)
    current_period_end: Optional[datetime] = None
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
    tipo_empresa: str = "registradora"  # registradora, financeira — "detran" fica de fora do autocadastro, só admin cria
    registradora_id: Optional[str] = None  # obrigatório e validado quando tipo_empresa == "financeira"


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cnpj: Optional[str] = None
    endereco: Optional[str] = None
    email_comercial: Optional[EmailStr] = None
    whatsapp: Optional[str] = None
    gestor_contrato: Optional[str] = None
    detrans_atuacao: Optional[List[str]] = None
    # Só se aplica a uma company que já é tipo_empresa=="financeira" (definido
    # na criação, não muda por aqui) — permite corrigir/setar o vínculo depois
    # sem precisar recriar a empresa. Validado em update_company.
    registradora_id: Optional[str] = None


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
    vencimento: Optional[str] = None  # ISO 8601 (YYYY-MM-DD) — sugerido por OCR ou preenchido manualmente
    vencimento_fonte: Optional[str] = None  # "ocr" | "manual" | None
    checklist_item_id: Optional[str] = None  # vincula a um item de CHECKLIST_CONTRAN_807 — obrigatório em uploads novos (ver upload_document); Optional aqui só pra não quebrar a leitura de documentos anteriores à migração
    submissao_id: Optional[str] = None  # vincula a um item de checklist de uma Submissao (fluxo de credenciamento por portaria) — paralelo a checklist_item_id, não usado pelo fluxo CONTRAN 807/Edital 003
    numero_documento: Optional[str] = None
    data_emissao: Optional[str] = None  # ISO 8601 (YYYY-MM-DD)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class DocumentUpload(BaseModel):
    company_id: str
    document_type: str


class PortariaChecklistItem(BaseModel):
    """Item do checklist de exigências gerado pelo cadastro de uma portaria —
    fluxo de credenciamento por portaria (Passo A), paralelo ao checklist fixo
    de cadastro-base (CHECKLIST_CONTRAN_807/CHECKLIST_DETRAN_DF_003_2022), que
    não é alterado por isto."""
    item_id: str = Field(default_factory=lambda: f"pci_{uuid.uuid4().hex[:8]}")
    nome: str
    descricao: Optional[str] = None
    perfil_alvo: Literal["registradora", "financeira"]
    catalogo_item_id: Optional[str] = None  # vincula a um ChecklistCatalogoItem quando selecionado do catálogo; None em itens antigos/livres, mantém compatibilidade com portarias já cadastradas


class Portaria(BaseModel):
    model_config = ConfigDict(extra="ignore")
    portaria_id: str = Field(default_factory=lambda: f"port_{uuid.uuid4().hex[:12]}")
    # Campos legados — mantidos como estão, usados pelas rotas antigas (GET/POST /portarias, /search)
    title: str
    content: str
    source: str  # DOU, DODF, etc
    date: datetime
    detran: Optional[str] = None
    summary: Optional[str] = None
    # Campos novos — canônicos para o módulo "Estado > UF"
    numero: Optional[str] = None
    orgao_emissor: Optional[str] = None
    estado_sigla: Optional[str] = None  # validado contra UF_VALIDAS quando presente
    status: str = "vigente"  # vigente, revogada — força legal do ato, eixo independente de publicado_at
    link_pdf: Optional[str] = None  # path de arquivo enviado via /portarias/upload OU URL externa
    origem: str = "manual"  # manual, querido_diario
    querido_diario_url: Optional[str] = None
    tipo: Optional[str] = None  # credenciamento, descredenciamento, renovacao, alteracao, outro
    empresas_referenciadas: List[str] = []  # company_ids credenciados/afetados por esta portaria
    checklist_itens: List[PortariaChecklistItem] = []  # checklist de exigências desta portaria, por perfil (fluxo de credenciamento)
    # Campos do wizard "Criar Evento" — fusão Evento/Portaria (ver memória
    # project-sigcr-criar-evento-integracao). Todos opcionais/aditivos: uma
    # portaria cadastrada manualmente (criado_via='manual') nunca os preenche.
    template: Optional[str] = None  # 'credenciamento' etc — só quando criado_via='wizard'
    timeline: List[dict] = []  # legado — mais ninguém popula (etapas calculadas removidas 2026-08-08, ver PENDING_ACTIONS.md); campo mantido só pra não quebrar portarias antigas que já têm o array salvo
    data_abertura: Optional[str] = None
    data_encerramento: Optional[str] = None
    publicado_at: Optional[str] = None  # None = rascunho do wizard; setado = publicado. Independente de `status`
    token_publico: Optional[str] = None
    link_publico: Optional[str] = None
    criado_via: str = "manual"  # manual, wizard, querido_diario
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PortariaCreate(BaseModel):
    title: str
    # content/source/date eram obrigatórios pensando só no caso "transcrevi um
    # ato oficial" — o wizard não produz naturalmente um texto de lei nem uma
    # data de publicação, então viram opcionais com default aplicado na rota
    # quando criado_via='wizard' (ver criar_portaria).
    content: Optional[str] = None
    source: Optional[str] = None
    date: Optional[datetime] = None
    detran: Optional[str] = None
    numero: Optional[str] = None
    orgao_emissor: Optional[str] = None
    estado_sigla: Optional[str] = None
    status: str = "vigente"
    link_pdf: Optional[str] = None
    origem: str = "manual"
    querido_diario_url: Optional[str] = None
    summary: Optional[str] = None
    tipo: Optional[str] = None
    empresas_referenciadas: List[str] = []
    checklist_itens: List[PortariaChecklistItem] = []
    template: Optional[str] = None
    timeline: List[dict] = []
    data_abertura: Optional[str] = None
    data_encerramento: Optional[str] = None
    criado_via: str = "manual"


class PortariaUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    source: Optional[str] = None
    date: Optional[datetime] = None
    detran: Optional[str] = None
    numero: Optional[str] = None
    orgao_emissor: Optional[str] = None
    status: Optional[str] = None
    link_pdf: Optional[str] = None
    summary: Optional[str] = None
    tipo: Optional[str] = None
    empresas_referenciadas: Optional[List[str]] = None
    checklist_itens: Optional[List[PortariaChecklistItem]] = None
    timeline: Optional[List[dict]] = None
    data_abertura: Optional[str] = None
    data_encerramento: Optional[str] = None


class AnalyzeRequest(BaseModel):
    text: str


class EstadoCredenciamento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    estado_id: str = Field(default_factory=lambda: f"estado_{uuid.uuid4().hex[:12]}")
    estado_sigla: str  # SP, RJ, MG, etc
    estado_nome: str  # São Paulo, Rio de Janeiro, etc
    portaria_vigente: Optional[str] = None
    portaria_file_path: Optional[str] = None
    empresas_credenciadas: List[str] = []  # legado, congelado — fonte real é db.credenciamentos
    observacoes: Optional[str] = None
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EstadoCredenciamentoCreate(BaseModel):
    estado_sigla: str
    observacoes: Optional[str] = None


class EstadoCredenciamentoUpdate(BaseModel):
    observacoes: Optional[str] = None
    portaria_vigente: Optional[str] = None
    portaria_file_path: Optional[str] = None


class CredenciamentoDetalhes(BaseModel):
    model_config = ConfigDict(extra="ignore")
    credenciamento_id: str = Field(default_factory=lambda: f"cred_{uuid.uuid4().hex[:12]}")
    company_id: str
    estado_sigla: str
    extrato_contrato: str
    status: str = "ativo"  # ativo, sem_efeito, pendente — estado de NEGÓCIO, distinto do soft delete
    validade: Optional[datetime] = None
    valor_total_registro: Optional[float] = None
    valor_detran: Optional[float] = None
    valor_registradora: Optional[float] = None
    termo_credenciamento_path: Optional[str] = None
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CredenciamentoDetalhesCreate(BaseModel):
    company_id: str
    extrato_contrato: str
    status: str = "ativo"
    validade: Optional[datetime] = None
    valor_total_registro: Optional[float] = None
    valor_detran: Optional[float] = None
    valor_registradora: Optional[float] = None
    termo_credenciamento_path: Optional[str] = None


class CredenciamentoDetalhesUpdate(BaseModel):
    extrato_contrato: Optional[str] = None
    status: Optional[str] = None
    validade: Optional[datetime] = None
    valor_total_registro: Optional[float] = None
    valor_detran: Optional[float] = None
    valor_registradora: Optional[float] = None
    termo_credenciamento_path: Optional[str] = None


class SubmissaoItem(BaseModel):
    """Snapshot de um item do checklist da portaria no momento em que a
    submissão é criada — não referencia a Portaria ao vivo, pra uma edição
    posterior do checklist da portaria não mudar o formato de uma submissão
    já em andamento."""
    item_id: str
    nome: str
    descricao: Optional[str] = None
    perfil_alvo: Literal["registradora", "financeira"]
    status: Literal["pendente", "enviado", "conforme", "inconforme"] = "pendente"
    document_id: Optional[str] = None
    justificativa: Optional[str] = None  # obrigatória quando status == inconforme
    historico: List[dict] = []  # append-only: análises anteriores deste item (mesmo padrão de historico_rejeicoes)
    analisado_por: Optional[str] = None
    analisado_em: Optional[str] = None


class Submissao(BaseModel):
    """Processo de credenciamento de UMA empresa em resposta a UMA portaria —
    fluxo Rascunho -> Submetido -> Em Análise -> Em Diligência -> Homologado."""
    model_config = ConfigDict(extra="ignore")
    submissao_id: str = Field(default_factory=lambda: f"subm_{uuid.uuid4().hex[:12]}")
    portaria_id: str
    estado_sigla: str
    company_id: str
    perfil_empresa: Literal["registradora", "financeira"]
    status: Literal["rascunho", "submetido", "em_analise", "em_diligencia", "homologado"] = "rascunho"
    itens: List[SubmissaoItem] = []
    submetido_em: Optional[str] = None
    analisado_em: Optional[str] = None
    homologado_em: Optional[str] = None
    homologado_por: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class SubmissaoItemAnalise(BaseModel):
    status: Literal["conforme", "inconforme"]
    justificativa: Optional[str] = None


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

async def _anexar_status_conta(user: User) -> User:
    """Fase 1: anexa tipo_conta/account_status a partir de companies/contas_pf.

    Um user_id pode ser dono de mais de uma company (fluxo antigo de
    'Nova Empresa' em Empresas.js) — nesse caso, usa a política mais permissiva
    (se QUALQUER company do usuário está ativo_contrato_assinado, considera
    acesso total; senão aprovado_acesso_limitado se alguma estiver nesse
    estágio; senão pendente_aprovacao). Evita restringir de forma errada um
    usuário que já tem pelo menos uma empresa liberada.

    Perfis internos (sigcr_admin/detran/detran_admin) tipicamente não têm
    nenhum documento em companies/contas_pf e ficam com tipo_conta=None,
    o que _tem_acesso_total trata como acesso total (não são contas de
    cliente, não fazem sentido gatear por esse mecanismo)."""
    companies = await db.companies.find(
        {"user_id": user.user_id, "deleted_at": None}, {"_id": 0, "status": 1}
    ).to_list(100)
    if companies:
        user.tipo_conta = "empresa"
        statuses = {c.get("status") for c in companies}
        if "ativo_contrato_assinado" in statuses:
            user.account_status = "ativo_contrato_assinado"
        elif "aprovado_acesso_limitado" in statuses:
            user.account_status = "aprovado_acesso_limitado"
        elif statuses == {"rejeitado"}:
            user.account_status = "rejeitado"
        else:
            user.account_status = "pendente_aprovacao"
        return user

    conta_pf = await db.contas_pf.find_one({"user_id": user.user_id}, {"_id": 0, "status": 1})
    if conta_pf:
        user.tipo_conta = "pessoa_fisica"
        user.account_status = conta_pf.get("status")
    return user


def _tem_acesso_total(user: User) -> bool:
    """Usado por require_acesso_total (ex: candidatar-se a edital). True pra
    perfis internos (tipo_conta None) e pra contas com status liberado —
    inclui PF avulsa com assinatura ativa aqui porque, na prática, ela nunca
    chega a chamar POST /solicitacoes (não tem company_id pra vincular);
    o que de fato restringe o que uma PF avulsa VÊ é _ve_editais_completo."""
    if user.tipo_conta == "empresa":
        return user.account_status == "ativo_contrato_assinado"
    if user.tipo_conta == "pessoa_fisica":
        return user.account_status == "ativa"
    return True


def _ve_editais_completo(user: User) -> bool:
    """Só empresa com contrato assinado vê o edital completo (e pode se
    candidatar). PF avulsa NUNCA vê completo, mesmo com assinatura ativa —
    por especificação, o acesso dela é só acompanhamento/preview, nunca
    candidatura (não é vinculada a nenhuma empresa/credenciamento)."""
    if user.tipo_conta == "empresa":
        return user.account_status == "ativo_contrato_assinado"
    if user.tipo_conta == "pessoa_fisica":
        return False
    return True


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
        # KC_INTERNAL_URL (rede docker), não KEYCLOAK_URL (hostname público) —
        # esse fetch roda de dentro do container, e auth.sigcr.com.br resolve
        # pro /etc/hosts do HOST (127.0.0.1 -> nginx do host), não pro
        # loopback do próprio container, onde nada escuta na porta 443.
        JWKS_URL = f"{KC_INTERNAL_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"

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

            # Upsert atômico — find_one + insert_one separados (versão antiga)
            # tinha uma corrida real: duas requisições concorrentes no primeiro
            # login do mesmo usuário podiam ambas ver "não existe" e ambas
            # inserirem, gerando dois documentos com o mesmo user_id (achado
            # em produção: administrador@sigcr.com.br duplicado). update_one
            # com upsert=True é atômico no Mongo — só um dos dois vira insert.
            await db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {"name": name, "perfil": perfil},
                    "$setOnInsert": {
                        "user_id": user_id,
                        "email": email,
                        "picture": payload.get("picture"),
                        "detran_uf": detran_uf,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
                upsert=True,
            )

            return await _anexar_status_conta(User(
                user_id=user_id,
                email=email,
                name=name,
                picture=payload.get("picture"),
                perfil=perfil,
                roles=sigcr_roles,
                detran_uf=detran_uf,
            ))
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

    return await _anexar_status_conta(User(**user_doc))


async def require_acesso_total(current_user: User = Depends(get_current_user)) -> User:
    """Dependency pra rotas que só fazem sentido com acesso total liberado
    (ex: candidatar-se a edital). Não usar pra rotas onde a resposta deve só
    variar de conteúdo (ex: GET /editais) — nesses casos, usar _tem_acesso_total
    diretamente e devolver uma versão reduzida em vez de bloquear com 403."""
    if not _tem_acesso_total(current_user):
        detail = (
            "Acesso liberado apenas após contrato assinado"
            if current_user.tipo_conta == "empresa"
            else "Assinatura inativa"
        )
        raise HTTPException(status_code=403, detail=detail)
    return current_user


def require_perfil(*perfis_permitidos: str):
    """Dependency factory pra rotas exclusivas de um ou mais perfis (ex:
    Depends(require_perfil("detran", "detran_admin"))). sigcr_admin sempre
    passa, espelhando o bypass de superusuário do frontend. Não usar em rotas
    cujo controle de acesso já é mais fino que "perfil bate/não bate" (ex:
    escopo por UF/categoria) — nesses casos as checagens dedicadas
    (_checar_permissao_escrita_estado, etc.) continuam sendo a fonte de verdade."""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.perfil == "sigcr_admin" or current_user.perfil in perfis_permitidos:
            return current_user
        raise HTTPException(
            status_code=403,
            detail=f"Acesso restrito ao(s) perfil(is): {', '.join(perfis_permitidos)}"
        )
    return checker


# ============ Modo "ver como" (sigcr_admin) ============
# Permite ao sigcr_admin navegar/agir vendo o sistema como uma empresa
# específica ou como o DETRAN de uma UF específica, sem trocar de login.
# Dois mecanismos distintos, pela forma como cada endpoint já era escrito:
#
# 1. get_effective_scope — pra endpoints que HOJE não recebem nenhum
#    identificador de empresa/UF (ex: GET /companies, GET /stats) e inferem
#    tudo do JWT. Aceita query params opcionais view_as_company_id/
#    view_as_detran_uf que só sigcr_admin pode usar (outros perfis levam 403
#    explícito, nunca ignora silenciosamente — pedido explícito, evita
#    mascarar uma tentativa de escalada de privilégio como no-op).
#
# 2. _autorizar_acesso_empresa / _autorizar_acesso_esteira — pra endpoints
#    que JÁ recebem um id explícito no path (ex: GET /companies/{company_id})
#    e hoje travam com um filtro extra de user_id==dono. Aqui não precisa de
#    query param novo: o id no path já diz qual empresa/esteira; o que faltava
#    era liberar sigcr_admin do filtro de dono.
#
# Em ambos os casos, `current_user` no EffectiveScope retornado é sempre a
# identidade REAL (pra auditoria/created_by) — só effective_user_id/
# effective_company_id/effective_detran_uf mudam quando há "ver como" ativo.

class EffectiveScope(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    current_user: User
    effective_user_id: str
    effective_company_id: Optional[str] = None
    effective_detran_uf: Optional[str] = None
    effective_perfil: str
    viewing_as: Optional[dict] = None  # {"tipo": "empresa"|"detran", "id": str, "nome": str}

    @property
    def is_viewing_as(self) -> bool:
        return self.viewing_as is not None

    def as_user(self) -> "User":
        """Visão User-shaped dos campos EFETIVOS (perfil/user_id/detran_uf) —
        deixa helpers antigos que só sabem ler um `User` (_perfil_pode_ver_estado,
        _empresa_do_usuario, _checar_permissao_escrita_estado etc.) funcionarem
        sob simulação 'ver como' sem precisar ser reescritos: endpoints que
        migram pra EffectiveScope passam `scope.as_user()` no lugar de
        `current_user` só nesses helpers de leitura/checagem, e continuam
        usando `scope.current_user` (identidade real) pra auditoria/created_by."""
        return self.current_user.model_copy(update={
            "perfil": self.effective_perfil,
            "user_id": self.effective_user_id,
            "detran_uf": self.effective_detran_uf,
        })


async def get_effective_scope(
    view_as_company_id: Optional[str] = None,
    view_as_detran_uf: Optional[str] = None,
    current_user: User = Depends(get_current_user),
) -> EffectiveScope:
    if (view_as_company_id or view_as_detran_uf) and current_user.perfil != "sigcr_admin":
        raise HTTPException(
            status_code=403,
            detail="Parâmetros de visualização (view_as_company_id/view_as_detran_uf) são restritos a sigcr_admin"
        )
    if view_as_company_id and view_as_detran_uf:
        raise HTTPException(status_code=400, detail="Escolha visualizar por empresa OU por DETRAN, não os dois")

    if view_as_company_id:
        company = await db.companies.find_one(
            {"company_id": view_as_company_id, "deleted_at": None}, {"_id": 0}
        )
        if not company:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        dono = await db.users.find_one({"user_id": company["user_id"]}, {"_id": 0})
        return EffectiveScope(
            current_user=current_user,
            effective_user_id=company["user_id"],
            effective_company_id=view_as_company_id,
            effective_detran_uf=None,
            effective_perfil=(dono or {}).get("perfil", "registradora"),
            viewing_as={
                "tipo": "empresa",
                "id": view_as_company_id,
                "nome": company.get("nome_fantasia") or company.get("name"),
            },
        )

    if view_as_detran_uf:
        uf = view_as_detran_uf.upper()
        if uf not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")
        return EffectiveScope(
            current_user=current_user,
            effective_user_id=current_user.user_id,
            effective_company_id=None,
            effective_detran_uf=uf,
            effective_perfil="detran_admin",
            viewing_as={"tipo": "detran", "id": uf, "nome": UF_NOMES.get(uf, uf)},
        )

    return EffectiveScope(
        current_user=current_user,
        effective_user_id=current_user.user_id,
        effective_company_id=None,
        effective_detran_uf=current_user.detran_uf,
        effective_perfil=current_user.perfil,
        viewing_as=None,
    )


async def _autorizar_acesso_empresa(company_id: str, current_user: User, *, exigir_nao_deletada: bool = True) -> EffectiveScope:
    """Autoriza acesso a UMA empresa já identificada explicitamente na rota
    (path/form). Dono sempre passa; sigcr_admin sempre passa (com viewing_as
    setado, pra auditoria); qualquer outro perfil leva 403."""
    query = {"company_id": company_id}
    if exigir_nao_deletada:
        query["deleted_at"] = None
    company = await db.companies.find_one(query, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    if company["user_id"] == current_user.user_id:
        return EffectiveScope(
            current_user=current_user,
            effective_user_id=current_user.user_id,
            effective_company_id=company_id,
            effective_detran_uf=current_user.detran_uf,
            effective_perfil=current_user.perfil,
            viewing_as=None,
        )
    if current_user.perfil == "sigcr_admin":
        return EffectiveScope(
            current_user=current_user,
            effective_user_id=company["user_id"],
            effective_company_id=company_id,
            effective_detran_uf=current_user.detran_uf,
            effective_perfil=current_user.perfil,
            viewing_as={
                "tipo": "empresa",
                "id": company_id,
                "nome": company.get("nome_fantasia") or company.get("name"),
            },
        )
    raise HTTPException(status_code=403, detail="Acesso negado — empresa não pertence a este usuário")


async def _autorizar_acesso_esteira(esteira_id: str, current_user: User) -> tuple:
    """Mesmo padrão de _autorizar_acesso_empresa, mas pra esteiras — que são
    escopadas só por user_id (não têm company_id). Retorna (esteira_doc, scope)."""
    esteira = await db.esteiras.find_one({"esteira_id": esteira_id}, {"_id": 0})
    if not esteira:
        raise HTTPException(status_code=404, detail="Esteira não encontrada")

    if esteira["user_id"] == current_user.user_id:
        scope = EffectiveScope(
            current_user=current_user, effective_user_id=current_user.user_id,
            effective_detran_uf=current_user.detran_uf, effective_perfil=current_user.perfil, viewing_as=None,
        )
        return esteira, scope
    if current_user.perfil == "sigcr_admin":
        scope = EffectiveScope(
            current_user=current_user, effective_user_id=esteira["user_id"],
            effective_detran_uf=current_user.detran_uf, effective_perfil=current_user.perfil,
            viewing_as={"tipo": "usuario", "id": esteira["user_id"], "nome": esteira.get("registradora")},
        )
        return esteira, scope
    raise HTTPException(status_code=403, detail="Esteira não encontrada")


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
async def get_companies(tipo_empresa: Optional[str] = None, scope: EffectiveScope = Depends(get_effective_scope)):
    """Empresas do usuário logado. sigcr_admin sem "ver como" ativo vê todas
    (mesmo padrão de GET /solicitacoes e /eventos — alimenta o seletor "ver
    como" no frontend); com view_as_company_id, vê só a(s) empresa(s) do dono
    daquela empresa (mimetiza exatamente o que o dono veria). tipo_empresa
    opcional filtra por segmento (registradora/financeira) — usado pelo seletor
    de vínculo (Empresas.js), pelo seletor de empresa solicitante (fila de
    registro de contrato) e pelo badge de perfil do admin pra não misturar
    tipos no seletor "Selecionar Empresa".

    Caso especial: perfil financeira pedindo tipo_empresa=registradora não é
    escopado por ownership (nunca seria dono de uma registradora) — precisa
    ver as registradoras ativas disponíveis pra poder se vincular a uma, tanto
    no cadastro quanto pra corrigir o vínculo depois. Exposição equivalente à
    de GET /public/registradoras (mesmos 2 campos-alvo), só que atrás de
    login em vez de público — não é uma ampliação de risco, é o mesmo dado
    exigindo mais, não menos, pra ver."""
    if scope.current_user.perfil == "sigcr_admin" and not scope.is_viewing_as:
        query = {"deleted_at": None}
    elif scope.current_user.perfil == "financeira" and tipo_empresa == "registradora":
        query = {"tipo_empresa": "registradora", "status": "ativo_contrato_assinado", "deleted_at": None}
        companies = await db.companies.find(query, {"_id": 0}).to_list(1000)
        return companies
    else:
        query = {"user_id": scope.effective_user_id, "deleted_at": None}
    if tipo_empresa:
        query["tipo_empresa"] = tipo_empresa
    companies = await db.companies.find(query, {"_id": 0}).to_list(1000)
    return companies


async def _validar_tipo_e_vinculo_empresa(tipo_empresa: str, registradora_id: Optional[str]) -> None:
    """Regras da Fase A pro par (tipo_empresa, registradora_id), compartilhadas
    entre POST /companies (autenticado), PATCH /companies/{id} (correção
    posterior do vínculo) e POST /public/cadastro (autocadastro). Autocadastro
    só cria registradora ou financeira — DETRAN continua exclusivamente
    admin-created (GestaoUsuarios)."""
    if tipo_empresa not in ("registradora", "financeira"):
        raise HTTPException(status_code=400, detail="tipo_empresa deve ser 'registradora' ou 'financeira'")
    if tipo_empresa == "financeira":
        if not registradora_id:
            raise HTTPException(status_code=400, detail="registradora_id é obrigatório para tipo_empresa='financeira'")
        registradora = await db.companies.find_one(
            {"company_id": registradora_id, "tipo_empresa": "registradora", "deleted_at": None}, {"_id": 0}
        )
        if not registradora:
            raise HTTPException(status_code=404, detail="Registradora não encontrada")
        if registradora.get("status") != "ativo_contrato_assinado":
            raise HTTPException(status_code=400, detail="Só é possível vincular a uma registradora com contrato ativo")
    elif registradora_id:
        raise HTTPException(status_code=400, detail="registradora_id só se aplica a tipo_empresa='financeira'")


@api_router.post("/companies", response_model=Company)
async def create_company(company_data: CompanyCreate, current_user: User = Depends(get_current_user)):
    """Create new company"""
    _validar_cnpj(company_data.cnpj)
    await _validar_tipo_e_vinculo_empresa(company_data.tipo_empresa, company_data.registradora_id)
    company = Company(
        user_id=current_user.user_id,
        name=company_data.name,
        nome_fantasia=company_data.nome_fantasia,
        cnpj=company_data.cnpj,
        endereco=company_data.endereco,
        email_comercial=company_data.email_comercial,
        whatsapp=company_data.whatsapp,
        gestor_contrato=company_data.gestor_contrato,
        detrans_atuacao=company_data.detrans_atuacao,
        tipo_empresa=company_data.tipo_empresa,
        registradora_id=company_data.registradora_id,
    )

    doc = company.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()

    try:
        await db.companies.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado")
    return company


@api_router.get("/public/registradoras")
async def listar_registradoras_publico():
    """Lista mínima e pública de registradoras ativas — alimenta o seletor de
    vínculo no autocadastro de Financeira (Fase A). Só o essencial pra exibir
    numa lista de escolha; nada de dados sensíveis da empresa."""
    registradoras = await db.companies.find(
        {"tipo_empresa": "registradora", "status": "ativo_contrato_assinado", "deleted_at": None},
        {"_id": 0, "company_id": 1, "nome_fantasia": 1},
    ).sort("nome_fantasia", 1).to_list(1000)
    return registradoras


class CadastroPublicoPayload(CompanyCreate):
    password: str
    captcha_token: Optional[str] = None


@api_router.post("/public/cadastro")
async def autocadastro_publico(payload: CadastroPublicoPayload, request: Request):
    """Autocadastro público (Fase 3, estendido na Fase A pra cobrir Financeira
    também) — cria a conta no Keycloak e a empresa em 'pendente_aprovacao' na
    mesma chamada. Sem autenticação por natureza (é o próprio cadastro), então
    toda validação de negócio (tipo_empresa/registradora_id, CNPJ único)
    acontece aqui dentro, nunca confiando em nada vindo do cliente sem checar.

    status="pendente_aprovacao" setado explicitamente aqui (não confiar no
    default do modelo Company, que continua "pending" — legado, ainda usado
    por POST /companies) — GET /admin/cadastros-pendentes só filtra por
    "pendente_aprovacao", então um cadastro público que nascesse com o
    default antigo nunca apareceria na fila de aprovação de ninguém. Ver
    PENDING_ACTIONS.md item 19."""
    _rate_limit(request, "public_cadastro", max_hits=5, window_s=300)
    await _verificar_captcha(payload.captcha_token)
    _validar_cnpj(payload.cnpj)
    await _validar_tipo_e_vinculo_empresa(payload.tipo_empresa, payload.registradora_id)

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 8 caracteres")

    if await db.companies.find_one({"cnpj": payload.cnpj, "deleted_at": None}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado")

    token = await get_kc_admin_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    username = payload.email_comercial
    user_data = {
        "username": username,
        "email": payload.email_comercial,
        "firstName": payload.gestor_contrato,
        "lastName": "",
        "enabled": True,
        "credentials": [{"type": "password", "value": payload.password, "temporary": False}],
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users",
            headers=headers, json=user_data,
        )
        if r.status_code == 409:
            raise HTTPException(status_code=409, detail="E-mail já cadastrado")
        r.raise_for_status()

        ru = await client.get(
            f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users?username={username}&exact=true",
            headers=headers,
        )
        users = ru.json()
        if not users:
            raise HTTPException(status_code=500, detail="Conta criada mas não encontrada")
        user_id = users[0]["id"]

        try:
            rr = await client.get(
                f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/roles/{payload.tipo_empresa}",
                headers=headers,
            )
            rr.raise_for_status()
            role_obj = rr.json()
            await client.post(
                f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}/role-mappings/realm",
                headers=headers, json=[role_obj],
            )

            company = Company(
                user_id=user_id,
                name=payload.name,
                nome_fantasia=payload.nome_fantasia,
                cnpj=payload.cnpj,
                endereco=payload.endereco,
                email_comercial=payload.email_comercial,
                whatsapp=payload.whatsapp,
                gestor_contrato=payload.gestor_contrato,
                detrans_atuacao=payload.detrans_atuacao,
                tipo_empresa=payload.tipo_empresa,
                registradora_id=payload.registradora_id,
                status="pendente_aprovacao",
            )
            doc = company.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            doc['updated_at'] = doc['updated_at'].isoformat()
            try:
                await db.companies.insert_one(doc)
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="CNPJ já cadastrado")
        except Exception:
            # Rollback: não deixa um usuário Keycloak órfão (sem empresa) se
            # qualquer coisa depois da criação da conta falhar.
            await client.delete(
                f"{KC_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user_id}",
                headers=headers,
            )
            raise

    return {"message": "Cadastro realizado com sucesso. Aguarde aprovação.", "company_id": company.company_id}


@api_router.get("/companies/{company_id}", response_model=Company)
async def get_company(company_id: str, current_user: User = Depends(get_current_user)):
    """Get company by ID (dono ou sigcr_admin em modo 'ver como')"""
    await _autorizar_acesso_empresa(company_id, current_user)
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})
    return Company(**company)


@api_router.patch("/companies/{company_id}", response_model=Company)
async def update_company(company_id: str, updates: CompanyUpdate, current_user: User = Depends(get_current_user)):
    """Update company fields (dono ou sigcr_admin em modo 'ver como')"""
    scope = await _autorizar_acesso_empresa(company_id, current_user)
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return Company(**company)
    if "registradora_id" in campos:
        # tipo_empresa é definido só na criação (não está em CompanyUpdate) —
        # aqui só corrige/seta o vínculo de uma empresa que já é financeira.
        await _validar_tipo_e_vinculo_empresa(company.get("tipo_empresa"), campos["registradora_id"])
    antes = {k: company.get(k) for k in campos}
    campos["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.companies.update_one({"company_id": company_id}, {"$set": campos})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado por outra empresa")
    await registrar_auditoria(current_user, "atualizar_empresa", "company", company_id, {
        "antes": antes, "depois": {k: v for k, v in campos.items() if k != "updated_at"}
    }, atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    updated = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    return Company(**updated)


@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(get_current_user)):
    """Soft-delete a company (dono ou sigcr_admin em modo 'ver como')"""
    scope = await _autorizar_acesso_empresa(company_id, current_user)
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})

    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "remover_empresa", "company", company_id, {},
                               atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    return {"message": "Empresa removida"}


@api_router.patch("/companies/{company_id}/status")
async def update_company_status(company_id: str, status: str, current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Restrito a sigcr_admin — antes desta correção (Fase 2), não havia checagem de
    perfil aqui e matchava por user_id, permitindo que o próprio dono da empresa
    se auto-promovesse pra qualquer status (ex: ativo_contrato_assinado) sem
    passar pelo fluxo de aprovação. Não usado por nenhum ponto do frontend hoje —
    /admin/cadastros/{id}/aprovar e /rejeitar são o fluxo real de transição de status."""
    result = await db.companies.update_one(
        {"company_id": company_id},
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
    """Upload company logo (dono ou sigcr_admin em modo 'ver como')"""
    scope = await _autorizar_acesso_empresa(company_id, current_user, exigir_nao_deletada=False)

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
    await registrar_auditoria(current_user, "upload_logo_empresa", "company", company_id, {},
                               atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)

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


# ============ Módulo de vencimento de documentos (OCR + IA) ============
# Cobre tanto documentos internos (documentos_gov) quanto certidões de
# fornecedores/Registradora/Financeira (documents) — Bloco 1, Lei 14.133.
# Pipeline no upload: 1) texto nativo do PDF, 2) OCR via Tesseract se não
# houver texto suficiente (documento escaneado/foto), 3) API da Anthropic
# pra extrair tipo de documento + data de vencimento em JSON estruturado.
# Qualquer falha em qualquer etapa degrada silenciosamente pra
# vencimento=None/vencimento_fonte=None — nunca derruba o upload; o campo
# fica esperando preenchimento manual.

def _extrair_texto_pdf_nativo(file_path: Path) -> str:
    """Camada de texto nativa do PDF, se existir (não roda OCR)."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception as e:
        logger.warning(f"Falha ao extrair texto nativo do PDF {file_path}: {e}")
        return ""


def _extrair_texto_ocr(file_path: Path, content_type: Optional[str]) -> str:
    """OCR via Tesseract — documento escaneado (PDF sem texto nativo) ou
    foto/imagem. PDFs são rasterizados página a página via pdf2image
    (requer poppler-utils instalado no sistema)."""
    try:
        import pytesseract
        from PIL import Image

        if content_type == "application/pdf":
            from pdf2image import convert_from_path
            paginas = convert_from_path(str(file_path))
            return "\n".join(pytesseract.image_to_string(p, lang="por") for p in paginas).strip()
        else:
            return pytesseract.image_to_string(Image.open(file_path), lang="por").strip()
    except Exception as e:
        logger.warning(f"Falha no OCR de {file_path}: {e}")
        return ""


def _normalizar_data_vencimento(data_str: Optional[str]) -> Optional[str]:
    """Modelos locais menores (Llama 3.2 3B) nem sempre respeitam o formato
    YYYY-MM-DD pedido no prompt — é comum devolver DD/MM/YYYY (padrão
    brasileiro) mesmo com instrução explícita. Tenta os formatos mais comuns
    antes de descartar a data."""
    if not data_str:
        return None
    for fmt in (None, "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            if fmt is None:
                datetime.fromisoformat(data_str)
                return data_str
            return datetime.strptime(data_str, fmt).date().isoformat()
        except ValueError:
            continue
    return None


async def _extrair_tipo_e_vencimento_llm(texto: str) -> Optional[dict]:
    """Envia o texto extraído (nativo ou OCR) pro Llama local via Ollama
    (container sigcr-ollama, mesma rede Docker) pedindo JSON estruturado com
    tipo de documento + data de vencimento. Retorna None — e o vencimento
    fica em branco pra preenchimento manual — quando não há texto suficiente,
    quando o Ollama está fora do ar, ou se a chamada falhar por qualquer
    motivo (timeout, JSON inválido, etc.) — nunca derruba o upload."""
    if not texto or len(texto.strip()) < 10:
        return None
    try:
        prompt = (
            "Texto extraído de um documento de credenciamento/certidão brasileiro. "
            "Identifique o tipo de documento e a data de vencimento/validade, se houver. "
            "Responda só com o JSON pedido, sem nenhum texto antes ou depois.\n\n" + texto[:4000]
        )
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                # Descarrega o modelo da memória logo após a resposta — o pico
                # de RAM durante a inferência chega perto do limite total do
                # VPS (2 vCPUs / 7,8GB, compartilhado com outros containers),
                # então não vale manter ~2GB de modelo ocioso em memória entre
                # uploads (que são esporádicos, não um fluxo constante).
                "keep_alive": 0,
                "format": {
                    "type": "object",
                    "properties": {
                        "tipo_documento": {"type": ["string", "null"]},
                        "data_vencimento": {
                            "type": ["string", "null"],
                            "description": "Data de vencimento/validade no formato YYYY-MM-DD, ou null se não encontrada",
                        },
                    },
                    "required": ["tipo_documento", "data_vencimento"],
                },
            })
            resp.raise_for_status()
            texto_resposta = resp.json().get("response")
        if not texto_resposta:
            return None
        dados = json.loads(texto_resposta)
        data_str = _normalizar_data_vencimento(dados.get("data_vencimento"))
        return {"tipo_documento": dados.get("tipo_documento"), "data_vencimento": data_str}
    except Exception as e:
        logger.warning(f"Falha na extração de vencimento via LLM local (Ollama): {e}")
        return None


async def _pipeline_extracao_vencimento(file_path: Path, content_type: Optional[str]) -> dict:
    """Roda o pipeline completo e devolve {"vencimento", "vencimento_fonte"}
    prontos pra gravar no documento. Nunca levanta exceção."""
    texto = ""
    try:
        if content_type == "application/pdf":
            texto = _extrair_texto_pdf_nativo(file_path)
            if len(texto) < 20:
                texto = _extrair_texto_ocr(file_path, content_type)
        elif content_type in ("image/jpeg", "image/png", "image/jpg"):
            texto = _extrair_texto_ocr(file_path, content_type)
    except Exception as e:
        logger.warning(f"Pipeline de extração de vencimento falhou pra {file_path}: {e}")
        texto = ""

    resultado = await _extrair_tipo_e_vencimento_llm(texto)
    if resultado and resultado.get("data_vencimento"):
        return {"vencimento": resultado["data_vencimento"], "vencimento_fonte": "ocr"}
    return {"vencimento": None, "vencimento_fonte": None}


# ============ Document Routes ============

@api_router.get("/documents/{company_id}", response_model=List[Document])
async def get_documents(company_id: str, current_user: User = Depends(get_current_user)):
    """Get all documents for a company (dono ou sigcr_admin em modo 'ver como')"""
    await _autorizar_acesso_empresa(company_id, current_user, exigir_nao_deletada=False)

    documents = await db.documents.find(
        {"company_id": company_id, "deleted_at": None}, {"_id": 0}
    ).to_list(1000)
    return documents


@api_router.post("/documents/upload")
async def upload_document(
    company_id: str = Form(...),
    document_type: str = Form(...),
    document_name: str = Form(...),
    checklist_item_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload document for company (dono ou sigcr_admin em modo 'ver como').
    checklist_item_id é obrigatório desde a unificação da aba Documentos com
    o Checklist CONTRAN 807 — todo documento novo precisa estar vinculado a
    um dos 31 itens do catálogo fixo. Validação manual (em vez de
    Form(...) obrigatório) pra garantir 400 tanto na ausência quanto num
    valor inválido, e não o 422 padrão do FastAPI pra Form ausente."""
    scope = await _autorizar_acesso_empresa(company_id, current_user, exigir_nao_deletada=False)

    company_doc = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "tipo_empresa": 1})
    tipo_empresa = (company_doc or {}).get("tipo_empresa", "registradora")
    ids_validos = CHECKLISTS_IDS_POR_TIPO_EMPRESA.get(tipo_empresa, set())
    if not checklist_item_id or checklist_item_id not in ids_validos:
        raise HTTPException(status_code=400, detail="checklist_item_id é obrigatório e precisa ser um item válido do checklist deste tipo de empresa")

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

    extracao = await _pipeline_extracao_vencimento(file_path, file.content_type)

    # Create document record
    document = Document(
        company_id=company_id,
        document_type=document_type,
        document_name=document_name,
        file_name=file.filename or "unknown",
        file_path=str(file_path),
        file_size=file_size,
        vencimento=extracao["vencimento"],
        vencimento_fonte=extracao["vencimento_fonte"],
        checklist_item_id=checklist_item_id,
    )

    doc = document.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.documents.insert_one(doc)
    logger.info(f"Document uploaded: {document.document_id}")
    await registrar_auditoria(current_user, "upload_documento_empresa", "document", document.document_id, {
        "company_id": company_id, "document_type": document_type, "checklist_item_id": checklist_item_id
    }, atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    return document


@api_router.get("/documents/download/{document_id}")
async def download_document(document_id: str, current_user: User = Depends(get_current_user)):
    """Download document (dono ou sigcr_admin em modo 'ver como')"""
    # Get document
    document = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        await _autorizar_acesso_empresa(document["company_id"], current_user, exigir_nao_deletada=False)
    except HTTPException:
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
    current_user: User = Depends(require_perfil("sigcr_admin"))
):
    """Aprova/rejeita um documento de empresa. Restrito a sigcr_admin — mesma
    classe de gap do PATCH /companies/{id}/status: não tinha nenhuma checagem
    de perfil nem de dono, e nenhum ponto do frontend chama esta rota hoje."""
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


@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: User = Depends(get_current_user)):
    """Soft-delete de um documento de empresa (dono da empresa ou sigcr_admin
    em modo 'ver como') — mesmo padrão de delete_company/portarias/estados:
    marca deleted_at/deleted_by em vez de apagar o registro, e GET
    /documents/{company_id} já filtra por deleted_at: None."""
    document = await db.documents.find_one({"document_id": document_id, "deleted_at": None}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        scope = await _autorizar_acesso_empresa(document["company_id"], current_user, exigir_nao_deletada=False)
    except HTTPException:
        raise HTTPException(status_code=403, detail="Access denied")

    await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "remover_documento_empresa", "document", document_id, {
        "company_id": document["company_id"], "document_type": document.get("document_type")
    }, atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    return {"message": "Documento removido"}


@api_router.get("/checklist-contran")
async def get_checklist_contran(
    company_id: Optional[str] = None,
    scope: EffectiveScope = Depends(get_effective_scope),
):
    """Checklist fixo da Resolução CONTRAN 807 (31 itens em 6 blocos) com o
    status de envio da empresa do usuário logado — ou da empresa selecionada
    no "ver como" (via view_as_company_id) ou explicitamente via ?company_id=.
    Status por item é derivado do documento mais recente (não-removido) com
    aquele checklist_item_id: sem documento -> pendente; status do documento
    approved/rejected/pending -> aprovado/rejeitado/enviado. Não existe uma
    coleção própria de status — a fonte de verdade é sempre db.documents,
    pra nunca dessincronizar do fluxo de aprovação que já existe."""
    if company_id:
        await _autorizar_acesso_empresa(company_id, scope.current_user, exigir_nao_deletada=False)
        target_company_id = company_id
    else:
        empresas = await db.companies.find(
            {"user_id": scope.effective_user_id, "deleted_at": None}, {"_id": 0, "company_id": 1}
        ).sort("created_at", 1).to_list(1)
        if not empresas:
            raise HTTPException(status_code=404, detail="Nenhuma empresa encontrada pra montar o checklist")
        target_company_id = empresas[0]["company_id"]

    company_doc = await db.companies.find_one({"company_id": target_company_id}, {"_id": 0, "tipo_empresa": 1})
    tipo_empresa = (company_doc or {}).get("tipo_empresa", "registradora")
    checklist_itens = CHECKLISTS_POR_TIPO_EMPRESA.get(tipo_empresa, [])
    checklist_blocos_nomes = CHECKLISTS_BLOCOS_POR_TIPO_EMPRESA.get(tipo_empresa, {})

    docs = await db.documents.find(
        {"company_id": target_company_id, "checklist_item_id": {"$ne": None}, "deleted_at": None},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)

    # Mantém só o documento mais recente por item (já ordenado desc acima)
    doc_por_item = {}
    for doc in docs:
        if doc["checklist_item_id"] not in doc_por_item:
            doc_por_item[doc["checklist_item_id"]] = doc

    status_por_document_status = {"pending": "enviado", "approved": "aprovado", "rejected": "rejeitado"}

    blocos = {n: {"numero": n, "nome": nome, "itens": []} for n, nome in checklist_blocos_nomes.items()}
    resumo = {"total": 0, "pendentes": 0, "enviados": 0, "aprovados": 0, "rejeitados": 0}

    for item in checklist_itens:
        doc = doc_por_item.get(item["item_id"])
        status = status_por_document_status.get(doc["status"], "pendente") if doc else "pendente"
        blocos[item["bloco"]]["itens"].append({
            "item_id": item["item_id"],
            "nome": item["nome"],
            "descricao": item["descricao"],
            "obrigatorio": True,
            "status": status,
            "documento": {
                "document_id": doc["document_id"],
                "document_name": doc["document_name"],
                "file_name": doc["file_name"],
                "file_size": doc["file_size"],
                "document_type": doc["document_type"],
                "status": doc["status"],
                "vencimento": doc.get("vencimento"),
                "vencimento_fonte": doc.get("vencimento_fonte"),
                "created_at": doc["created_at"],
            } if doc else None,
        })
        resumo["total"] += 1
        chave_resumo = {"pendente": "pendentes", "enviado": "enviados", "aprovado": "aprovados", "rejeitado": "rejeitados"}[status]
        resumo[chave_resumo] += 1

    return {
        "company_id": target_company_id,
        "blocos": [blocos[n] for n in sorted(blocos)],
        "resumo": resumo,
    }


# ============ Controle de acesso por estado ============
# Usado por Portarias, Estados/Credenciamentos e (via delegação) pelo módulo de Documentos.

def _perfil_pode_ver_estado(user: User, estado_sigla: Optional[str]) -> bool:
    """sigcr_admin vê qualquer estado; detran/detran_admin só o próprio (via detran_uf);
    registradora/financeira não têm acesso a este domínio."""
    if user.perfil == "sigcr_admin":
        return True
    if user.perfil in ("detran", "detran_admin"):
        return bool(user.detran_uf) and estado_sigla == user.detran_uf
    return False


async def _checar_permissao_escrita_estado(user: User, estado_sigla: str):
    """sigcr_admin sempre pode; detran/detran_admin só no próprio estado (detran_uf).
    'detran' foi incluído aqui junto de 'detran_admin' (antes só este último
    passava) pra viabilizar o fluxo de credenciamento por portaria, que exige
    que o perfil 'Administrador DETRAN' simples publique portaria/analise
    submissões na própria UF — mesmo escopo que detran_admin já tinha, nada
    mais amplo."""
    if user.perfil == "sigcr_admin":
        return
    if user.perfil in ("detran", "detran_admin"):
        if not user.detran_uf or estado_sigla != user.detran_uf:
            raise HTTPException(status_code=403, detail="Perfil sem permissão para gerenciar dados deste estado (fora da própria UF)")
        return
    raise HTTPException(status_code=403, detail="Perfil sem permissão para gerenciar dados deste estado")


async def _empresa_do_usuario(user: User) -> Optional[dict]:
    """Empresa (registradora/financeira) dona da conta do usuário logado —
    None pra perfis internos (sigcr_admin/detran/detran_admin), que não têm
    company própria. Usado pelo fluxo de credenciamento por portaria pra
    escopar visibilidade/escrita à própria empresa."""
    if user.perfil not in ("registradora", "financeira"):
        return None
    return await db.companies.find_one({"user_id": user.user_id, "deleted_at": None}, {"_id": 0})


# ============ Portaria Routes ============

@api_router.get("/portarias", response_model=List[Portaria])
async def get_portarias(
    estado_sigla: Optional[str] = None,
    incluir_removidos: bool = False,
    scope: EffectiveScope = Depends(get_effective_scope),
):
    """Get all portarias. Sem estado_sigla: comportamento legado (aberto a qualquer perfil,
    usado pela tela genérica /portarias). Com estado_sigla: aplica controle de acesso por estado.

    Rascunho sem PDF anexado (link_pdf vazio) fica invisível pra registradora/
    financeira — são as portarias criadas via importação em lote (ver
    migrations/2026_08_12_import_portarias_historicas.py), ainda sem revisão
    nem PDF de verdade. sigcr_admin/detran/detran_admin continuam vendo tudo,
    pra poder editar e anexar o PDF antes de liberar. Não existe (ainda) um
    campo de status de publicação dedicado — este é o sinal real disponível
    hoje pra distinguir rascunho de portaria pronta.

    Usa EffectiveScope (não current_user direto) pra que o modo "ver como"
    do sigcr_admin (view_as_company_id/view_as_detran_uf) realmente restrinja
    a listagem ao que a empresa/DETRAN simulado veria — sem isso, a badge
    "Trocar Visão" no frontend trocava só o menu, e o admin continuava vendo
    a lista irrestrita mesmo simulando registradora/financeira."""
    current_user = scope.as_user()
    query = {}
    if estado_sigla:
        estado_sigla = estado_sigla.upper()
        if estado_sigla not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")
        if not _perfil_pode_ver_estado(current_user, estado_sigla):
            raise HTTPException(status_code=403, detail="Perfil sem acesso às portarias deste estado")
        query["estado_sigla"] = estado_sigla
    if not incluir_removidos:
        query["deleted_at"] = None
    if current_user.perfil in ("registradora", "financeira"):
        # Duas fontes de rascunho independentes, as duas precisam passar:
        # (1) importação em lote sem PDF ainda anexado (link_pdf vazio —
        # ver migrations/2026_08_12_import_portarias_historicas.py);
        # (2) rascunho do wizard "Criar Evento" (criado_via='wizard', ainda
        # sem publicar — portarias legadas/manuais, sem esse campo, sempre
        # passam nesta condição). Combinado com AND: as duas guardas
        # precisam ser satisfeitas pra aparecer.
        query["link_pdf"] = {"$nin": [None, ""]}
        query["$or"] = [{"criado_via": {"$ne": "wizard"}}, {"publicado_at": {"$ne": None}}]
    portarias = await db.portarias.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return portarias


@api_router.post("/portarias", response_model=Portaria)
async def create_portaria(portaria_data: PortariaCreate, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    """Create new portaria (sem arquivo — link externo, ex. promoção de sugestão do Querido Diário)."""
    dados = portaria_data.model_dump()
    if dados.get("estado_sigla"):
        dados["estado_sigla"] = dados["estado_sigla"].upper()
        if dados["estado_sigla"] not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")
        await _checar_permissao_escrita_estado(current_user, dados["estado_sigla"])
        if not dados.get("detran"):
            dados["detran"] = dados["estado_sigla"]

    # content/source/date são obrigatórios no modelo Portaria (pensados pro
    # caso "transcrevi um ato oficial"), mas o wizard "Criar Evento" não
    # produz naturalmente um texto de lei nem uma data de ato — preenche com
    # defaults sensatos só quando vieram vazios.
    if not dados.get("content"):
        dados["content"] = dados.get("summary") or ""
    if not dados.get("source"):
        dados["source"] = "SIGCR" if dados.get("criado_via") == "wizard" else "Manual"
    if not dados.get("date"):
        dados["date"] = datetime.now(timezone.utc)

    portaria = Portaria(**dados, created_by=current_user.user_id)

    doc = portaria.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.portarias.insert_one(doc)
    await registrar_auditoria(current_user, "criar_portaria", "portaria", portaria.portaria_id, {
        "estado_sigla": portaria.estado_sigla, "origem": portaria.origem
    })
    return portaria


@api_router.post("/portarias/upload", response_model=Portaria)
async def upload_portaria(
    title: str = Form(...),
    content: str = Form(...),
    source: str = Form(...),
    date: str = Form(...),
    detran: Optional[str] = Form(None),
    numero: Optional[str] = Form(None),
    orgao_emissor: Optional[str] = Form(None),
    estado_sigla: Optional[str] = Form(None),
    status: str = Form("vigente"),
    summary: Optional[str] = Form(None),
    origem: str = Form("manual"),
    querido_diario_url: Optional[str] = Form(None),
    tipo: Optional[str] = Form(None),
    empresas_referenciadas: Optional[str] = Form(None),  # JSON-encoded list de company_ids (multipart não suporta array nativo)
    checklist_itens: Optional[str] = Form(None),  # JSON-encoded list de PortariaChecklistItem (mesmo motivo)
    file: UploadFile = File(...),
    current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin")),
):
    """Cria portaria anexando um PDF real, reaproveitando o mecanismo de upload dos documentos."""
    if estado_sigla:
        estado_sigla = estado_sigla.upper()
        if estado_sigla not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")
        await _checar_permissao_escrita_estado(current_user, estado_sigla)
        if not detran:
            detran = estado_sigla

    empresas_lista = []
    if empresas_referenciadas:
        try:
            empresas_lista = json.loads(empresas_referenciadas)
            if not isinstance(empresas_lista, list) or not all(isinstance(x, str) for x in empresas_lista):
                raise ValueError
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(status_code=400, detail="empresas_referenciadas deve ser uma lista JSON de company_id")

    checklist_lista = []
    if checklist_itens:
        try:
            checklist_lista = [PortariaChecklistItem(**item) for item in json.loads(checklist_itens)]
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"checklist_itens inválido: {e}")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos para portarias")

    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(conteudo) > MAX_PORTARIA_PDF_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite de 20MB")

    try:
        data_parsed = datetime.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida (use ISO 8601)")

    portarias_dir = UPLOAD_DIR / "portarias"
    portarias_dir.mkdir(exist_ok=True)
    file_path = portarias_dir / f"{uuid.uuid4().hex}.pdf"
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(conteudo)

    portaria = Portaria(
        title=title, content=content, source=source, date=data_parsed, detran=detran,
        numero=numero, orgao_emissor=orgao_emissor, estado_sigla=estado_sigla, status=status,
        summary=summary, origem=origem, querido_diario_url=querido_diario_url,
        tipo=tipo, empresas_referenciadas=empresas_lista, checklist_itens=checklist_lista,
        link_pdf=str(file_path), created_by=current_user.user_id,
    )
    doc = portaria.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.portarias.insert_one(doc)
    await registrar_auditoria(current_user, "upload_portaria", "portaria", portaria.portaria_id, {
        "estado_sigla": portaria.estado_sigla, "origem": portaria.origem
    })
    return portaria


@api_router.get("/checklist-catalogo", response_model=List[ChecklistCatalogoItem])
async def get_checklist_catalogo(perfil_alvo: Optional[str] = None, incluir_inativos: bool = False, current_user: User = Depends(get_current_user)):
    """Lista o catálogo reutilizável de itens de checklist de portaria — usado pra popular os checkboxes em Nova Portaria."""
    query = {} if incluir_inativos else {"ativo": True}
    if perfil_alvo:
        if perfil_alvo not in ("registradora", "financeira"):
            raise HTTPException(status_code=400, detail="perfil_alvo deve ser 'registradora' ou 'financeira'")
        query["perfil_alvo"] = perfil_alvo
    itens = await db.checklist_catalogo_portaria.find(query, {"_id": 0}).sort("bloco", 1).to_list(1000)
    return itens


@api_router.post("/checklist-catalogo", response_model=ChecklistCatalogoItem)
async def create_checklist_catalogo_item(item_data: ChecklistCatalogoItemCreate, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    """Cria item novo no catálogo — usado tanto por uma eventual tela de gestão quanto pelo '+ criar item novo' inline em Nova Portaria."""
    if item_data.bloco not in BLOCO_PORTARIA_NOMES:
        raise HTTPException(status_code=400, detail=f"bloco inválido, deve ser um de {sorted(BLOCO_PORTARIA_NOMES)}")
    item = ChecklistCatalogoItem(**item_data.model_dump(), created_by=current_user.user_id)
    doc = item.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.checklist_catalogo_portaria.insert_one(doc)
    await registrar_auditoria(current_user, "criar_item_catalogo_portaria", "checklist_catalogo_portaria", item.item_id, {"bloco": item.bloco, "nome": item.nome})
    return item


@api_router.patch("/checklist-catalogo/{item_id}", response_model=ChecklistCatalogoItem)
async def update_checklist_catalogo_item(item_id: str, item_data: ChecklistCatalogoItemUpdate, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    """Edita nome/descricao/bloco de um item do catálogo. Não afeta portarias que já referenciam esse item via catalogo_item_id — o snapshot embutido nelas não muda retroativamente."""
    existente = await db.checklist_catalogo_portaria.find_one({"item_id": item_id})
    if not existente:
        raise HTTPException(status_code=404, detail="Item de catálogo não encontrado")
    updates = {k: v for k, v in item_data.model_dump(exclude_unset=True).items() if v is not None}
    if "bloco" in updates and updates["bloco"] not in BLOCO_PORTARIA_NOMES:
        raise HTTPException(status_code=400, detail=f"bloco inválido, deve ser um de {sorted(BLOCO_PORTARIA_NOMES)}")
    if updates:
        await db.checklist_catalogo_portaria.update_one({"item_id": item_id}, {"$set": updates})
    await registrar_auditoria(current_user, "editar_item_catalogo_portaria", "checklist_catalogo_portaria", item_id, updates)
    atualizado = await db.checklist_catalogo_portaria.find_one({"item_id": item_id}, {"_id": 0})
    return atualizado


@api_router.delete("/checklist-catalogo/{item_id}")
async def desativar_checklist_catalogo_item(item_id: str, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    """Soft-disable — nunca deleta de verdade. Bloqueia se o item já estiver em uso em alguma portaria (catalogo_item_id), pra não deixar pendurada uma referência morta."""
    existente = await db.checklist_catalogo_portaria.find_one({"item_id": item_id})
    if not existente:
        raise HTTPException(status_code=404, detail="Item de catálogo não encontrado")
    em_uso = await db.portarias.find_one({"checklist_itens.catalogo_item_id": item_id, "deleted_at": None})
    if em_uso:
        raise HTTPException(status_code=409, detail="Item em uso em pelo menos uma portaria — não pode ser desativado")
    await db.checklist_catalogo_portaria.update_one({"item_id": item_id}, {"$set": {"ativo": False}})
    await registrar_auditoria(current_user, "desativar_item_catalogo_portaria", "checklist_catalogo_portaria", item_id, {})
    return {"message": "Item de catálogo desativado"}


@api_router.post("/portarias/analyze")
async def analyze_portaria(analyze_data: AnalyzeRequest, current_user: User = Depends(get_current_user)):
    """Analyze portaria text with AI"""
    raise HTTPException(status_code=501, detail="Análise por IA temporariamente indisponível (integração LLM não configurada)")


@api_router.get("/portarias/search")
async def search_portarias(q: str, current_user: User = Depends(get_current_user)):
    """Search portarias by keyword"""
    query = {
        "$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"detran": {"$regex": q, "$options": "i"}}
        ],
        "deleted_at": None,
    }
    if current_user.perfil not in ("sigcr_admin", "detran", "detran_admin"):
        # Mesma regra de GET /portarias: rascunho do wizard não aparece pra
        # fora do DETRAN/admin, nem por busca.
        query["$and"] = [{"$or": [{"criado_via": {"$ne": "wizard"}}, {"publicado_at": {"$ne": None}}]}]
    portarias = await db.portarias.find(query, {"_id": 0}).to_list(100)
    return portarias


# =========== Querido Diario Integration ===========
# IMPORTANTE: precisa vir ANTES das rotas com {portaria_id} abaixo — caso contrário
# "/portarias/queridodiario" seria casado como portaria_id="queridodiario" pelo FastAPI
# (rotas literais devem sempre ser registradas antes de rotas com parâmetro dinâmico
# no mesmo prefixo e método).

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


@api_router.get("/portarias/publico/{token}")
async def get_portaria_publica(token: str):
    """Preview público (sem autenticação) de uma portaria publicada — destino
    do link_publico compartilhado no Diário Oficial. Checklist devolvido sem
    filtro de perfil (a empresa ainda não está logada nesse ponto). Precisa
    vir ANTES de GET /portarias/{portaria_id} nesta ordem de declaração,
    senão o FastAPI casaria "publico" como se fosse um portaria_id."""
    portaria = await db.portarias.find_one(
        {"token_publico": token, "publicado_at": {"$ne": None}, "deleted_at": None},
        {"_id": 0}
    )
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    return {
        "portaria_id": portaria["portaria_id"],
        "title": portaria["title"],
        "summary": portaria.get("summary"),
        "estado_sigla": portaria.get("estado_sigla"),
        "tipo": portaria.get("tipo"),
        "template": portaria.get("template"),
        "checklist_itens": portaria.get("checklist_itens", []),
        "data_abertura": portaria.get("data_abertura"),
        "data_encerramento": portaria.get("data_encerramento"),
        "publicado_at": portaria.get("publicado_at"),
    }


@api_router.get("/portarias/{portaria_id}", response_model=Portaria)
async def get_portaria(portaria_id: str, scope: EffectiveScope = Depends(get_effective_scope)):
    """Detalhe de uma portaria (permite ver mesmo se removida — mesma convenção de GET /documentos/{id}).
    Além de sigcr_admin/detran/detran_admin (via _perfil_pode_ver_estado), uma
    empresa registradora/financeira também enxerga a portaria de uma UF em que
    ela mesma atua (detrans_atuacao) — necessário pro fluxo de credenciamento
    por portaria (Passo B: a empresa precisa ver o checklist publicado). Nesse
    caso o checklist devolvido é filtrado só pros itens do perfil da empresa.

    EffectiveScope (não current_user direto) pelo mesmo motivo de GET /portarias:
    "ver como" simulado precisa valer aqui também, senão o admin simulando
    registradora enxergaria (ou não) detalhes de portaria de forma diferente
    da lista, inconsistência que seria seu próprio tipo de falso-positivo."""
    current_user = scope.as_user()
    portaria = await db.portarias.find_one({"portaria_id": portaria_id}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    eh_registradora_ou_financeira = current_user.perfil in ("registradora", "financeira")
    sem_pdf_anexado = not portaria.get("link_pdf")
    eh_rascunho_de_wizard = portaria.get("criado_via") == "wizard" and not portaria.get("publicado_at")
    if eh_registradora_ou_financeira and (sem_pdf_anexado or eh_rascunho_de_wizard):
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    if portaria.get("estado_sigla"):
        empresa = await _empresa_do_usuario(current_user)
        empresa_atua = bool(empresa) and portaria["estado_sigla"] in (empresa.get("detrans_atuacao") or [])
        if not _perfil_pode_ver_estado(current_user, portaria["estado_sigla"]) and not empresa_atua:
            raise HTTPException(status_code=403, detail="Perfil sem acesso a esta portaria")
        if empresa:
            tipo_empresa = empresa.get("tipo_empresa", "registradora")
            portaria["checklist_itens"] = [
                i for i in (portaria.get("checklist_itens") or []) if i.get("perfil_alvo") == tipo_empresa
            ]
    return portaria


@api_router.get("/portarias/{portaria_id}/pdf")
async def download_portaria_pdf(portaria_id: str, scope: EffectiveScope = Depends(get_effective_scope)):
    """Bug real encontrado 2026-08-13 (achado ao investigar erro de download
    relatado pelo Pedro nas 2 portarias restauradas naquele dia): esta rota
    checava só `_perfil_pode_ver_estado`, que é SEMPRE False pra
    registradora/financeira — diferente de GET /portarias e GET
    /portarias/{id}, que também liberam via `empresa_atua` (a empresa opera
    naquela UF, `detrans_atuacao`). Resultado: toda registradora/financeira
    levava 403 tentando baixar o PDF de QUALQUER portaria que conseguia ver
    normalmente na lista/detalhe — não era um bug das 2 portarias restauradas
    especificamente, é geral, pré-existente, só ficou visível porque essas
    duas acabaram de ser verificadas. Corrigido replicando a MESMA regra de
    GET /portarias/{id} aqui. EffectiveScope (em vez de current_user direto)
    também pra ficar consistente com a simulação "ver como" adicionada nesta
    mesma leva de fixes."""
    current_user = scope.as_user()
    portaria = await db.portarias.find_one({"portaria_id": portaria_id}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    if portaria.get("estado_sigla"):
        empresa = await _empresa_do_usuario(current_user)
        empresa_atua = bool(empresa) and portaria["estado_sigla"] in (empresa.get("detrans_atuacao") or [])
        if not _perfil_pode_ver_estado(current_user, portaria["estado_sigla"]) and not empresa_atua:
            raise HTTPException(status_code=403, detail="Perfil sem acesso a esta portaria")
    if not portaria.get("link_pdf") or not Path(portaria["link_pdf"]).exists():
        raise HTTPException(status_code=404, detail="Nenhum PDF anexado a esta portaria")
    await registrar_auditoria(scope.current_user, "download_portaria_pdf", "portaria", portaria_id, {
        "estado_sigla": portaria.get("estado_sigla")
    })
    return FileResponse(
        portaria["link_pdf"], media_type="application/pdf",
        filename=f"portaria_{portaria.get('numero') or portaria_id}.pdf"
    )


@api_router.patch("/portarias/{portaria_id}", response_model=Portaria)
async def atualizar_portaria(portaria_id: str, updates: PortariaUpdate, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    portaria = await db.portarias.find_one({"portaria_id": portaria_id, "deleted_at": None}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada ou removida")
    if portaria.get("estado_sigla"):
        await _checar_permissao_escrita_estado(current_user, portaria["estado_sigla"])

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return portaria
    if isinstance(campos.get("date"), datetime):
        campos["date"] = campos["date"].isoformat()
    antes = {k: portaria.get(k) for k in campos}
    campos["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.portarias.update_one({"portaria_id": portaria_id}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_portaria", "portaria", portaria_id, {
        "estado_sigla": portaria.get("estado_sigla"), "antes": antes,
        "depois": {k: v for k, v in campos.items() if k != "updated_at"}
    })
    return await db.portarias.find_one({"portaria_id": portaria_id}, {"_id": 0})


@api_router.patch("/portarias/{portaria_id}/publicar", response_model=Portaria)
async def publicar_portaria(portaria_id: str, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    """Publica uma portaria criada pelo wizard "Criar Evento": sai de rascunho
    (publicado_at=None) para publicada, gera link público e notifica só as
    empresas registradora/financeira que atuam na UF da portaria (corrige o
    comportamento antigo de /eventos/{id}/publicar, que notificava TODAS as
    registradoras sem filtro de UF)."""
    portaria = await db.portarias.find_one({"portaria_id": portaria_id, "deleted_at": None}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada ou removida")
    if portaria.get("estado_sigla"):
        await _checar_permissao_escrita_estado(current_user, portaria["estado_sigla"])
    if portaria.get("publicado_at"):
        return portaria

    token_publico = portaria.get("token_publico") or uuid.uuid4().hex[:16]
    link_publico = portaria.get("link_publico") or f"https://sigcr.com.br/portarias/publico/{token_publico}"
    campos = {
        "publicado_at": datetime.now(timezone.utc).isoformat(),
        "token_publico": token_publico,
        "link_publico": link_publico,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.portarias.update_one({"portaria_id": portaria_id}, {"$set": campos})

    if portaria.get("estado_sigla"):
        # Só notifica quem tem algo a fazer: empresa cujo tipo_empresa bate com
        # o perfil_alvo de pelo menos 1 item do checklist desta portaria. Sem
        # isso, uma portaria com checklist só pra registradora notificava
        # financeiras da mesma UF do mesmo jeito (achado do levantamento do
        # ciclo Portaria→Submissão, PENDING_ACTIONS.md).
        perfis_com_checklist = {
            i.get("perfil_alvo") for i in (portaria.get("checklist_itens") or [])
            if i.get("perfil_alvo")
        }
        if perfis_com_checklist:
            empresas = await db.companies.find(
                {
                    "detrans_atuacao": portaria["estado_sigla"],
                    "deleted_at": None,
                    "tipo_empresa": {"$in": list(perfis_com_checklist)},
                },
                {"_id": 0, "user_id": 1}
            ).to_list(1000)
            for empresa in empresas:
                if empresa.get("user_id"):
                    await criar_notificacao(
                        empresa["user_id"], "novo_edital",
                        f"Novo Credenciamento — DETRAN-{portaria['estado_sigla']}",
                        f"Portaria publicada: {portaria['title']}",
                        {"portaria_id": portaria_id}
                    )

    await registrar_auditoria(current_user, "publicar_portaria", "portaria", portaria_id, {
        "estado_sigla": portaria.get("estado_sigla")
    })
    return await db.portarias.find_one({"portaria_id": portaria_id}, {"_id": 0})


@api_router.delete("/portarias/{portaria_id}")
async def remover_portaria(portaria_id: str, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    portaria = await db.portarias.find_one({"portaria_id": portaria_id, "deleted_at": None}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada ou já removida")
    if portaria.get("estado_sigla"):
        await _checar_permissao_escrita_estado(current_user, portaria["estado_sigla"])
    em_uso = await db.submissoes.find_one({"portaria_id": portaria_id})
    if em_uso:
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir: há submissões em andamento para esta portaria. Revogue-a em vez de excluir."
        )

    await db.portarias.update_one(
        {"portaria_id": portaria_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "remover_portaria", "portaria", portaria_id, {
        "estado_sigla": portaria.get("estado_sigla")
    })
    return {"message": "Portaria removida"}


# ============ Estados/Credenciamento Routes ============
# db.estados só ganha um documento quando um estado é efetivamente ATIVADO para
# acompanhamento de credenciamento — o catálogo estático das 27 UFs (UF_NOMES) sempre
# aparece em GET /estados independente disso, mas "criar"/"editar"/"dar baixa" só fazem
# sentido em cima de um estado ativado.

@api_router.get("/estados")
async def get_estados(current_user: User = Depends(get_current_user)):
    """Lista as 27 UFs (catálogo estático) com merge dos estados já ativados em db.estados
    e contagem de credenciamentos ativos por UF."""
    ativados = await db.estados.find({"deleted_at": None}, {"_id": 0}).to_list(30)
    ativados_por_sigla = {e["estado_sigla"]: e for e in ativados}

    estados_brasil = []
    for sigla, nome in UF_NOMES.items():
        count = await db.credenciamentos.count_documents({"estado_sigla": sigla, "deleted_at": None})
        ativado = ativados_por_sigla.get(sigla)
        estados_brasil.append({
            "sigla": sigla,
            "nome": nome,
            "configurado": ativado is not None,
            "estado_id": ativado.get("estado_id") if ativado else None,
            "portaria_vigente": ativado.get("portaria_vigente") if ativado else None,
            "empresas_credenciadas_count": count,
        })
    estados_brasil.sort(key=lambda e: e["nome"])
    return estados_brasil


@api_router.get("/estados/{sigla}")
async def get_estado_detalhes(sigla: str, current_user: User = Depends(get_current_user)):
    """Detalhe de um estado: dados de acompanhamento (se ativado) + credenciamentos ativos + portarias vigentes."""
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    if not _perfil_pode_ver_estado(current_user, sigla):
        raise HTTPException(status_code=403, detail="Perfil sem acesso a este estado")

    estado = await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})

    credenciamentos = await db.credenciamentos.find({"estado_sigla": sigla, "deleted_at": None}, {"_id": 0}).to_list(100)
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

    total_portarias_vigentes = await db.portarias.count_documents({
        "estado_sigla": sigla, "status": "vigente", "deleted_at": None
    })

    return {
        "estado_sigla": sigla,
        "estado_nome": UF_NOMES[sigla],
        "configurado": estado is not None,
        "estado": estado,
        "empresas_credenciadas": empresas,
        "total_empresas": len(empresas),
        "total_portarias_vigentes": total_portarias_vigentes,
    }


@api_router.post("/estados", response_model=EstadoCredenciamento)
async def ativar_estado(dados: EstadoCredenciamentoCreate, current_user: User = Depends(get_current_user)):
    """Ativa uma UF para acompanhamento de credenciamento (ou reativa se estava com baixa dada)."""
    sigla = dados.estado_sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    await _checar_permissao_escrita_estado(current_user, sigla)

    existente = await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})
    if existente and not existente.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Este estado já está ativado")
    if existente and existente.get("deleted_at"):
        await db.estados.update_one(
            {"estado_sigla": sigla},
            {"$set": {"deleted_at": None, "deleted_by": None, "observacoes": dados.observacoes,
                       "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await registrar_auditoria(current_user, "reativar_estado", "estado", existente["estado_id"], {"estado_sigla": sigla})
        return await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})

    estado = EstadoCredenciamento(estado_sigla=sigla, estado_nome=UF_NOMES[sigla],
                                   observacoes=dados.observacoes, created_by=current_user.user_id)
    doc = estado.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.estados.insert_one(doc)
    await registrar_auditoria(current_user, "ativar_estado", "estado", estado.estado_id, {"estado_sigla": sigla})
    return estado


@api_router.patch("/estados/{sigla}", response_model=EstadoCredenciamento)
async def atualizar_estado(sigla: str, updates: EstadoCredenciamentoUpdate, current_user: User = Depends(get_current_user)):
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    estado = await db.estados.find_one({"estado_sigla": sigla, "deleted_at": None}, {"_id": 0})
    if not estado:
        raise HTTPException(status_code=404, detail="Estado não está ativado (ou foi removido)")
    await _checar_permissao_escrita_estado(current_user, sigla)

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return estado
    antes = {k: estado.get(k) for k in campos}
    campos["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.estados.update_one({"estado_sigla": sigla}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_estado", "estado", estado["estado_id"], {
        "estado_sigla": sigla, "antes": antes, "depois": {k: v for k, v in campos.items() if k != "updated_at"}
    })
    return await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})


@api_router.delete("/estados/{sigla}")
async def dar_baixa_estado(sigla: str, current_user: User = Depends(get_current_user)):
    """Soft delete do registro de acompanhamento do estado — não cascateia para
    portarias/credenciamentos/documentos já vinculados a essa UF."""
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    estado = await db.estados.find_one({"estado_sigla": sigla, "deleted_at": None}, {"_id": 0})
    if not estado:
        raise HTTPException(status_code=404, detail="Estado não está ativado (ou já removido)")
    await _checar_permissao_escrita_estado(current_user, sigla)

    await db.estados.update_one(
        {"estado_sigla": sigla},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "dar_baixa_estado", "estado", estado["estado_id"], {"estado_sigla": sigla})
    return {"message": "Estado removido do acompanhamento"}


@api_router.post("/estados/{sigla}/reativar", response_model=EstadoCredenciamento)
async def reativar_estado(sigla: str, current_user: User = Depends(get_current_user)):
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    estado = await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})
    if not estado or not estado.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Estado não está com baixa dada")
    await _checar_permissao_escrita_estado(current_user, sigla)

    await db.estados.update_one({"estado_sigla": sigla}, {"$set": {"deleted_at": None, "deleted_by": None}})
    await registrar_auditoria(current_user, "reativar_estado", "estado", estado["estado_id"], {"estado_sigla": sigla})
    return await db.estados.find_one({"estado_sigla": sigla}, {"_id": 0})


# ============ Credenciamentos (empresa x estado) Routes ============

@api_router.get("/estados/{sigla}/credenciamentos")
async def listar_credenciamentos_estado(
    sigla: str, incluir_removidos: bool = False, current_user: User = Depends(get_current_user)
):
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    if not _perfil_pode_ver_estado(current_user, sigla):
        raise HTTPException(status_code=403, detail="Perfil sem acesso a este estado")

    query = {"estado_sigla": sigla}
    if not incluir_removidos:
        query["deleted_at"] = None
    credenciamentos = await db.credenciamentos.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return credenciamentos


@api_router.get("/detran/registradoras")
async def listar_registradoras_detran(estado_sigla: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Visão agregada 'Registradoras' do DETRAN: cadastro de cada registradora
    que atua na UF (Company.detrans_atuacao contém a UF) + resumo de status de
    credenciamento por portaria (Submissao, uma por par empresa/portaria) —
    une a tela Empresa (cadastro) com uma fatia de PainelConferencia.js
    (status de submissão) filtrada por empresa em vez de por portaria. Mesmo
    escopo por UF de tudo mais no domínio DETRAN (_perfil_pode_ver_estado):
    sigcr_admin escolhe a UF via query param; detran/detran_admin só a
    própria (detran_uf), parâmetro ignorado se enviado.

    Restaurado 2026-08-12 (PENDING_ACTIONS.md item 19): o item 15
    (2026-08-11) já havia entregado esse endpoint, mas por ter sido
    deployado a partir de um worktree isolado sem nunca ser commitado, foi
    silenciosamente perdido numa sobrescrita posterior (item 17) — o
    frontend (Registradoras.js) ficou no ar chamando uma rota inexistente
    (404) sem ninguém perceber. Validado de novo em devtest antes de
    voltar (7 cenários: sem auth, sigcr_admin com/sem UF, UF inválida,
    detran com UF própria e tentando forçar outra UF via query param,
    perfil sem acesso)."""
    if current_user.perfil == "sigcr_admin":
        if not estado_sigla:
            raise HTTPException(status_code=400, detail="estado_sigla é obrigatório para este perfil")
        uf = estado_sigla.upper()
    elif current_user.perfil in ("detran", "detran_admin"):
        if not current_user.detran_uf:
            raise HTTPException(status_code=403, detail="Usuário sem UF configurada")
        uf = current_user.detran_uf
    else:
        raise HTTPException(status_code=403, detail="Perfil sem acesso a esta visão")
    if uf not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")

    empresas = await db.companies.find(
        {"tipo_empresa": "registradora", "detrans_atuacao": uf, "deleted_at": None}, {"_id": 0}
    ).sort("nome_fantasia", 1).to_list(500)

    company_ids = [e["company_id"] for e in empresas]
    submissoes = await db.submissoes.find(
        {"company_id": {"$in": company_ids}, "estado_sigla": uf, "deleted_at": None}, {"_id": 0}
    ).to_list(1000) if company_ids else []

    portaria_ids = list({s["portaria_id"] for s in submissoes})
    portarias = await db.portarias.find(
        {"portaria_id": {"$in": portaria_ids}}, {"_id": 0, "portaria_id": 1, "title": 1, "numero": 1}
    ).to_list(500) if portaria_ids else []
    portarias_por_id = {p["portaria_id"]: p for p in portarias}

    subs_por_empresa = {}
    for s in submissoes:
        subs_por_empresa.setdefault(s["company_id"], []).append(s)

    # Compliance de documentos por empresa (Item 1 do Dashboard, 2026-08-27:
    # os cards DOCUMENTOS/PENDÊNCIAS/Semáforo do DETRAN precisam de um destino
    # real — a lista de registradoras já existente ganha esses 2 campos a
    # mais em vez de construir uma tela nova de "documentos" que não existia).
    # Mesma lógica de cálculo por-empresa que GET /stats usa.
    docs_por_empresa = {}
    if company_ids:
        docs = await db.documents.find({"company_id": {"$in": company_ids}}, {"_id": 0}).to_list(5000)
        for d in docs:
            docs_por_empresa.setdefault(d["company_id"], []).append(d)

    resultado = []
    for e in empresas:
        subs_resumo = []
        for s in subs_por_empresa.get(e["company_id"], []):
            itens = s.get("itens", [])
            portaria = portarias_por_id.get(s["portaria_id"], {})
            subs_resumo.append({
                "submissao_id": s["submissao_id"],
                "portaria_id": s["portaria_id"],
                "portaria_titulo": portaria.get("title"),
                "portaria_numero": portaria.get("numero"),
                "status": s["status"],
                "total_itens": len(itens),
                "itens_conforme": sum(1 for i in itens if i.get("status") == "conforme"),
                "itens_inconforme": sum(1 for i in itens if i.get("status") == "inconforme"),
                "itens_pendentes": sum(1 for i in itens if i.get("status") in ("pendente", "enviado")),
                "homologado_em": s.get("homologado_em"),
                "itens": [
                    {"item_id": i.get("item_id"), "nome": i.get("nome"), "status": i.get("status"),
                     "justificativa": i.get("justificativa")}
                    for i in itens
                ],
            })
        docs_empresa = docs_por_empresa.get(e["company_id"], [])
        docs_pendentes = sum(1 for d in docs_empresa if d.get("status") == "pending")
        vencidos = sum(1 for d in docs_empresa if calcular_status_documento(d) == "vencido")
        vencendo = sum(1 for d in docs_empresa if calcular_status_documento(d) == "vencendo")
        compliance = "vencido" if vencidos > 0 else "vencendo" if vencendo > 0 else "valido"
        resultado.append({
            "company_id": e["company_id"],
            "name": e["name"],
            "nome_fantasia": e["nome_fantasia"],
            "cnpj": e["cnpj"],
            "email_comercial": e.get("email_comercial"),
            "gestor_contrato": e.get("gestor_contrato"),
            "endereco": e.get("endereco"),
            "whatsapp": e.get("whatsapp"),
            "detrans_atuacao": e.get("detrans_atuacao", []),
            "status": e.get("status"),
            "created_at": e.get("created_at"),
            "submissoes": subs_resumo,
            "total_portarias_respondidas": len(subs_resumo),
            "total_homologadas": sum(1 for s in subs_resumo if s["status"] == "homologado"),
            "total_documentos": len(docs_empresa),
            "docs_pendentes": docs_pendentes,
            "compliance": compliance,
        })
    return resultado


@api_router.get("/detran/financeiras")
async def listar_financeiras_detran(estado_sigla: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Visão agregada 'Financeiras' do DETRAN — espelha listar_registradoras_detran
    acima ponto a ponto (mesmo escopo por UF, mesma junção com Submissao),
    só troca tipo_empresa='registradora' por 'financeira'. Existe porque o
    Dashboard (Item 1 do pedido do Pedro, 2026-08-27) precisa de um card
    "Financeiras" pro sigcr_admin/DETRAN tão real quanto o "Registradoras"
    já existente — antes desta rota, não havia nenhuma visão agregada de
    financeiras fora da própria conta da financeira. Único campo a mais:
    registradora_id, pra DETRAN saber a qual registradora cada financeira
    está vinculada (financeira não faz sentido isolada, sempre depende de
    uma registradora com contrato ativo — ver _validar_tipo_e_vinculo_empresa)."""
    if current_user.perfil == "sigcr_admin":
        if not estado_sigla:
            raise HTTPException(status_code=400, detail="estado_sigla é obrigatório para este perfil")
        uf = estado_sigla.upper()
    elif current_user.perfil in ("detran", "detran_admin"):
        if not current_user.detran_uf:
            raise HTTPException(status_code=403, detail="Usuário sem UF configurada")
        uf = current_user.detran_uf
    else:
        raise HTTPException(status_code=403, detail="Perfil sem acesso a esta visão")
    if uf not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")

    empresas = await db.companies.find(
        {"tipo_empresa": "financeira", "detrans_atuacao": uf, "deleted_at": None}, {"_id": 0}
    ).sort("nome_fantasia", 1).to_list(500)

    company_ids = [e["company_id"] for e in empresas]
    submissoes = await db.submissoes.find(
        {"company_id": {"$in": company_ids}, "estado_sigla": uf, "deleted_at": None}, {"_id": 0}
    ).to_list(1000) if company_ids else []

    portaria_ids = list({s["portaria_id"] for s in submissoes})
    portarias = await db.portarias.find(
        {"portaria_id": {"$in": portaria_ids}}, {"_id": 0, "portaria_id": 1, "title": 1, "numero": 1}
    ).to_list(500) if portaria_ids else []
    portarias_por_id = {p["portaria_id"]: p for p in portarias}

    subs_por_empresa = {}
    for s in submissoes:
        subs_por_empresa.setdefault(s["company_id"], []).append(s)

    registradora_ids = list({e["registradora_id"] for e in empresas if e.get("registradora_id")})
    registradoras = await db.companies.find(
        {"company_id": {"$in": registradora_ids}}, {"_id": 0, "company_id": 1, "nome_fantasia": 1}
    ).to_list(500) if registradora_ids else []
    registradoras_por_id = {r["company_id"]: r for r in registradoras}

    resultado = []
    for e in empresas:
        subs_resumo = []
        for s in subs_por_empresa.get(e["company_id"], []):
            itens = s.get("itens", [])
            portaria = portarias_por_id.get(s["portaria_id"], {})
            subs_resumo.append({
                "submissao_id": s["submissao_id"],
                "portaria_id": s["portaria_id"],
                "portaria_titulo": portaria.get("title"),
                "portaria_numero": portaria.get("numero"),
                "status": s["status"],
                "total_itens": len(itens),
                "itens_conforme": sum(1 for i in itens if i.get("status") == "conforme"),
                "itens_inconforme": sum(1 for i in itens if i.get("status") == "inconforme"),
                "itens_pendentes": sum(1 for i in itens if i.get("status") in ("pendente", "enviado")),
                "homologado_em": s.get("homologado_em"),
                "itens": [
                    {"item_id": i.get("item_id"), "nome": i.get("nome"), "status": i.get("status"),
                     "justificativa": i.get("justificativa")}
                    for i in itens
                ],
            })
        registradora_vinculada = registradoras_por_id.get(e.get("registradora_id"))
        resultado.append({
            "company_id": e["company_id"],
            "name": e["name"],
            "nome_fantasia": e["nome_fantasia"],
            "cnpj": e["cnpj"],
            "email_comercial": e.get("email_comercial"),
            "gestor_contrato": e.get("gestor_contrato"),
            "endereco": e.get("endereco"),
            "whatsapp": e.get("whatsapp"),
            "detrans_atuacao": e.get("detrans_atuacao", []),
            "status": e.get("status"),
            "created_at": e.get("created_at"),
            "registradora_id": e.get("registradora_id"),
            "registradora_nome_fantasia": registradora_vinculada.get("nome_fantasia") if registradora_vinculada else None,
            "submissoes": subs_resumo,
            "total_portarias_respondidas": len(subs_resumo),
            "total_homologadas": sum(1 for s in subs_resumo if s["status"] == "homologado"),
        })
    return resultado


@api_router.post("/estados/{sigla}/credenciamentos", response_model=CredenciamentoDetalhes)
async def criar_credenciamento(sigla: str, dados: CredenciamentoDetalhesCreate, current_user: User = Depends(get_current_user)):
    sigla = sigla.upper()
    if sigla not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")
    await _checar_permissao_escrita_estado(current_user, sigla)

    company = await db.companies.find_one({"company_id": dados.company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=400, detail="Empresa (company_id) não encontrada")

    credenciamento = CredenciamentoDetalhes(estado_sigla=sigla, created_by=current_user.user_id, **dados.model_dump())
    doc = credenciamento.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("validade"):
        doc["validade"] = doc["validade"].isoformat()
    await db.credenciamentos.insert_one(doc)
    await registrar_auditoria(current_user, "criar_credenciamento", "credenciamento", credenciamento.credenciamento_id, {
        "estado_sigla": sigla, "company_id": dados.company_id
    })
    return credenciamento


@api_router.patch("/credenciamentos/{credenciamento_id}", response_model=CredenciamentoDetalhes)
async def atualizar_credenciamento(credenciamento_id: str, updates: CredenciamentoDetalhesUpdate, current_user: User = Depends(get_current_user)):
    credenciamento = await db.credenciamentos.find_one({"credenciamento_id": credenciamento_id, "deleted_at": None}, {"_id": 0})
    if not credenciamento:
        raise HTTPException(status_code=404, detail="Credenciamento não encontrado ou removido")
    await _checar_permissao_escrita_estado(current_user, credenciamento["estado_sigla"])

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return credenciamento
    if isinstance(campos.get("validade"), datetime):
        campos["validade"] = campos["validade"].isoformat()
    antes = {k: credenciamento.get(k) for k in campos}
    campos["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.credenciamentos.update_one({"credenciamento_id": credenciamento_id}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_credenciamento", "credenciamento", credenciamento_id, {
        "estado_sigla": credenciamento["estado_sigla"], "antes": antes,
        "depois": {k: v for k, v in campos.items() if k != "updated_at"}
    })
    return await db.credenciamentos.find_one({"credenciamento_id": credenciamento_id}, {"_id": 0})


@api_router.delete("/credenciamentos/{credenciamento_id}")
async def dar_baixa_credenciamento(credenciamento_id: str, current_user: User = Depends(get_current_user)):
    credenciamento = await db.credenciamentos.find_one({"credenciamento_id": credenciamento_id, "deleted_at": None}, {"_id": 0})
    if not credenciamento:
        raise HTTPException(status_code=404, detail="Credenciamento não encontrado ou já removido")
    await _checar_permissao_escrita_estado(current_user, credenciamento["estado_sigla"])

    await db.credenciamentos.update_one(
        {"credenciamento_id": credenciamento_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.user_id}}
    )
    await registrar_auditoria(current_user, "dar_baixa_credenciamento", "credenciamento", credenciamento_id, {
        "estado_sigla": credenciamento["estado_sigla"]
    })
    return {"message": "Credenciamento removido"}


# ============ Submissões (credenciamento por portaria) Routes ============
# Fluxo: DETRAN publica portaria com checklist_itens (Passo A, ver Portaria
# routes acima) -> empresa cria uma Submissao pra aquela portaria e sobe
# documentos item a item (Passo B) -> DETRAN analisa cada item, marcando
# conforme/inconforme com justificativa obrigatória (Passo C) -> ciclo de
# diligência permite reenvio dos itens inconformes até homologação (Passo D).
# Processo paralelo ao checklist fixo de cadastro-base (CONTRAN 807/Edital
# 003) — não o altera, só reaproveita a coleção db.documents pros arquivos.

async def _notificar_detran_uf(estado_sigla: str, tipo: str, titulo: str, mensagem: str, dados: dict = None):
    """Notifica todos os usuários detran/detran_admin da UF — usado quando uma
    empresa submete/reenvia, já que uma submissão não tem um usuário DETRAN
    individual dono, só um escopo de UF."""
    usuarios = await db.users.find(
        {"perfil": {"$in": ["detran", "detran_admin"]}, "detran_uf": estado_sigla}, {"_id": 0, "user_id": 1}
    ).to_list(50)
    for u in usuarios:
        await criar_notificacao(u["user_id"], tipo, titulo, mensagem, dados)


async def _autorizar_acesso_submissao(submissao: dict, current_user: User):
    """Dono da empresa da submissão, ou DETRAN/admin com acesso à UF dela."""
    empresa = await _empresa_do_usuario(current_user)
    if empresa and empresa["company_id"] == submissao["company_id"]:
        return
    if _perfil_pode_ver_estado(current_user, submissao["estado_sigla"]):
        return
    raise HTTPException(status_code=403, detail="Sem acesso a esta submissão")


@api_router.get("/submissoes")
async def listar_submissoes(
    estado_sigla: Optional[str] = None,
    status: Optional[str] = None,
    scope: EffectiveScope = Depends(get_effective_scope),
):
    """Registradora/financeira: só as próprias submissões (por company_id).
    DETRAN/detran_admin/sigcr_admin: escopado por estado_sigla (obrigatório,
    e restrito à própria UF pra detran/detran_admin via _perfil_pode_ver_estado).

    EffectiveScope: sigcr_admin simulando "ver como" registradora/financeira
    cai no ramo de empresa (via _empresa_do_usuario) em vez de sempre exigir
    estado_sigla como se fosse DETRAN — sem isso a simulação de empresa não
    alcançava esta tela (Credenciamento por Portaria) de jeito nenhum."""
    current_user = scope.as_user()
    query = {"deleted_at": None}
    empresa = await _empresa_do_usuario(current_user)
    if empresa:
        query["company_id"] = empresa["company_id"]
    else:
        if not estado_sigla:
            raise HTTPException(status_code=400, detail="estado_sigla é obrigatório para este perfil")
        estado_sigla = estado_sigla.upper()
        if estado_sigla not in UF_VALIDAS:
            raise HTTPException(status_code=400, detail="UF inválida")
        if not _perfil_pode_ver_estado(current_user, estado_sigla):
            raise HTTPException(status_code=403, detail="Perfil sem acesso a este estado")
        query["estado_sigla"] = estado_sigla
    if status:
        query["status"] = status
    return await db.submissoes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.get("/submissoes/{submissao_id}")
async def get_submissao(submissao_id: str, current_user: User = Depends(get_current_user)):
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    await _autorizar_acesso_submissao(submissao, current_user)
    return submissao


@api_router.post("/submissoes", response_model=Submissao)
async def criar_submissao(portaria_id: str, current_user: User = Depends(get_current_user)):
    """Get-or-create idempotente: se a empresa já tem uma submissão (não
    removida) pra esta portaria, devolve ela em vez de criar duplicata."""
    empresa = await _empresa_do_usuario(current_user)
    if not empresa:
        raise HTTPException(status_code=403, detail="Apenas registradora/financeira podem criar uma submissão")

    portaria = await db.portarias.find_one({"portaria_id": portaria_id, "deleted_at": None}, {"_id": 0})
    if not portaria:
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    if portaria.get("criado_via") == "wizard" and not portaria.get("publicado_at"):
        # Defesa em profundidade: mesmo que o portaria_id vaze por algum outro
        # caminho, um rascunho do wizard não pode virar submissão antes de publicado.
        raise HTTPException(status_code=404, detail="Portaria não encontrada")
    estado_sigla = portaria.get("estado_sigla")
    if not estado_sigla or estado_sigla not in (empresa.get("detrans_atuacao") or []):
        raise HTTPException(status_code=403, detail="Empresa não atua na UF desta portaria")

    tipo_empresa = empresa.get("tipo_empresa", "registradora")
    itens_portaria = [i for i in (portaria.get("checklist_itens") or []) if i.get("perfil_alvo") == tipo_empresa]
    if not itens_portaria:
        raise HTTPException(status_code=400, detail="Esta portaria não define checklist para o perfil da sua empresa")

    existente = await db.submissoes.find_one({
        "portaria_id": portaria_id, "company_id": empresa["company_id"], "deleted_at": None
    }, {"_id": 0})
    if existente:
        return existente

    submissao = Submissao(
        portaria_id=portaria_id,
        estado_sigla=estado_sigla,
        company_id=empresa["company_id"],
        perfil_empresa=tipo_empresa,
        itens=[
            SubmissaoItem(item_id=i["item_id"], nome=i["nome"], descricao=i.get("descricao"), perfil_alvo=tipo_empresa)
            for i in itens_portaria
        ],
        created_by=current_user.user_id,
    )
    doc = submissao.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.submissoes.insert_one(doc)
    await registrar_auditoria(current_user, "criar_submissao", "submissao", submissao.submissao_id, {
        "portaria_id": portaria_id, "estado_sigla": estado_sigla
    })
    return submissao


@api_router.post("/submissoes/{submissao_id}/itens/{item_id}/upload")
async def upload_item_submissao(
    submissao_id: str,
    item_id: str,
    numero_documento: str = Form(...),
    data_emissao: str = Form(...),
    data_validade: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload de um documento pra um item do checklist (Passo B) — e também o
    mecanismo de reenvio durante a diligência (Passo D): reenviar um item
    inconforme volta ele pra 'enviado' e arquiva a justificativa anterior."""
    empresa = await _empresa_do_usuario(current_user)
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    if not empresa or empresa["company_id"] != submissao["company_id"]:
        raise HTTPException(status_code=403, detail="Sem acesso a esta submissão")
    if submissao["status"] not in ("rascunho", "em_diligencia"):
        raise HTTPException(status_code=400, detail="Submissão não aceita novos envios neste status")

    itens = submissao["itens"]
    item = next((i for i in itens if i["item_id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado nesta submissão")
    if submissao["status"] == "em_diligencia" and item["status"] != "inconforme":
        raise HTTPException(status_code=400, detail="Apenas itens marcados inconforme podem ser reenviados em diligência")

    try:
        data_emissao_parsed = datetime.fromisoformat(data_emissao).date().isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="data_emissao inválida (use ISO 8601, AAAA-MM-DD)")
    data_validade_parsed = None
    if data_validade:
        try:
            data_validade_parsed = datetime.fromisoformat(data_validade).date().isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="data_validade inválida (use ISO 8601, AAAA-MM-DD)")

    file_extension = Path(file.filename).suffix if file.filename else ""
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    try:
        async with aiofiles.open(file_path, "wb") as f:
            conteudo = await file.read()
            await f.write(conteudo)
    except Exception:
        logger.error("Error saving submissao file")
        raise HTTPException(status_code=500, detail="Erro ao salvar arquivo")

    document = Document(
        company_id=submissao["company_id"],
        document_type="submissao_checklist",
        document_name=item["nome"],
        file_name=file.filename or "unknown",
        file_path=str(file_path),
        file_size=len(conteudo),
        numero_documento=numero_documento,
        data_emissao=data_emissao_parsed,
        vencimento=data_validade_parsed,
        vencimento_fonte="manual" if data_validade_parsed else None,
        submissao_id=submissao_id,
    )
    doc_dict = document.model_dump()
    doc_dict["created_at"] = doc_dict["created_at"].isoformat()
    await db.documents.insert_one(doc_dict)

    historico_entry = None
    if item["status"] == "inconforme":
        historico_entry = {
            "status": "inconforme", "justificativa": item.get("justificativa"),
            "registrado_por": item.get("analisado_por"), "registrado_em": item.get("analisado_em"),
        }
    for i in itens:
        if i["item_id"] == item_id:
            i["status"] = "enviado"
            i["document_id"] = document.document_id
            i["justificativa"] = None
            i["analisado_por"] = None
            i["analisado_em"] = None
            if historico_entry:
                i.setdefault("historico", []).append(historico_entry)

    update_fields = {"itens": itens}
    volta_analise = submissao["status"] == "em_diligencia" and all(i["status"] != "inconforme" for i in itens)
    if volta_analise:
        update_fields["status"] = "em_analise"

    await db.submissoes.update_one({"submissao_id": submissao_id}, {"$set": update_fields})
    await registrar_auditoria(current_user, "upload_item_submissao", "submissao", submissao_id, {
        "item_id": item_id, "document_id": document.document_id
    })
    if volta_analise:
        await _notificar_detran_uf(
            submissao["estado_sigla"], "submissao_recebida", "Submissão atualizada",
            f"Itens reenviados na submissão {submissao_id} — pronta para nova análise.", {"submissao_id": submissao_id}
        )
    return await db.submissoes.find_one({"submissao_id": submissao_id}, {"_id": 0})


@api_router.post("/submissoes/{submissao_id}/submeter")
async def submeter_submissao(submissao_id: str, current_user: User = Depends(get_current_user)):
    empresa = await _empresa_do_usuario(current_user)
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    if not empresa or empresa["company_id"] != submissao["company_id"]:
        raise HTTPException(status_code=403, detail="Sem acesso a esta submissão")
    if submissao["status"] != "rascunho":
        raise HTTPException(status_code=400, detail="Só é possível submeter uma submissão em rascunho")
    pendentes = [i["nome"] for i in submissao["itens"] if i["status"] != "enviado"]
    if pendentes:
        raise HTTPException(status_code=400, detail=f"Itens pendentes de envio: {', '.join(pendentes)}")

    agora = datetime.now(timezone.utc).isoformat()
    await db.submissoes.update_one({"submissao_id": submissao_id}, {"$set": {"status": "submetido", "submetido_em": agora}})
    await registrar_auditoria(current_user, "submeter_submissao", "submissao", submissao_id, {"estado_sigla": submissao["estado_sigla"]})
    await _notificar_detran_uf(
        submissao["estado_sigla"], "submissao_recebida", "Nova submissão de credenciamento",
        f"Uma empresa enviou uma submissão para análise (portaria {submissao['portaria_id']}).",
        {"submissao_id": submissao_id}
    )
    return await db.submissoes.find_one({"submissao_id": submissao_id}, {"_id": 0})


@api_router.patch("/submissoes/{submissao_id}/itens/{item_id}")
async def analisar_item_submissao(
    submissao_id: str, item_id: str, analise: SubmissaoItemAnalise,
    current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin")),
):
    """Passo C: DETRAN marca um item CONFORME ou INCONFORME. INCONFORME exige
    justificativa (obrigatória — Passo C do briefing) e move a submissão pra
    em_diligencia, notificando a empresa."""
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    await _checar_permissao_escrita_estado(current_user, submissao["estado_sigla"])
    if submissao["status"] not in ("submetido", "em_analise"):
        raise HTTPException(status_code=400, detail="Submissão não está em análise")
    if analise.status == "inconforme" and not (analise.justificativa and analise.justificativa.strip()):
        raise HTTPException(status_code=400, detail="Justificativa é obrigatória para marcar um item como inconforme")

    itens = submissao["itens"]
    item = next((i for i in itens if i["item_id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    if item["status"] != "enviado":
        raise HTTPException(status_code=400, detail="Só é possível analisar itens com status 'enviado'")

    agora = datetime.now(timezone.utc).isoformat()
    for i in itens:
        if i["item_id"] == item_id:
            i["status"] = analise.status
            i["justificativa"] = analise.justificativa if analise.status == "inconforme" else None
            i["analisado_por"] = current_user.user_id
            i["analisado_em"] = agora

    update_fields = {"itens": itens}
    if submissao["status"] == "submetido":
        update_fields["analisado_em"] = agora
    update_fields["status"] = "em_diligencia" if analise.status == "inconforme" else "em_analise"

    await db.submissoes.update_one({"submissao_id": submissao_id}, {"$set": update_fields})
    await registrar_auditoria(current_user, "analisar_item_submissao", "submissao", submissao_id, {
        "item_id": item_id, "status": analise.status, "justificativa": analise.justificativa
    })
    if analise.status == "inconforme":
        empresa_doc = await db.companies.find_one({"company_id": submissao["company_id"]}, {"_id": 0, "user_id": 1})
        if empresa_doc:
            await criar_notificacao(
                empresa_doc["user_id"], "checklist_inconforme", "Pendência no credenciamento",
                f"O item \"{item['nome']}\" foi marcado como inconforme: {analise.justificativa}",
                {"submissao_id": submissao_id, "item_id": item_id}
            )
    return await db.submissoes.find_one({"submissao_id": submissao_id}, {"_id": 0})


@api_router.post("/submissoes/{submissao_id}/homologar")
async def homologar_submissao(
    submissao_id: str, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))
):
    """Passo D: exige todos os itens conformes. Cria/atualiza o
    CredenciamentoDetalhes da empresa nesta UF pra status=ativo — liga o
    resultado do processo ao módulo Estado/UF já existente."""
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    await _checar_permissao_escrita_estado(current_user, submissao["estado_sigla"])
    if submissao["status"] == "homologado":
        raise HTTPException(status_code=400, detail="Submissão já homologada")
    if not submissao["itens"] or any(i["status"] != "conforme" for i in submissao["itens"]):
        raise HTTPException(status_code=400, detail="Todos os itens precisam estar conformes para homologar")

    agora = datetime.now(timezone.utc).isoformat()
    await db.submissoes.update_one({"submissao_id": submissao_id}, {"$set": {
        "status": "homologado", "homologado_em": agora, "homologado_por": current_user.user_id
    }})
    await registrar_auditoria(current_user, "homologar_submissao", "submissao", submissao_id, {"estado_sigla": submissao["estado_sigla"]})

    credenciamento_existente = await db.credenciamentos.find_one(
        {"company_id": submissao["company_id"], "estado_sigla": submissao["estado_sigla"], "deleted_at": None}, {"_id": 0}
    )
    if credenciamento_existente:
        await db.credenciamentos.update_one(
            {"credenciamento_id": credenciamento_existente["credenciamento_id"]},
            {"$set": {"status": "ativo", "updated_at": agora}}
        )
    else:
        portaria = await db.portarias.find_one({"portaria_id": submissao["portaria_id"]}, {"_id": 0})
        extrato = f"Credenciamento homologado via portaria {submissao['portaria_id']}"
        if portaria and portaria.get("numero"):
            extrato += f" (nº {portaria['numero']})"
        credenciamento = CredenciamentoDetalhes(
            company_id=submissao["company_id"], estado_sigla=submissao["estado_sigla"],
            extrato_contrato=extrato, status="ativo", created_by=current_user.user_id,
        )
        cred_doc = credenciamento.model_dump()
        cred_doc["created_at"] = cred_doc["created_at"].isoformat()
        await db.credenciamentos.insert_one(cred_doc)

    empresa_doc = await db.companies.find_one({"company_id": submissao["company_id"]}, {"_id": 0, "user_id": 1})
    if empresa_doc:
        await criar_notificacao(
            empresa_doc["user_id"], "submissao_homologada", "Credenciamento homologado",
            "Sua submissão foi homologada. O comprovante já está disponível para download.",
            {"submissao_id": submissao_id}
        )
    return await db.submissoes.find_one({"submissao_id": submissao_id}, {"_id": 0})


def _gerar_comprovante_pdf(submissao: dict, company: dict, portaria: dict) -> bytes:
    """Gera o comprovante de conformidade sob demanda (não persiste em disco —
    conteúdo é 100% determinístico a partir de Submissao+Company+Portaria, e
    assim não depende do bind mount de uploads, ver incidente 2026-08-02)."""
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    largura, altura = A4
    y = altura - 3 * cm

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(largura / 2, y, "Comprovante de Conformidade")
    y -= 1 * cm
    c.setFont("Helvetica", 10)
    c.drawCentredString(largura / 2, y, "SIGCR — Sistema de Gestão de Credenciamento")
    y -= 1.5 * cm

    linhas = [
        f"Empresa: {company.get('name', '—')} ({company.get('nome_fantasia', '—')})",
        f"CNPJ: {company.get('cnpj', '—')}",
        f"UF: {submissao.get('estado_sigla', '—')}",
        f"Portaria: {portaria.get('numero') or portaria.get('title', '—')}",
        f"Processo (submissão): {submissao.get('submissao_id', '—')}",
        f"Data de homologação: {submissao.get('homologado_em', '—')}",
        f"Total de itens conformes: {len(submissao.get('itens', []))}",
    ]
    c.setFont("Helvetica", 11)
    for linha in linhas:
        c.drawString(2.5 * cm, y, linha)
        y -= 0.8 * cm

    y -= 0.5 * cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(2.5 * cm, y, "Itens do checklist analisados:")
    y -= 0.8 * cm
    c.setFont("Helvetica", 9)
    for item in submissao.get("itens", []):
        if y < 3 * cm:
            c.showPage()
            y = altura - 3 * cm
            c.setFont("Helvetica", 9)
        c.drawString(2.8 * cm, y, f"- {item.get('nome', '—')}: {item.get('status', '—').upper()}")
        y -= 0.6 * cm

    c.showPage()
    c.save()
    return buffer.getvalue()


@api_router.get("/submissoes/{submissao_id}/comprovante")
async def baixar_comprovante(submissao_id: str, current_user: User = Depends(get_current_user)):
    submissao = await db.submissoes.find_one({"submissao_id": submissao_id, "deleted_at": None}, {"_id": 0})
    if not submissao:
        raise HTTPException(status_code=404, detail="Submissão não encontrada")
    await _autorizar_acesso_submissao(submissao, current_user)
    if submissao["status"] != "homologado":
        raise HTTPException(status_code=400, detail="Comprovante disponível apenas após homologação")

    company = await db.companies.find_one({"company_id": submissao["company_id"]}, {"_id": 0})
    portaria = await db.portarias.find_one({"portaria_id": submissao["portaria_id"]}, {"_id": 0})
    pdf_bytes = _gerar_comprovante_pdf(submissao, company or {}, portaria or {})
    await registrar_auditoria(current_user, "download_comprovante", "submissao", submissao_id, {})
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="comprovante_{submissao_id}.pdf"'}
    )


# ============ Modo "ver como" — opções pro seletor (sigcr_admin) ============

@api_router.get("/admin/view-as-options")
async def listar_opcoes_ver_como(current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Lista as opções disponíveis pro seletor 'ver como' do sigcr_admin:
    hoje, só empresas ativas (não deletadas). GET /companies já retorna todas
    as empresas pra sigcr_admin sem 'ver como' ativo (mesmo dado) — esta rota
    existe separada porque devolve no formato que o seletor consome direto.

    O eixo DETRAN (view_as_detran_uf) foi tirado daqui de propósito — as
    telas do lado DETRAN ainda são mock, então oferecer "ver como DETRAN-UF"
    no seletor não levava a nada útil, só confundia. O mecanismo em si
    continua implementado (get_effective_scope aceita view_as_detran_uf
    normalmente, GET /documentos e /documentos/vencimento-resumo já
    respeitam) — só não é oferecido aqui. Reativar quando as telas reais do
    DETRAN existirem: basta devolver a chave "detrans" de novo (ver histórico
    do git pra recuperar a linha exata)."""
    companies = await db.companies.find(
        {"deleted_at": None}, {"_id": 0, "company_id": 1, "name": 1, "nome_fantasia": 1}
    ).sort("nome_fantasia", 1).to_list(1000)
    empresas = [
        {"id": c["company_id"], "nome": c.get("nome_fantasia") or c.get("name")}
        for c in companies
    ]
    return {"empresas": empresas, "detrans": []}


# ============ System Users Routes ============

@api_router.get("/system-users")
async def get_system_users(current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Get all system users"""
    users = await db.system_users.find({}, {"_id": 0}).to_list(100)
    return users


@api_router.post("/system-users")
async def create_system_user(user_data: SystemUserCreate, current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Create new system user"""
    system_user = SystemUser(**user_data.model_dump())

    doc = system_user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()

    await db.system_users.insert_one(doc)
    return system_user


@api_router.delete("/system-users/{system_user_id}")
async def delete_system_user(system_user_id: str, current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Delete system user"""
    result = await db.system_users.delete_one({"system_user_id": system_user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


@api_router.patch("/system-users/{system_user_id}")
async def update_system_user(system_user_id: str, updates: dict, current_user: User = Depends(require_perfil("sigcr_admin"))):
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
async def get_stats(scope: EffectiveScope = Depends(get_effective_scope)):
    """Get dashboard statistics. sigcr_admin sem 'ver como' ativo vê
    estatísticas agregadas de toda a plataforma; com view_as_company_id, vê
    exatamente o que o dono daquela empresa veria.

    detran/detran_admin (real ou via view_as_detran_uf) nunca são donos de
    uma Company — o filtro por user_id sempre dava zero pra esse perfil,
    bug real e pré-existente (não introduzido aqui). Escopa pela mesma
    lógica já usada em GET /detran/registradoras: registradoras que atuam
    na UF do DETRAN (scope.effective_detran_uf), não por ownership."""
    if scope.current_user.perfil == "sigcr_admin" and not scope.is_viewing_as:
        filtro_empresa = {}
    elif scope.effective_detran_uf:
        filtro_empresa = {"tipo_empresa": "registradora", "detrans_atuacao": scope.effective_detran_uf}
    else:
        filtro_empresa = {"user_id": scope.effective_user_id}

    total_companies = await db.companies.count_documents({**filtro_empresa, "deleted_at": None})
    # Split por tipo (Item 1 do Dashboard, 2026-08-27): o card único "Empresas"
    # virou 2 cards (Registradoras/Financeiras) pro sigcr_admin/DETRAN — a
    # sobrescrita de tipo_empresa no spread abaixo funciona certo nos 3 branches
    # de filtro_empresa acima (agregado, por-UF-do-DETRAN e por-ownership),
    # porque dict unpacking deixa a chave literal depois do spread vencer.
    total_registradoras = await db.companies.count_documents(
        {**filtro_empresa, "tipo_empresa": "registradora", "deleted_at": None}
    )
    total_financeiras = await db.companies.count_documents(
        {**filtro_empresa, "tipo_empresa": "financeira", "deleted_at": None}
    )
    # Aceita vocabulário antigo e o novo (pós-migração Fase 0) durante a transição —
    # ver nota no default de Company.status.
    pending_companies = await db.companies.count_documents(
        {**filtro_empresa, "status": {"$in": ["pending", "pendente_aprovacao"]}, "deleted_at": None}
    )
    approved_companies = await db.companies.count_documents(
        {**filtro_empresa, "status": {"$in": ["approved", "ativo_contrato_assinado"]}, "deleted_at": None}
    )
    total_portarias = await db.portarias.count_documents({"deleted_at": None})
    active_portarias = await db.portarias.count_documents({"status": "vigente", "deleted_at": None})

    companies = await db.companies.find(
        {**filtro_empresa, "deleted_at": None}, {"_id": 0, "company_id": 1}
    ).to_list(1000)

    total_documents = 0
    pending_validations = 0
    compliance_verde = compliance_amarelo = compliance_vermelho = 0
    for company in companies:
        docs = await db.documents.find({"company_id": company["company_id"]}, {"_id": 0}).to_list(100)
        total_documents += len(docs)
        pending_validations += len([d for d in docs if d.get("status") == "pending"])
        vencidos = vencendo = 0
        for doc in docs:
            status = calcular_status_documento(doc)
            if status == "vencido":
                vencidos += 1
            elif status == "vencendo":
                vencendo += 1
        if vencidos > 0:
            compliance_vermelho += 1
        elif vencendo > 0:
            compliance_amarelo += 1
        else:
            compliance_verde += 1

    return {
        "total_companies": total_companies,
        "total_registradoras": total_registradoras,
        "total_financeiras": total_financeiras,
        "pending_companies": pending_companies,
        "approved_companies": approved_companies,
        "total_portarias": total_portarias,
        "total_documents": total_documents,
        "pending_validations": pending_validations,
        "active_portarias": active_portarias,
        "compliance_verde": compliance_verde,
        "compliance_amarelo": compliance_amarelo,
        "compliance_vermelho": compliance_vermelho,
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
async def listar_usuarios(current_user: User = Depends(require_perfil("sigcr_admin"))):
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
async def criar_usuario(payload: NovoUsuarioPayload, current_user: User = Depends(require_perfil("sigcr_admin"))):
    # Hierarquia LGPD — cada perfil só pode criar abaixo do seu nível
    # "registradora" não aparece como criador de ninguém aqui — chegou a
    # modelar "financeira" como sub-conta criada por registradora, mas esse
    # endpoint sempre foi sigcr_admin-only (ver o Depends abaixo), então essa
    # entrada nunca foi alcançável. Decisão da Fase A (2026-08-02): Financeira
    # nasce só por autocadastro público (POST /public/cadastro), não por
    # convite de registradora — removida daqui em vez de deixar código morto
    # sugerindo um caminho que não existe.
    CRIACAO_PERMITIDA = {
        "sigcr_admin":   ["registradora", "detran", "detran_admin", "financeira", "sigcr_admin"],
        "detran_admin":  ["registradora", "detran"],
        "detran":        ["registradora"],
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
async def deletar_usuario(user_id: str, current_user: User = Depends(require_perfil("sigcr_admin"))):
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


# ============ FASE 2: APROVAÇÃO DE CADASTROS PENDENTES ============

TIPO_EMPRESA_LABELS = {"registradora": "Registradora", "financeira": "Financeira", "detran": "DETRAN"}


class RejeitarCadastroPayload(BaseModel):
    motivo: Optional[str] = None


@api_router.get("/admin/cadastros-pendentes")
async def listar_cadastros_pendentes(current_user: User = Depends(require_perfil("sigcr_admin"))):
    """Lista companies aguardando aprovação, com dados da empresa + responsável PF vinculado."""
    companies = await db.companies.find(
        {"status": "pendente_aprovacao", "deleted_at": None}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)

    user_ids = list({c["user_id"] for c in companies})
    usuarios = await db.users.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "email": 1, "name": 1}
    ).to_list(1000) if user_ids else []
    usuarios_por_id = {u["user_id"]: u for u in usuarios}

    resultado = []
    for c in companies:
        conta = usuarios_por_id.get(c["user_id"], {})
        resultado.append({
            "company_id": c["company_id"],
            "name": c["name"],
            "nome_fantasia": c["nome_fantasia"],
            "cnpj": c["cnpj"],
            "tipo_empresa": c.get("tipo_empresa", "registradora"),
            "tipo_empresa_label": TIPO_EMPRESA_LABELS.get(c.get("tipo_empresa"), c.get("tipo_empresa")),
            "email_comercial": c.get("email_comercial"),
            "whatsapp": c.get("whatsapp"),
            "responsavel": c.get("responsavel"),
            "responsavel_email_conta": conta.get("email"),
            "historico_rejeicoes": c.get("historico_rejeicoes", []),
            "created_at": c["created_at"],
        })
    return resultado


@api_router.post("/admin/cadastros/{company_id}/aprovar")
async def aprovar_cadastro(company_id: str, current_user: User = Depends(require_perfil("sigcr_admin"))):
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Cadastro não encontrado")
    if company.get("status") != "pendente_aprovacao":
        raise HTTPException(status_code=409, detail="Cadastro não está pendente de aprovação")

    agora = datetime.now(timezone.utc).isoformat()
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {
            "status": "aprovado_acesso_limitado",
            "aprovado_por": current_user.user_id,
            "aprovado_em": agora,
            "updated_at": agora,
        }}
    )
    await criar_notificacao(
        company["user_id"], "cadastro_aprovado",
        "Cadastro aprovado",
        f"O cadastro de {company['nome_fantasia']} foi aprovado. Acesso liberado ao sistema.",
        {"company_id": company_id}
    )
    await registrar_auditoria(current_user, "aprovar_cadastro", "company", company_id, {
        "status_anterior": company.get("status"), "status_novo": "aprovado_acesso_limitado"
    })
    return {"message": "Cadastro aprovado com sucesso"}


@api_router.post("/admin/cadastros/{company_id}/rejeitar")
async def rejeitar_cadastro(
    company_id: str,
    payload: RejeitarCadastroPayload,
    current_user: User = Depends(require_perfil("sigcr_admin"))
):
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Cadastro não encontrado")
    if company.get("status") != "pendente_aprovacao":
        raise HTTPException(status_code=409, detail="Cadastro não está pendente de aprovação")

    agora = datetime.now(timezone.utc).isoformat()
    entrada_historico = {
        "motivo": payload.motivo,
        "rejeitado_por": current_user.user_id,
        "rejeitado_em": agora,
    }
    await db.companies.update_one(
        {"company_id": company_id},
        {
            "$set": {"status": "rejeitado", "updated_at": agora},
            "$push": {"historico_rejeicoes": entrada_historico},
        }
    )
    await criar_notificacao(
        company["user_id"], "cadastro_rejeitado",
        "Cadastro rejeitado",
        f"O cadastro de {company['nome_fantasia']} foi rejeitado."
        + (f" Motivo: {payload.motivo}" if payload.motivo else " Corrija os dados e reenvie."),
        {"company_id": company_id, "motivo": payload.motivo}
    )
    await registrar_auditoria(current_user, "rejeitar_cadastro", "company", company_id, {
        "status_anterior": company.get("status"), "motivo": payload.motivo
    })
    return {"message": "Cadastro rejeitado"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    # Fatia B: deny-all por padrão — sem CORS_ORIGINS na env, nenhuma origem
    # cross-site é aceita. Produção já seta CORS_ORIGINS explicitamente, então
    # isto é no-op hoje (ver PENDING_ACTIONS.md item 25).
    allow_origins=[o for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store_api_responses(request: Request, call_next):
    """API não deve ser cacheada pelo navegador — evita respostas antigas/parciais
    grudarem no cliente entre deploys, já que nenhuma rota aqui é destinada a cache."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response

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
    """Retorna status de compliance da empresa com semáforo (dono ou
    sigcr_admin em modo 'ver como'). Achado incidental durante o trabalho do
    seletor 'ver como': esta rota não tinha NENHUMA checagem de ownership —
    qualquer usuário autenticado podia consultar compliance de qualquer
    empresa trocando o company_id na URL. Corrigido aqui de graça."""
    await _autorizar_acesso_empresa(company_id, current_user, exigir_nao_deletada=False)
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
async def get_compliance_geral(scope: EffectiveScope = Depends(get_effective_scope)):
    """Visão geral de compliance de todas as empresas do usuário. sigcr_admin
    sem 'ver como' ativo vê todas as empresas da plataforma; com
    view_as_company_id, vê só as do dono daquela empresa."""
    if scope.current_user.perfil == "sigcr_admin" and not scope.is_viewing_as:
        query = {}
    else:
        query = {"user_id": scope.effective_user_id}
    companies = await db.companies.find(query, {"_id": 0}).to_list(100)
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
    """Define data de vencimento de um documento manualmente — marca
    vencimento_fonte="manual" mesmo se uma sugestão de OCR já existia,
    porque a edição do usuário sempre prevalece. Autorização: dono da
    empresa do documento ou sigcr_admin (mesma regra dos demais endpoints
    de documento — corrige IDOR: qualquer usuário autenticado conseguia
    alterar vencimento de documento de empresa alheia. Ver PENDING_ACTIONS.md
    item 25)."""
    doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    await _autorizar_acesso_empresa(doc["company_id"], current_user, exigir_nao_deletada=False)

    body = await request.json()
    vencimento = body.get("vencimento")
    if vencimento:
        try:
            datetime.fromisoformat(str(vencimento))
        except ValueError:
            raise HTTPException(status_code=400, detail="Data de vencimento inválida (use YYYY-MM-DD)")
    await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {"vencimento": vencimento, "vencimento_fonte": "manual" if vencimento else None}}
    )
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
    ip: str = None,
    atuando_como_empresa: Optional[str] = None,
    atuando_como_detran: Optional[str] = None,
):
    """Registra ação no log de auditoria imutável. `user` é sempre a
    identidade REAL de quem fez a ação (nunca a empresa/DETRAN impersonado) —
    atuando_como_empresa/atuando_como_detran deixam explícito, quando um
    sigcr_admin agiu em modo "ver como", em nome de quem a ação foi feita.
    Sem isso, uma ação de escrita feita em modo "ver como" ficaria
    indistinguível de uma ação normal do admin na própria conta."""
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
        "atuando_como_empresa": atuando_como_empresa,
        "atuando_como_detran": atuando_como_detran,
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
    """Retorna log de auditoria — sigcr_admin vê tudo; detran_admin vê só o próprio estado
    (via detalhes.estado_sigla); demais perfis veem só as próprias ações."""
    query = {}
    if current_user.perfil == "detran_admin":
        if not current_user.detran_uf:
            raise HTTPException(status_code=403, detail="Usuário detran_admin sem UF configurada")
        query["detalhes.estado_sigla"] = current_user.detran_uf
    elif current_user.perfil != "sigcr_admin":
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
    if _ve_editais_completo(current_user):
        return editais
    # Fase 1: empresa sem contrato assinado, ou PF avulsa (mesmo com assinatura
    # ativa — ela nunca vê completo, ver _ve_editais_completo), vê só um resumo:
    # sem descrição completa nem documentos exigidos, e sem poder chamar
    # POST /solicitacoes (bloqueado à parte, em require_acesso_total).
    return [
        {
            "edital_id": e.get("edital_id"),
            "titulo": e.get("titulo"),
            "uf": e.get("uf"),
            "status": e.get("status"),
            "data_encerramento": e.get("data_encerramento"),
            "preview": True,
        }
        for e in editais
    ]

@api_router.post("/editais")
async def create_edital(request: Request, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    body = await request.json()
    edital = {
        "edital_id": f"edital_{uuid.uuid4().hex[:12]}",
        "titulo": body.get("titulo"),
        "descricao": body.get("descricao"),
        "uf": body.get("uf"),
        "status": "aberto",
        "data_encerramento": body.get("data_encerramento"),
        "documentos_obrigatorios": body.get("documentos_obrigatorios", []),
        # Área de Transparência: anexos e termo de adesão pra exibição pública.
        # path vem de POST /editais/upload (upload real, direto da tela de
        # criação/edição do edital).
        "anexos": body.get("anexos", []),  # [{"nome": str, "path": str}]
        "termo_adesao_path": body.get("termo_adesao_path"),
        "criado_por": current_user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.editais.insert_one(edital)
    edital.pop("_id", None)  # insert_one adiciona _id (ObjectId) de volta no dict por efeito colateral
    await registrar_auditoria(current_user, "criar_edital", "edital", edital["edital_id"], {"titulo": edital["titulo"]})
    return edital


class EditalUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    uf: Optional[str] = None
    status: Optional[str] = None
    data_encerramento: Optional[str] = None
    documentos_obrigatorios: Optional[List[str]] = None
    anexos: Optional[List[dict]] = None
    termo_adesao_path: Optional[str] = None


@api_router.patch("/editais/{edital_id}")
async def atualizar_edital(edital_id: str, updates: EditalUpdate, current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))):
    edital = await db.editais.find_one({"edital_id": edital_id}, {"_id": 0})
    if not edital:
        raise HTTPException(status_code=404, detail="Edital não encontrado")

    campos = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not campos:
        return edital
    campos["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.editais.update_one({"edital_id": edital_id}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_edital", "edital", edital_id, {
        "campos": list(campos.keys())
    })
    return await db.editais.find_one({"edital_id": edital_id}, {"_id": 0})


@api_router.post("/editais/upload")
async def upload_arquivo_edital(
    file: UploadFile = File(...),
    current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin")),
):
    """Upload de um anexo ou do termo de adesão pra um edital — desacoplado
    de criar/atualizar o edital em si: a tela de edição faz upload de cada
    arquivo primeiro (recebe path+nome de volta) e só depois inclui essas
    referências no POST/PATCH /editais. Substitui o workaround manual de
    reaproveitar /portarias/upload só pra conseguir um path em UPLOAD_DIR."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")

    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(conteudo) > MAX_PORTARIA_PDF_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite de 20MB")

    editais_dir = UPLOAD_DIR / "editais"
    editais_dir.mkdir(exist_ok=True)
    file_path = editais_dir / f"{uuid.uuid4().hex}.pdf"
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(conteudo)

    await registrar_auditoria(current_user, "upload_arquivo_edital", "edital", None, {
        "nome_original": file.filename
    })
    return {"nome": file.filename or "documento.pdf", "path": str(file_path)}


# ============ ÁREA PÚBLICA DE TRANSPARÊNCIA (sem autenticação) ============
# Expõe só o edital vigente por UF + anexos/termo de adesão para download.
# Nunca deve retornar dados de companies/solicitações/usuários — só o que já é
# público por natureza (o próprio edital, publicado pelo DETRAN).

def _resolver_path_seguro(path_str: str) -> Optional[Path]:
    """Garante que um path armazenado em anexos/termo_adesao_path resolve pra
    dentro de UPLOAD_DIR antes de servir via FileResponse — evita que um valor
    malicioso gravado em `anexos`/`termo_adesao_path` (ex: '../../etc/passwd')
    vaze arquivos arbitrários do servidor pela rota pública."""
    try:
        resolved = Path(path_str).resolve()
        upload_dir_resolved = UPLOAD_DIR.resolve()
        if upload_dir_resolved not in resolved.parents and resolved != upload_dir_resolved:
            return None
        if not resolved.exists() or not resolved.is_file():
            return None
        return resolved
    except Exception:
        return None


@api_router.get("/public/editais/{uf}")
async def get_editais_publicos_por_uf(uf: str):
    """Edital(is) vigente(s) de um estado — rota pública, sem autenticação.
    Retorna só os campos abaixo, explicitamente: nada de criado_por (user_id
    interno), company_id, solicitacao_id ou qualquer outro dado de empresas/
    solicitações passa perto desta rota."""
    uf = uf.upper()
    if uf not in UF_VALIDAS:
        raise HTTPException(status_code=400, detail="UF inválida")

    editais = await db.editais.find(
        {"uf": uf, "status": "aberto"}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    resultado = []
    for e in editais:
        anexos_publicos = [
            {"nome": a.get("nome", "Anexo"), "download_url": f"/api/public/editais/{e['edital_id']}/anexos/{i}"}
            for i, a in enumerate(e.get("anexos", []))
            if _resolver_path_seguro(a.get("path", "")) is not None
        ]
        resultado.append({
            "edital_id": e["edital_id"],
            "titulo": e.get("titulo"),
            "descricao": e.get("descricao"),
            "uf": e.get("uf"),
            "status": e.get("status"),
            "data_encerramento": e.get("data_encerramento"),
            "documentos_obrigatorios": e.get("documentos_obrigatorios", []),
            "anexos": anexos_publicos,
            "termo_adesao_download_url": (
                f"/api/public/editais/{e['edital_id']}/termo-adesao"
                if _resolver_path_seguro(e.get("termo_adesao_path") or "") is not None else None
            ),
        })
    return {"uf": uf, "uf_nome": UF_NOMES.get(uf, uf), "editais": resultado}


@api_router.get("/public/editais/{edital_id}/anexos/{indice}")
async def download_anexo_publico(edital_id: str, indice: int):
    edital = await db.editais.find_one({"edital_id": edital_id}, {"_id": 0})
    if not edital or edital.get("status") != "aberto":
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    anexos = edital.get("anexos", [])
    if indice < 0 or indice >= len(anexos):
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    caminho = _resolver_path_seguro(anexos[indice].get("path", ""))
    if not caminho:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    return FileResponse(caminho, filename=anexos[indice].get("nome", f"anexo_{indice}"))


@api_router.get("/public/editais/{edital_id}/termo-adesao")
async def download_termo_adesao_publico(edital_id: str):
    edital = await db.editais.find_one({"edital_id": edital_id}, {"_id": 0})
    if not edital or edital.get("status") != "aberto":
        raise HTTPException(status_code=404, detail="Termo de adesão não encontrado")
    caminho = _resolver_path_seguro(edital.get("termo_adesao_path") or "")
    if not caminho:
        raise HTTPException(status_code=404, detail="Termo de adesão não encontrado")
    return FileResponse(caminho, filename=f"termo_adesao_{edital_id}.pdf")


# ============ SOLICITAÇÕES ============

@api_router.get("/solicitacoes")
async def get_solicitacoes(scope: EffectiveScope = Depends(get_effective_scope)):
    """EffectiveScope pra que "ver como" (sigcr_admin simulando registradora/
    financeira) restrinja à empresa simulada, em vez de sempre cair no ramo
    sigcr_admin (visão irrestrita) mesmo com a simulação ativa."""
    current_user = scope.as_user()
    if current_user.perfil in ["detran", "detran_admin", "sigcr_admin"]:
        query = {}
    else:
        query = {"user_id": current_user.user_id}
    solicitacoes = await db.solicitacoes.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return solicitacoes

@api_router.post("/solicitacoes")
async def create_solicitacao(request: Request, current_user: User = Depends(require_acesso_total)):
    body = await request.json()
    company_id = body.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id é obrigatório")
    await _autorizar_acesso_empresa(company_id, current_user)
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
    sol.pop("_id", None)  # insert_one adiciona _id (ObjectId) de volta no dict por efeito colateral
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


# ============ SOLICITAÇÕES DE REGISTRO DE CONTRATO (Fase B do HUB) ============
# Fila exclusiva Financeira -> Registradora vinculada (Company.registradora_id),
# pro registro de contrato de financiamento com alienação/reserva de domínio
# junto ao DETRAN. Dados do contrato seguem o Art. 3º da Resolução CONTRAN
# 320/2009. Sem Pydantic model dedicado — mesmo padrão de db.solicitacoes
# (sol dict simples), única coleção nova desta fase é db.solicitacoes_registro.
#
# Status pendente -> concluido/rejeitado, decididos pela registradora vinculada
# (PATCH .../concluir exige comprovante do DETRAN; PATCH .../rejeitar segue o
# mesmo padrão de historico_rejeicoes do cadastro de empresas). "em_processamento"
# está no vocabulário de status pro caso a registradora precise sinalizar que já
# está tratando a solicitação, mas nenhuma rota o define hoje — não foi pedido
# um endpoint de transição pra esse estado; fica como valor válido, não como
# um degrau obrigatório do fluxo.

class RejeitarSolicitacaoRegistroPayload(BaseModel):
    motivo: Optional[str] = None


def _solicitacao_registro_dir() -> Path:
    d = UPLOAD_DIR / "solicitacoes_registro"
    d.mkdir(exist_ok=True)
    return d


async def _salvar_pdf_solicitacao_registro(file: UploadFile, campo: str) -> str:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail=f"Apenas arquivos PDF são aceitos para {campo}")
    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(conteudo) > MAX_PORTARIA_PDF_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite de 20MB")
    file_path = _solicitacao_registro_dir() / f"{uuid.uuid4().hex}.pdf"
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(conteudo)
    return str(file_path)


async def _autorizar_registradora_da_solicitacao_registro(sol: dict, current_user: User) -> None:
    """Confere que current_user é dono de UMA das (possivelmente várias)
    companies tipo_empresa=registradora cujo company_id é o registradora_id
    gravado na solicitação. sigcr_admin sempre passa."""
    if current_user.perfil == "sigcr_admin":
        return
    minha = await db.companies.find_one({
        "company_id": sol["registradora_id"], "user_id": current_user.user_id,
        "tipo_empresa": "registradora", "deleted_at": None,
    })
    if not minha:
        raise HTTPException(status_code=403, detail="Esta solicitação não pertence à sua registradora")


@api_router.post("/solicitacoes-registro")
async def criar_solicitacao_registro(
    company_id: str = Form(...),
    credor_nome: str = Form(...),
    credor_documento: str = Form(...),
    credor_endereco: str = Form(...),
    credor_telefone: str = Form(...),
    devedor_nome: str = Form(...),
    devedor_documento: str = Form(...),
    devedor_endereco: str = Form(...),
    devedor_telefone: str = Form(...),
    valor_total_divida: float = Form(...),
    local_pagamento: str = Form(...),
    data_pagamento: str = Form(...),
    taxa_juros: str = Form(...),
    veiculo_placa: str = Form(...),
    veiculo_chassi: str = Form(...),
    veiculo_marca_modelo: str = Form(...),
    veiculo_ano: str = Form(...),
    contrato: UploadFile = File(...),
    current_user: User = Depends(require_perfil("financeira")),
):
    """Financeira abre uma solicitação de registro de contrato junto à
    registradora à qual está vinculada (Company.registradora_id, hoje sempre
    a HD). company_id precisa ser uma financeira do próprio usuário."""
    company = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if company.get("tipo_empresa") != "financeira":
        raise HTTPException(status_code=400, detail="company_id deve ser de uma empresa do tipo financeira")
    if current_user.perfil != "sigcr_admin" and company["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Esta empresa não pertence ao usuário atual")
    registradora_id = company.get("registradora_id")
    if not registradora_id:
        raise HTTPException(status_code=400, detail="Financeira sem registradora vinculada — não é possível solicitar registro")

    try:
        data_pagamento_parsed = datetime.fromisoformat(data_pagamento)
    except ValueError:
        raise HTTPException(status_code=400, detail="data_pagamento inválida (use ISO 8601)")

    contrato_pdf_path = await _salvar_pdf_solicitacao_registro(contrato, "o contrato")

    agora = datetime.now(timezone.utc).isoformat()
    sol = {
        "solicitacao_registro_id": f"solreg_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "registradora_id": registradora_id,
        "user_id": current_user.user_id,
        "credor_nome": credor_nome, "credor_documento": credor_documento,
        "credor_endereco": credor_endereco, "credor_telefone": credor_telefone,
        "devedor_nome": devedor_nome, "devedor_documento": devedor_documento,
        "devedor_endereco": devedor_endereco, "devedor_telefone": devedor_telefone,
        "valor_total_divida": valor_total_divida,
        "local_pagamento": local_pagamento,
        "data_pagamento": data_pagamento_parsed.isoformat(),
        "taxa_juros": taxa_juros,
        "veiculo_placa": veiculo_placa, "veiculo_chassi": veiculo_chassi,
        "veiculo_marca_modelo": veiculo_marca_modelo, "veiculo_ano": veiculo_ano,
        "contrato_pdf_path": contrato_pdf_path,
        "status": "pendente",
        "comprovante_pdf_path": None,
        "numero_registro_detran": None,
        "concluido_por": None,
        "concluido_em": None,
        "historico_rejeicoes": [],
        "created_at": agora,
        "updated_at": agora,
    }
    await db.solicitacoes_registro.insert_one(sol)
    sol.pop("_id", None)  # insert_one adiciona _id (ObjectId) de volta no dict por efeito colateral

    registradora = await db.companies.find_one({"company_id": registradora_id}, {"_id": 0})
    if registradora:
        await criar_notificacao(
            registradora["user_id"], "solicitacao_registro_nova",
            "Nova solicitação de registro de contrato",
            f"{company.get('nome_fantasia') or company.get('name')} enviou uma nova solicitação de registro de contrato.",
            {"solicitacao_registro_id": sol["solicitacao_registro_id"]}
        )
    await registrar_auditoria(current_user, "criar_solicitacao_registro", "solicitacao_registro", sol["solicitacao_registro_id"], {
        "company_id": company_id, "registradora_id": registradora_id
    })
    return sol


@api_router.get("/solicitacoes-registro")
async def listar_solicitacoes_registro(
    _gate: User = Depends(require_perfil("financeira", "registradora")),
    scope: EffectiveScope = Depends(get_effective_scope),
):
    """Financeira vê as próprias (todas as financeiras que possui); registradora
    vê as recebidas das financeiras vinculadas a ela (todas as registradoras que
    possui); sigcr_admin sem "ver como" ativo vê tudo. O gate de entrada
    (_gate, quem pode chamar a rota) continua na identidade real — sigcr_admin
    sempre passa, como sempre passou; só o ESCOPO dos dados retornados abaixo
    passa a respeitar a simulação, via EffectiveScope."""
    current_user = scope.as_user()
    if current_user.perfil == "sigcr_admin":
        query = {}
    elif current_user.perfil == "financeira":
        minhas = await db.companies.find(
            {"user_id": current_user.user_id, "tipo_empresa": "financeira", "deleted_at": None},
            {"_id": 0, "company_id": 1}
        ).to_list(100)
        query = {"company_id": {"$in": [c["company_id"] for c in minhas]}}
    else:  # registradora
        minhas = await db.companies.find(
            {"user_id": current_user.user_id, "tipo_empresa": "registradora", "deleted_at": None},
            {"_id": 0, "company_id": 1}
        ).to_list(100)
        query = {"registradora_id": {"$in": [c["company_id"] for c in minhas]}}
    return await db.solicitacoes_registro.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.get("/solicitacoes-registro/{solicitacao_registro_id}/contrato")
async def baixar_contrato_solicitacao_registro(solicitacao_registro_id: str, current_user: User = Depends(get_current_user)):
    sol = await db.solicitacoes_registro.find_one({"solicitacao_registro_id": solicitacao_registro_id}, {"_id": 0})
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if current_user.perfil != "sigcr_admin" and current_user.user_id != sol["user_id"]:
        await _autorizar_registradora_da_solicitacao_registro(sol, current_user)
    file_path = Path(sol["contrato_pdf_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no armazenamento")
    return FileResponse(path=file_path, filename=f"contrato_{solicitacao_registro_id}.pdf", media_type="application/pdf")


@api_router.get("/solicitacoes-registro/{solicitacao_registro_id}/comprovante")
async def baixar_comprovante_solicitacao_registro(solicitacao_registro_id: str, current_user: User = Depends(get_current_user)):
    sol = await db.solicitacoes_registro.find_one({"solicitacao_registro_id": solicitacao_registro_id}, {"_id": 0})
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if current_user.perfil != "sigcr_admin" and current_user.user_id != sol["user_id"]:
        await _autorizar_registradora_da_solicitacao_registro(sol, current_user)
    if not sol.get("comprovante_pdf_path"):
        raise HTTPException(status_code=404, detail="Solicitação ainda não tem comprovante (não foi concluída)")
    file_path = Path(sol["comprovante_pdf_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no armazenamento")
    return FileResponse(path=file_path, filename=f"comprovante_{solicitacao_registro_id}.pdf", media_type="application/pdf")


@api_router.patch("/solicitacoes-registro/{solicitacao_registro_id}/concluir")
async def concluir_solicitacao_registro(
    solicitacao_registro_id: str,
    numero_registro_detran: str = Form(...),
    comprovante: UploadFile = File(...),
    current_user: User = Depends(require_perfil("registradora")),
):
    sol = await db.solicitacoes_registro.find_one({"solicitacao_registro_id": solicitacao_registro_id}, {"_id": 0})
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    await _autorizar_registradora_da_solicitacao_registro(sol, current_user)
    if sol["status"] in ("concluido", "rejeitado"):
        raise HTTPException(status_code=409, detail="Solicitação já foi concluída ou rejeitada")

    comprovante_pdf_path = await _salvar_pdf_solicitacao_registro(comprovante, "o comprovante")

    agora = datetime.now(timezone.utc).isoformat()
    await db.solicitacoes_registro.update_one(
        {"solicitacao_registro_id": solicitacao_registro_id},
        {"$set": {
            "status": "concluido",
            "comprovante_pdf_path": comprovante_pdf_path,
            "numero_registro_detran": numero_registro_detran,
            "concluido_por": current_user.user_id,
            "concluido_em": agora,
            "updated_at": agora,
        }}
    )
    await criar_notificacao(
        sol["user_id"], "solicitacao_registro_concluida",
        "Registro de contrato concluído",
        f"Sua solicitação de registro de contrato foi concluída. Número de registro DETRAN: {numero_registro_detran}.",
        {"solicitacao_registro_id": solicitacao_registro_id}
    )
    await registrar_auditoria(current_user, "concluir_solicitacao_registro", "solicitacao_registro", solicitacao_registro_id, {
        "numero_registro_detran": numero_registro_detran
    })
    return {"message": "Solicitação concluída"}


@api_router.patch("/solicitacoes-registro/{solicitacao_registro_id}/rejeitar")
async def rejeitar_solicitacao_registro(
    solicitacao_registro_id: str,
    payload: RejeitarSolicitacaoRegistroPayload,
    current_user: User = Depends(require_perfil("registradora")),
):
    sol = await db.solicitacoes_registro.find_one({"solicitacao_registro_id": solicitacao_registro_id}, {"_id": 0})
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    await _autorizar_registradora_da_solicitacao_registro(sol, current_user)
    if sol["status"] in ("concluido", "rejeitado"):
        raise HTTPException(status_code=409, detail="Solicitação já foi concluída ou rejeitada")

    agora = datetime.now(timezone.utc).isoformat()
    entrada_historico = {"motivo": payload.motivo, "rejeitado_por": current_user.user_id, "rejeitado_em": agora}
    await db.solicitacoes_registro.update_one(
        {"solicitacao_registro_id": solicitacao_registro_id},
        {
            "$set": {"status": "rejeitado", "updated_at": agora},
            "$push": {"historico_rejeicoes": entrada_historico},
        }
    )
    await criar_notificacao(
        sol["user_id"], "solicitacao_registro_rejeitada",
        "Solicitação de registro de contrato rejeitada",
        "Sua solicitação de registro de contrato foi rejeitada."
        + (f" Motivo: {payload.motivo}" if payload.motivo else ""),
        {"solicitacao_registro_id": solicitacao_registro_id, "motivo": payload.motivo}
    )
    await registrar_auditoria(current_user, "rejeitar_solicitacao_registro", "solicitacao_registro", solicitacao_registro_id, {
        "motivo": payload.motivo
    })
    return {"message": "Solicitação rejeitada"}


# ============ NOTIFICAÇÕES ============

@api_router.get("/notificacoes")
async def get_notificacoes(scope: EffectiveScope = Depends(get_effective_scope)):
    """EffectiveScope só na LEITURA — marcar como lida (abaixo) continua na
    identidade real, de propósito: simulação é pra visualizar, não pra
    disparar efeito colateral de escrita na conta real da empresa simulada."""
    notifs = await db.notificacoes.find(
        {"user_id": scope.effective_user_id}, {"_id": 0}
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
    notif.pop("_id", None)  # insert_one adiciona _id (ObjectId) de volta no dict por efeito colateral
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
    },
    "dispensa": {
        "nome": "Dispensa Eletrônica",
        "descricao": "Contratação direta simplificada para valores permitidos",
        "cor": "emerald",
        "icone": "zap",
        "documentos_padrao": [
            "CNPJ", "Certidão Fiscal Federal", "Proposta Comercial"
        ],
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
    }
}


@api_router.get("/eventos/templates")
async def get_templates(current_user: User = Depends(get_current_user)):
    return TEMPLATES_EVENTO


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
async def publicar_evento(evento_id: str, current_user: User = Depends(require_perfil("detran", "detran_admin"))):
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
async def atualizar_evento(evento_id: str, request: Request, current_user: User = Depends(require_perfil("detran", "detran_admin"))):
    body = await request.json()
    await db.eventos.update_one({"evento_id": evento_id}, {"$set": body})
    await registrar_auditoria(current_user, "atualizar_evento", "evento", evento_id)
    return {"message": "Evento atualizado"}


@api_router.delete("/eventos/{evento_id}")
async def deletar_evento(evento_id: str, current_user: User = Depends(require_perfil("detran", "detran_admin"))):
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
async def listar_esteiras(scope: EffectiveScope = Depends(get_effective_scope)):
    """Lista todas as esteiras do usuário. Esteiras não têm conceito de
    empresa (só user_id) — sigcr_admin sem 'ver como' ativo vê todas; com
    view_as_company_id, vê as do dono daquela empresa. view_as_detran_uf não
    se aplica aqui (esteiras não são escopadas por UF hoje)."""
    if scope.current_user.perfil == "sigcr_admin" and not scope.is_viewing_as:
        query = {}
    else:
        query = {"user_id": scope.effective_user_id}
    esteiras = await db.esteiras.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return esteiras


@api_router.post("/esteiras")
async def criar_esteira(data: EsteiraCreate, scope: EffectiveScope = Depends(get_effective_scope)):
    """Cria nova esteira de credenciamento. Em modo 'ver como', a esteira é
    criada em nome da empresa/usuário selecionado, não do admin."""
    esteira = Esteira(
        user_id=scope.effective_user_id,
        registradora=data.registradora,
        cnpj=data.cnpj,
        detran=data.detran,
        responsavel=data.responsavel or scope.current_user.email,
    )
    doc = esteira.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.esteiras.insert_one(doc)
    await registrar_auditoria(scope.current_user, "criar_esteira", "esteira", esteira.esteira_id, {},
                               atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    return esteira


@api_router.get("/esteiras/{esteira_id}")
async def get_esteira(esteira_id: str, current_user: User = Depends(get_current_user)):
    """Retorna uma esteira pelo ID (dono ou sigcr_admin em modo 'ver como')"""
    esteira, _ = await _autorizar_acesso_esteira(esteira_id, current_user)
    return esteira


@api_router.patch("/esteiras/{esteira_id}/eventos/{etapa_id}")
async def atualizar_evento_esteira(
    esteira_id: str,
    etapa_id: int,
    evento: EsteiraEvento,
    current_user: User = Depends(get_current_user)
):
    """Atualiza um evento (etapa) dentro da esteira (dono ou sigcr_admin em modo 'ver como')"""
    esteira, scope = await _autorizar_acesso_esteira(esteira_id, current_user)

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
    await registrar_auditoria(current_user, "atualizar_evento_esteira", "esteira", esteira_id, {"etapa_id": etapa_id},
                               atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
    return {"message": "Evento atualizado com sucesso", "esteira_id": esteira_id, "etapa_id": etapa_id}


@api_router.delete("/esteiras/{esteira_id}")
async def deletar_esteira(esteira_id: str, current_user: User = Depends(get_current_user)):
    """Remove uma esteira (dono ou sigcr_admin em modo 'ver como')"""
    _, scope = await _autorizar_acesso_esteira(esteira_id, current_user)
    result = await db.esteiras.delete_one({"esteira_id": esteira_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Esteira não encontrada")
    await registrar_auditoria(current_user, "remover_esteira", "esteira", esteira_id, {},
                               atuando_como_empresa=scope.viewing_as["id"] if scope.viewing_as else None)
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

# UF_VALIDAS agora está centralizada perto do topo do arquivo (usada por documentos, portarias e estados)

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
    {"numero": 7, "nome": "Elaborar cronograma", "raci": {"DIR": "I", "CRE": "R", "OPE": "C"}},
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
    vencimento: Optional[str] = None  # ISO 8601 (YYYY-MM-DD) — sugerido por OCR ou preenchido manualmente
    vencimento_fonte: Optional[str] = None  # "ocr" | "manual" | None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None


class DocumentoUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    notes: Optional[str] = None
    vencimento: Optional[str] = None


def _pode_ver_documento(user: User, doc: dict) -> bool:
    """Hierarquia LGPD de privilégio mínimo: sigcr_admin vê tudo; DETRAN só
    enxerga documentos não-internos do próprio estado; registradora e
    financeira não têm acesso a este módulo (é o dossiê de credenciamento
    da própria HD Registros, não das empresas clientes da plataforma).
    Delega a checagem de escopo por estado para _perfil_pode_ver_estado
    (compartilhada com Estados/Credenciamentos/Portarias), só adicionando
    por cima a regra específica de categoria interna."""
    if user.perfil == "sigcr_admin":
        return True
    if doc["categoria"] in CATEGORIAS_INTERNAS_HD:
        return False
    return _perfil_pode_ver_estado(user, doc.get("estado_sigla"))


async def _checar_permissao_escrita(user: User, categoria: str, estado_sigla: Optional[str]):
    """Quem pode criar/editar/remover documentos: sigcr_admin sempre;
    detran_admin somente para categorias não-internas do próprio estado.
    Mantida com a lógica/mensagens originais (não delega para
    _checar_permissao_escrita_estado) para não alterar o texto das exceções
    já em uso pelo frontend."""
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
async def atualizar_atividade_raci(numero: int, request: Request, current_user: User = Depends(require_perfil("sigcr_admin"))):
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

    extracao = await _pipeline_extracao_vencimento(file_path, file.content_type)

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
        vencimento=extracao["vencimento"],
        vencimento_fonte=extracao["vencimento_fonte"],
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
    scope: EffectiveScope = Depends(get_effective_scope),
):
    """Lista documentos internos de credenciamento. Perfil/UF efetivos vêm do
    scope — se sigcr_admin estiver em modo 'ver como DETRAN X', vê exatamente
    o que um detran_admin de X veria (não o bypass total de admin)."""
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

    if scope.effective_perfil == "sigcr_admin":
        pass
    elif scope.effective_perfil in ("detran", "detran_admin"):
        if not scope.effective_detran_uf:
            raise HTTPException(status_code=403, detail="Usuário DETRAN sem UF configurada")
        if categoria and categoria in CATEGORIAS_INTERNAS_HD:
            raise HTTPException(status_code=403, detail="Perfil sem acesso a esta categoria")
        if not categoria:
            query["categoria"] = {"$in": list(set(DOC_CATEGORIAS) - CATEGORIAS_INTERNAS_HD)}
        query["estado_sigla"] = scope.effective_detran_uf
    else:
        raise HTTPException(status_code=403, detail="Perfil sem acesso ao módulo de documentos")

    documentos = await db.documentos_gov.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return documentos


# IMPORTANTE: precisa vir ANTES de "/documentos/{documento_id}" abaixo — rotas
# literais têm que ser registradas antes de rotas com parâmetro dinâmico no
# mesmo prefixo, senão FastAPI casa "vencimento-resumo" como documento_id e
# essa rota nunca é alcançada (mesmo cuidado já documentado em /portarias).
@api_router.get("/documentos/vencimento-resumo")
async def resumo_vencimento_documentos(scope: EffectiveScope = Depends(get_effective_scope)):
    """Agrega documentos vencendo (até 30 dias) e vencidos das duas frentes
    cobertas pelo módulo de vencimento: certidões de fornecedores/Registradora/
    Financeira (db.documents, escopadas pelas empresas do usuário) e
    documentos internos de credenciamento (db.documentos_gov, mesmo escopo de
    acesso de GET /documentos). Usado pelo card "Documentos vencendo" do
    Dashboard. sigcr_admin sem 'ver como' ativo vê tudo (mesmo padrão de
    GET /documentos); com view_as ativo, vê exatamente o que aquela
    empresa/DETRAN veria."""
    vencendo = []
    vencidos = []

    if scope.current_user.perfil == "sigcr_admin" and not scope.is_viewing_as:
        filtro_empresa = {}
    else:
        filtro_empresa = {"user_id": scope.effective_user_id}
    companies = await db.companies.find(
        {**filtro_empresa, "deleted_at": None},
        {"_id": 0, "company_id": 1, "nome_fantasia": 1, "name": 1},
    ).to_list(100)
    for company in companies:
        docs = await db.documents.find(
            {"company_id": company["company_id"], "deleted_at": None}, {"_id": 0}
        ).to_list(200)
        for doc in docs:
            status = calcular_status_documento(doc)
            if status not in ("vencendo", "vencido"):
                continue
            item = {
                "origem": "empresa",
                "id": doc["document_id"],
                "nome": doc["document_name"],
                "tipo": doc["document_type"],
                "vencimento": doc.get("vencimento"),
                "empresa_nome": company.get("nome_fantasia") or company.get("name"),
            }
            (vencendo if status == "vencendo" else vencidos).append(item)

    query = {"deleted_at": None}
    if scope.effective_perfil == "sigcr_admin":
        pass
    elif scope.effective_perfil in ("detran", "detran_admin"):
        if not scope.effective_detran_uf:
            query = None
        else:
            query["categoria"] = {"$in": list(set(DOC_CATEGORIAS) - CATEGORIAS_INTERNAS_HD)}
            query["estado_sigla"] = scope.effective_detran_uf
    else:
        query = None  # registradora/financeira não têm acesso ao dossiê interno

    if query is not None:
        docs_internos = await db.documentos_gov.find(query, {"_id": 0}).to_list(500)
        for doc in docs_internos:
            status = calcular_status_documento(doc)
            if status not in ("vencendo", "vencido"):
                continue
            item = {
                "origem": "interno",
                "id": doc["documento_id"],
                "nome": doc["nome"],
                "tipo": doc["tipo"],
                "vencimento": doc.get("vencimento"),
                "categoria": doc.get("categoria"),
            }
            (vencendo if status == "vencendo" else vencidos).append(item)

    return {"vencendo": vencendo, "vencidos": vencidos}


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
    await registrar_auditoria(current_user, "download_documento", "documento_gov", documento_id, {
        "estado_sigla": doc.get("estado_sigla")
    })
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
    if "vencimento" in campos:
        campos["vencimento_fonte"] = "manual"

    await db.documentos_gov.update_one({"documento_id": documento_id}, {"$set": campos})
    await registrar_auditoria(current_user, "atualizar_documento", "documento_gov", documento_id, {
        **campos, "estado_sigla": doc.get("estado_sigla")
    })
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
    await registrar_auditoria(current_user, "remover_documento", "documento_gov", documento_id, {
        "estado_sigla": doc.get("estado_sigla")
    })
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


# ============ Fatia C (2026-08-25, PENDING_ACTIONS.md item 27): selo público
# de compliance + varredura de vencimento por e-mail ============

@api_router.post("/admin/notificacoes-vencimento/executar")
async def executar_notificacoes_vencimento(
    current_user: User = Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))
):
    """Dispara manualmente a varredura de vencimentos (mesma rotina do cron diário)."""
    avisos = await _executar_avisos_vencimento()
    return {"avisos_gerados": avisos}


async def _executar_avisos_vencimento() -> int:
    """Varre documentos vencendo (≤30 dias) ou vencidos e dispara notificação
    in-app + e-mail (Resend se RESEND_API_KEY configurada; senão registra em
    db.email_outbox — modo mock, ninguém recebe nada de verdade até a chave
    ser configurada). Idempotente por documento/dia via db.avisos_vencimento."""
    hoje = date.today().isoformat()
    companies = await db.companies.find(
        {"deleted_at": None},
        {"_id": 0, "company_id": 1, "user_id": 1, "nome_fantasia": 1, "email_comercial": 1},
    ).to_list(2000)
    avisos = 0
    for comp in companies:
        docs = await db.documents.find({"company_id": comp["company_id"]}, {"_id": 0}).to_list(500)
        for d in docs:
            status = calcular_status_documento(d)
            if status not in ("vencendo", "vencido"):
                continue
            doc_id = d.get("document_id") or d.get("id") or d.get("nome", "")
            marcador = {"document_id": doc_id, "data": hoje}
            if await db.avisos_vencimento.find_one(marcador):
                continue
            venc = d.get("vencimento", "")
            titulo = "Documento vencido" if status == "vencido" else "Documento vence em breve"
            nome_doc = d.get("document_name") or d.get("document_type") or "documento"
            msg = f"O documento '{nome_doc}' de {comp.get('nome_fantasia', '')} " + (
                f"venceu em {venc}." if status == "vencido" else f"vence em {venc} (30 dias ou menos)."
            )
            await criar_notificacao(comp["user_id"], "documento_vencimento", titulo, msg,
                                    {"company_id": comp["company_id"], "document_id": doc_id, "status": status})
            if comp.get("email_comercial"):
                await enviar_email(
                    db, comp["email_comercial"], f"SIGCR — {titulo}",
                    f"<p>{msg}</p><p>Acesse o SIGCR para regularizar: renove o documento na área de Gestão Documental.</p>",
                    {"company_id": comp["company_id"], "document_id": doc_id},
                )
            await db.avisos_vencimento.insert_one({**marcador, "criado_em": datetime.now(timezone.utc).isoformat()})
            avisos += 1
    logger.info(f"Varredura de vencimentos: {avisos} avisos gerados")
    return avisos


@api_router.post("/cron/avisos-vencimento")
async def cron_avisos_vencimento(request: Request, background_tasks: BackgroundTasks):
    # Endpoint de cron precisa responder 2xx na hora; o trabalho de verdade
    # roda em background. Sem WEBHOOK_CRON_SECRET configurada (não está
    # hoje), este endpoint responde 401 sempre — inerte por padrão.
    import hmac
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    if not secret or not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], secret):
        raise HTTPException(status_code=401, detail="Não autorizado")
    run_id = request.headers.get("X-Webhook-Id") or ""
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"status": "duplicado", "run_id": run_id}
        await db.cron_runs.insert_one({
            "run_id": run_id, "job": "avisos-vencimento",
            "criado_em": datetime.now(timezone.utc).isoformat(),
        })
    background_tasks.add_task(_executar_avisos_vencimento)
    return {"status": "aceito"}


@api_router.get("/public/selo/{company_id}")
async def selo_publico(company_id: str, request: Request):
    """Selo público verificável do status de credenciamento/compliance de uma
    empresa — sem auth, só dados não sensíveis (CNPJ mascarado)."""
    _rate_limit(request, "selo_publico", max_hits=30, window_s=60)
    comp = await db.companies.find_one({"company_id": company_id, "deleted_at": None}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    docs = await db.documents.find({"company_id": company_id}, {"_id": 0, "vencimento": 1}).to_list(500)
    validos = vencendo = vencidos = 0
    for d in docs:
        s = calcular_status_documento(d)
        if s == "vencido":
            vencidos += 1
        elif s == "vencendo":
            vencendo += 1
        elif s == "valido":
            validos += 1
    semaforo = "vermelho" if vencidos else ("amarelo" if vencendo else "verde")
    cnpj = (comp.get("cnpj") or "").replace(".", "").replace("/", "").replace("-", "")
    cnpj_mascarado = f"{cnpj[:2]}.***.***/****-{cnpj[-2:]}" if len(cnpj) == 14 else "***"
    credenciada = comp.get("status") in ["approved", "ativo_contrato_assinado"]
    return {
        "company_id": company_id,
        "nome_fantasia": comp.get("nome_fantasia") or comp.get("name"),
        "tipo_empresa": comp.get("tipo_empresa"),
        "cnpj_mascarado": cnpj_mascarado,
        "status": comp.get("status"),
        "credenciada": credenciada,
        "semaforo": semaforo,
        "documentos": {"validos": validos, "vencendo": vencendo, "vencidos": vencidos, "total": len(docs)},
        "detrans_atuacao": comp.get("detrans_atuacao", []),
        "verificado_em": datetime.now(timezone.utc).isoformat(),
    }


@app.on_event("startup")
async def seed_checklist_catalogo_portaria():
    """Popula os 12 itens iniciais do catálogo de checklist de portaria (Bloco I/II/III) na primeira execução."""
    if await db.checklist_catalogo_portaria.count_documents({}) > 0:
        return
    docs = []
    for item in CHECKLIST_CATALOGO_PORTARIA_SEED:
        docs.append({
            "item_id": item["item_id"],
            "bloco": item["bloco"],
            "nome": item["nome"],
            "descricao": item["descricao"],
            "perfil_alvo": item["perfil_alvo"],
            "ativo": True,
            "created_by": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.checklist_catalogo_portaria.insert_many(docs)
    logger.info("Seed: 12 itens do catálogo de checklist de portaria inseridos em checklist_catalogo_portaria")


app.include_router(api_router)
