import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X, FolderOpen, Shield } from "lucide-react";

const CATEGORIAS = [
  { id:"contrato_social",   label:"Contrato Social",         obrig:true  },
  { id:"cnpj",              label:"Carto CNPJ",             obrig:true  },
  { id:"inscricao_estadual",label:"Inscrio Estadual",      obrig:true  },
  { id:"cert_regularidade", label:"Certido de Regularidade",obrig:true  },
  { id:"responsavel_tecnico",label:"Resp. Tcnico (RG/CPF)",  obrig:true  },
  { id:"balanco_patrimonial",label:"Balano Patrimonial",    obrig:false },
  { id:"comprov_endereco",  label:"Comprovante de Endereo", obrig:false },
  { id:"cert_federal",      label:"Certido Negativa Federal",obrig:false },
];

export default function UploadDocumentos() {
  const [arquivos, setArquivos] = useState({});
  const [uploading, setUploading] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const inputRef = useRef(null);
  const [catSelecionada, setCatSelecionada] = useState(null);

  const handleFile = (catId, file) => {
    if (!file) return;
    // Validaes LGPD
    const permitidos = ["application/pdf","image/jpeg","image/png","image/webp"];
    if (!permitidos.includes(file.type)) {
      alert("Apenas PDF, JPG, PNG so aceitos.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Arquivo muito grande. Mximo 10MB.");
      return;
    }
    setUploading(catId);
    // Simula upload
    setTimeout(() => {
      setArquivos(prev => ({ ...prev, [catId]: { nome:file.name, tamanho:file.size, status:"ok" } }));
      setUploading(null);
    }, 1500);
  };

  const obrigPendentes = CATEGORIAS.filter(c => c.obrig && !arquivos[c.id]).length;
  const total = Object.keys(arquivos).length;

  return (
    <div style={{ minHeight:"100vh", background:"#080B10", fontFamily:"system-ui,sans-serif", color:"#E8EAF0", padding:"32px" }}>
      {/* Header */}
      <div style={{ marginBottom:"28px" }}>
        <a href="/dashboard" style={{ display:"inline-flex", alignItems:"center", gap:"6px", color:"#6B7280", textDecoration:"none", fontSize:"13px", marginBottom:"16px" }}> Voltar</a>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <h1 style={{ fontSize:"24px", fontWeight:800, color:"#fff", margin:"0 0 6px" }}> Documentos HD Registros</h1>
            <p style={{ fontSize:"13px", color:"#6B7280", margin:0 }}>Upload seguro para credenciamento DETRAN  Dados protegidos por LGPD</p>
          </div>
          <div style={{ display:"flex", gap:"10px" }}>
            <div style={{ background:obrigPendentes===0?"rgba(34,197,94,0.1)":"rgba(249,115,22,0.1)", border:`1px solid ${obrigPendentes===0?"rgba(34,197,94,0.3)":"rgba(249,115,22,0.3)"}`, borderRadius:"10px", padding:"10px 16px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:obrigPendentes===0?"#22c55e":"#f97316" }}>{total}/{CATEGORIAS.length}</div>
              <div style={{ fontSize:"10px", color:"#6B7280", textTransform:"uppercase" }}>Enviados</div>
            </div>
          </div>
        </div>
        {/* Barra de progresso */}
        <div style={{ marginTop:"16px", height:"4px", background:"rgba(255,255,255,0.06)", borderRadius:"4px", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${(total/CATEGORIAS.length)*100}%`, background:"linear-gradient(90deg,#f97316,#22c55e)", borderRadius:"4px", transition:"width 0.5s" }}/>
        </div>
      </div>

      {/* Aviso LGPD */}
      <div style={{ display:"flex", gap:"10px", alignItems:"flex-start", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:"12px", padding:"14px 16px", marginBottom:"24px" }}>
        <Shield size={16} color="#60a5fa" style={{ flexShrink:0, marginTop:"1px" }}/>
        <div style={{ fontSize:"12px", color:"#93c5fd", lineHeight:1.6 }}>
          <strong>Proteo LGPD:</strong> Todos os documentos so armazenados com criptografia AES-256 e acessados apenas por agentes autorizados. O envio implica consentimento para uso exclusivo no processo de credenciamento DETRAN.
        </div>
      </div>

      {/* Lista de documentos */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:"14px" }}>
        {CATEGORIAS.map(cat => {
          const arq = arquivos[cat.id];
          const isUploading = uploading === cat.id;
          const isDrag = dragOver === cat.id;
          return (
            <div key={cat.id}
              onDragOver={e => { e.preventDefault(); setDragOver(cat.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); setDragOver(null); handleFile(cat.id, e.dataTransfer.files[0]); }}
              style={{ background:isDrag?"rgba(249,115,22,0.06)":arq?"rgba(34,197,94,0.04)":"rgba(255,255,255,0.02)", border:`1.5px solid ${isDrag?"rgba(249,115,22,0.4)":arq?"rgba(34,197,94,0.25)":"rgba(255,255,255,0.07)"}`, borderRadius:"14px", padding:"18px", cursor:"pointer", transition:"all 0.2s" }}
              onClick={() => { if(!arq){ setCatSelecionada(cat.id); inputRef.current.click(); } }}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"12px" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:"14px", color:"#E8EAF0" }}>{cat.label}</div>
                  {cat.obrig && <span style={{ fontSize:"10px", color:"#f97316", background:"rgba(249,115,22,0.1)", padding:"2px 6px", borderRadius:"4px" }}>Obrigatrio</span>}
                </div>
                {arq && <button onClick={e => { e.stopPropagation(); setArquivos(p => { const n={...p}; delete n[cat.id]; return n; }); }} style={{ background:"none", border:"none", color:"#6B7280", cursor:"pointer", padding:"2px" }}><X size={14}/></button>}
              </div>
              {isUploading ? (
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"20px", height:"20px", border:"2px solid rgba(249,115,22,0.2)", borderTopColor:"#f97316", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }}/>
                  <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Enviando...</span>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : arq ? (
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <CheckCircle size={18} color="#22c55e"/>
                  <div>
                    <div style={{ fontSize:"12px", color:"#22c55e", fontWeight:600 }}>{arq.nome}</div>
                    <div style={{ fontSize:"10px", color:"#6B7280" }}>{(arq.tamanho/1024).toFixed(0)} KB  Enviado</div>
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:"10px", color:"#6B7280" }}>
                  <Upload size={16}/>
                  <span style={{ fontSize:"12px" }}>Clique ou arraste o arquivo aqui</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input oculto */}
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => { handleFile(catSelecionada, e.target.files[0]); e.target.value=""; }} />

      {/* Boto enviar */}
      {total > 0 && (
        <div style={{ position:"sticky", bottom:"24px", display:"flex", justifyContent:"center", marginTop:"28px" }}>
          <button disabled={obrigPendentes>0} style={{ padding:"14px 40px", borderRadius:"12px", border:"none", cursor:obrigPendentes===0?"pointer":"not-allowed", background:obrigPendentes===0?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.06)", color:obrigPendentes===0?"#fff":"#4B5563", fontSize:"15px", fontWeight:800, boxShadow:obrigPendentes===0?"0 4px 20px rgba(249,115,22,0.3)":"none" }}>
            {obrigPendentes===0 ? " Submeter documentos ao DETRAN" : `Faltam ${obrigPendentes} documento(s) obrigatrio(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
