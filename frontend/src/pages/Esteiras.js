import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ETAPAS = [
  { id: 1, nome: "Solicitacao",        icone: "" },
  { id: 2, nome: "Analise Documental", icone: "" },
  { id: 3, nome: "Vistoria Tecnica",   icone: "" },
  { id: 4, nome: "Parecer Juridico",   icone: "" },
  { id: 5, nome: "Homologacao",        icone: "" },
];

const STATUS_CFG = {
  pendente:     { label: "Pendente",     color: "#FFB74D", bg: "rgba(255,183,77,0.12)" },
  em_andamento: { label: "Em Andamento", color: "#4FC3F7", bg: "rgba(79,195,247,0.12)" },
  concluido:    { label: "Concluido",    color: "#81C784", bg: "rgba(129,199,132,0.12)" },
  reprovado:    { label: "Reprovado",    color: "#EF9A9A", bg: "rgba(239,154,154,0.12)" },
  aguardando:   { label: "Aguardando",   color: "#CE93D8", bg: "rgba(206,147,216,0.12)" },
};

function prog(eventos) {
  if (!eventos || !eventos.length) return 0;
  return Math.round((eventos.filter(e => e.status === "concluido").length / eventos.length) * 100);
}

function ModalNovaEsteira({ onClose, onSave, token }) {
  const [form, setForm] = useState({ registradora: "", cnpj: "", detran: "", responsavel: "" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.registradora || !form.cnpj || !form.detran) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/esteiras`, form, { headers: { Authorization: `Bearer ${token}` } });
      onSave(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#111318", border:"1.5px solid rgba(251,146,60,0.25)", borderRadius:20, padding:32, width:460 }}>
        <div style={{ fontWeight:800, fontSize:17, color:"#F1F3F8", marginBottom:6 }}>Nova Esteira</div>
        <div style={{ fontSize:12, color:"#6B7280", marginBottom:22 }}>Iniciar processo de credenciamento</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[
            { label:"Registradora *", key:"registradora", ph:"Nome da registradora" },
            { label:"CNPJ *", key:"cnpj", ph:"00.000.000/0001-00" },
            { label:"DETRAN *", key:"detran", ph:"Ex: DETRAN-DF" },
            { label:"Responsavel", key:"responsavel", ph:"Nome do responsavel" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>{f.label}</label>
              <input value={form[f.key]} onChange={e => setForm({...form,[f.key]:e.target.value})} placeholder={f.ph}
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:9, color:"#E8EAF0", padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, marginTop:24 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px", borderRadius:9, cursor:"pointer", background:"transparent", border:"1.5px solid rgba(255,255,255,0.1)", color:"#6B7280", fontSize:13, fontWeight:700 }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{ flex:2, padding:"11px", borderRadius:9, cursor:"pointer", background:"linear-gradient(135deg,#f97316,#fb923c)", border:"none", color:"#fff", fontSize:13, fontWeight:800 }}>
            {loading ? "Criando..." : "Criar Esteira"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEvento({ esteira, onClose, onSave, token }) {
  const [form, setForm] = useState({ etapa_id:"", status:"em_andamento", data:new Date().toISOString().slice(0,10), prazo:"", responsavel:"", docs:"", obs:"" });
  const [loading, setLoading] = useState(false);
  const disponiveis = ETAPAS.filter(e => !esteira.eventos?.find(ev => ev.etapa_id === e.id && ev.status === "concluido"));
  const handleSubmit = async () => {
    if (!form.etapa_id) return;
    setLoading(true);
    try {
      await axios.patch(`${API}/esteiras/${esteira.esteira_id}/eventos/${form.etapa_id}`,
        { ...form, etapa_id: parseInt(form.etapa_id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSave();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#111318", border:"1.5px solid rgba(251,146,60,0.25)", borderRadius:20, padding:32, width:500, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:17, color:"#F1F3F8" }}>Criar Evento</div>
            <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{esteira.registradora}</div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#9CA3AF", padding:"6px 12px", cursor:"pointer", fontSize:16 }}>x</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[
            { label:"Etapa *", key:"etapa_id", type:"select", opts: disponiveis.map(e => ({ v:e.id, l:`${e.icone} ${e.nome}` })) },
            { label:"Status", key:"status", type:"select", opts: Object.entries(STATUS_CFG).map(([v,c]) => ({ v, l:c.label })) },
            { label:"Data do Evento", key:"data", type:"date" },
            { label:"Prazo Limite", key:"prazo", type:"date" },
            { label:"Responsavel", key:"responsavel", type:"text", ph:"Nome do responsavel" },
            { label:"Documentos", key:"docs", type:"text", ph:"Ex: Certidao, Contrato social..." },
            { label:"Observacoes", key:"obs", type:"textarea", ph:"Observacoes..." },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 }}>{f.label}</label>
              {f.type === "select" ? (
                <select value={form[f.key]} onChange={e => setForm({...form,[f.key]:e.target.value})}
                  style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:9, color:"#E8EAF0", padding:"9px 12px", fontSize:13, outline:"none", appearance:"none" }}>
                  <option value="">Selecione...</option>
                  {f.opts.map(o => <option key={o.v} value={o.v} style={{ background:"#111318" }}>{o.l}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={form[f.key]} onChange={e => setForm({...form,[f.key]:e.target.value})} placeholder={f.ph} rows={3}
                  style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:9, color:"#E8EAF0", padding:"9px 12px", fontSize:13, outline:"none", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
              ) : (
                <input type={f.type} value={form[f.key]} onChange={e => setForm({...form,[f.key]:e.target.value})} placeholder={f.ph}
                  style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:9, color:"#E8EAF0", padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", colorScheme:"dark" }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, marginTop:24 }}>
          <button onClick={onClose} style={{ flex:1, padding:"11px", borderRadius:9, cursor:"pointer", background:"transparent", border:"1.5px solid rgba(255,255,255,0.1)", color:"#6B7280", fontSize:13, fontWeight:700 }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} style={{ flex:2, padding:"11px", borderRadius:9, cursor:"pointer", background:"linear-gradient(135deg,#f97316,#fb923c)", border:"none", color:"#fff", fontSize:13, fontWeight:800 }}>
            {loading ? "Salvando..." : "Registrar Evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Esteiras() {
  const { getToken, keycloak } = useAuth();
  const [token, setToken] = React.useState(null);

  React.useEffect(() => {
    const fetchToken = async () => {
      try { const t = await getToken(); setToken(t); } catch(e) { console.error(e); }
    };
    fetchToken();
  }, [getToken]);
  const [esteiras, setEsteiras] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErro(null);
    try {
      const res = await axios.get(`${API}/esteiras`, { headers: { Authorization: `Bearer ${token}` } });
      setEsteiras(res.data);
      if (res.data.length && !selectedId) setSelectedId(res.data[0].esteira_id);
    } catch (e) { console.error(e); setErro("Erro ao carregar esteiras."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const selected = esteiras.find(e => e.esteira_id === selectedId);
  const filtradas = esteiras.filter(e =>
    e.registradora?.toLowerCase().includes(busca.toLowerCase()) ||
    e.detran?.toLowerCase().includes(busca.toLowerCase())
  );

  const cardStyle = (sel) => ({
    background: sel ? "rgba(251,146,60,0.07)" : "rgba(255,255,255,0.02)",
    border: sel ? "1.5px solid rgba(251,146,60,0.4)" : "1.5px solid rgba(255,255,255,0.06)",
    borderRadius:14, padding:"18px 20px", cursor:"pointer", transition:"all 0.2s", marginBottom:10,
  });

  return (
    <div style={{ display:"flex", height:"100%", minHeight:"100vh", background:"#0A0D12", fontFamily:"system-ui, sans-serif", color:"#E8EAF0" }}>
      <div style={{ width:320, borderRight:"1px solid rgba(255,255,255,0.06)", padding:"24px 18px", overflowY:"auto", flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontWeight:800, fontSize:15, color:"#F1F3F8" }}>Esteiras ({esteiras.length})</span>
          <button onClick={() => setModal("nova")} style={{ fontSize:11, fontWeight:800, padding:"4px 12px", borderRadius:20, background:"linear-gradient(135deg,#f97316,#fb923c)", border:"none", color:"#fff", cursor:"pointer" }}>+ Nova</button>
        </div>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar registradora..."
          style={{ background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(255,255,255,0.08)", borderRadius:9, color:"#E8EAF0", padding:"9px 13px", fontSize:12, outline:"none", width:"100%", marginBottom:14, boxSizing:"border-box", fontFamily:"inherit" }} />
        {loading ? <div style={{ color:"#6B7280", textAlign:"center", padding:"40px 0" }}>Carregando...</div>
        : erro ? <div style={{ color:"#EF9A9A", fontSize:12, textAlign:"center", padding:"20px 0" }}>{erro}</div>
        : filtradas.length === 0 ? (
          <div style={{ color:"#6B7280", fontSize:13, textAlign:"center", padding:"40px 0" }}>
            Nenhuma esteira.<br/>
            <button onClick={() => setModal("nova")} style={{ marginTop:10, fontSize:12, color:"#f97316", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Criar primeira</button>
          </div>
        ) : filtradas.map(est => {
          const p = prog(est.eventos); const sel = est.esteira_id === selectedId;
          return (
            <div key={est.esteira_id} style={cardStyle(sel)} onClick={() => setSelectedId(est.esteira_id)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:14, color:"#F1F3F8", marginBottom:2 }}>{est.registradora}</div>
                  <div style={{ fontSize:11, color:"#6B7280" }}>{est.cnpj}  {est.detran}</div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, padding:"3px 7px", borderRadius:20, background:"rgba(251,146,60,0.1)", color:"#fb923c", textTransform:"uppercase", flexShrink:0 }}>{est.esteira_id?.slice(0,8)}</span>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"#6B7280" }}>Progresso</span>
                  <span style={{ fontSize:11, fontWeight:700, color: p===100 ? "#81C784" : "#fb923c" }}>{p}%</span>
                </div>
                <div style={{ height:3, borderRadius:3, background:"rgba(255,255,255,0.06)" }}>
                  <div style={{ height:"100%", borderRadius:3, background: p===100 ? "linear-gradient(90deg,#81C784,#4DB6AC)" : "linear-gradient(90deg,#f97316,#fb923c)", width:`${p}%`, transition:"width 0.4s" }} />
                </div>
              </div>
              <div style={{ fontSize:11, color:"#6B7280" }}> {est.responsavel}</div>
            </div>
          );
        })}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"32px 36px" }}>
        {loading ? <div style={{ color:"#6B7280", textAlign:"center", padding:"80px 0" }}>Carregando...</div>
        : !selected ? <div style={{ color:"#6B7280", textAlign:"center", padding:"80px 0" }}>{esteiras.length === 0 ? "Nenhuma esteira ainda." : "Selecione uma esteira."}</div>
        : (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:22, color:"#F1F3F8", marginBottom:6 }}>{selected.registradora}</div>
                <div style={{ display:"flex", gap:14, fontSize:12, color:"#6B7280", flexWrap:"wrap" }}>
                  <span> {selected.detran}</span>
                  <span> {selected.cnpj}</span>
                  <span> {selected.responsavel}</span>
                </div>
              </div>
              <button onClick={() => setModal("evento")} style={{ background:"linear-gradient(135deg,#f97316,#fb923c)", border:"none", borderRadius:11, color:"#fff", padding:"11px 22px", fontWeight:800, fontSize:13, cursor:"pointer", flexShrink:0 }}>
                + Criar Evento
              </button>
            </div>

            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"18px 22px", marginBottom:28 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontWeight:700, fontSize:13, color:"#9CA3AF" }}>Progresso da Esteira</span>
                <span style={{ fontWeight:800, fontSize:20, color: prog(selected.eventos)===100 ? "#81C784" : "#f97316" }}>{prog(selected.eventos)}%</span>
              </div>
              <div style={{ height:5, borderRadius:5, background:"rgba(255,255,255,0.06)" }}>
                <div style={{ height:"100%", borderRadius:5, background: prog(selected.eventos)===100 ? "linear-gradient(90deg,#81C784,#4DB6AC)" : "linear-gradient(90deg,#f97316,#fb923c)", width:`${prog(selected.eventos)}%`, transition:"width 0.5s" }} />
              </div>
              <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
                {Object.entries(STATUS_CFG).map(([k,c]) => {
                  const cnt = selected.eventos?.filter(e => e.status===k).length || 0;
                  if (!cnt) return null;
                  return <span key={k} style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20, color:c.color, background:c.bg, textTransform:"uppercase" }}>{cnt}x {c.label}</span>;
                })}
              </div>
            </div>

            <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:"24px 26px" }}>
              <div style={{ fontWeight:800, fontSize:13, color:"#9CA3AF", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:22 }}>Fluxo da Esteira</div>
              {ETAPAS.map((etapa, idx) => {
                const ev = selected.eventos?.find(e => e.etapa_id === etapa.id);
                if (!ev) return null;
                const cfg = STATUS_CFG[ev.status] || STATUS_CFG.pendente;
                const isLast = idx === ETAPAS.length - 1;
                return (
                  <div key={etapa.id} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:cfg.bg, border:`2px solid ${cfg.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{etapa.icone}</div>
                      {!isLast && <div style={{ width:2, minHeight:28, background: ev.status==="concluido" ? "#f97316" : "rgba(255,255,255,0.07)", margin:"3px 0" }} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : 18, flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:"#E8EAF0" }}>{etapa.nome}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, color:cfg.color, background:cfg.bg, textTransform:"uppercase" }}>{cfg.label}</span>
                      </div>
                      {ev.data && <div style={{ fontSize:11, color:"#6B7280", marginBottom:2 }}>{new Date(ev.data).toLocaleDateString("pt-BR")}</div>}
                      {ev.obs && <div style={{ fontSize:12, color:"#9CA3AF", fontStyle:"italic" }}>{ev.obs}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {modal === "nova" && <ModalNovaEsteira onClose={() => setModal(null)} onSave={(nova) => { setEsteiras(prev => [nova, ...prev]); setSelectedId(nova.esteira_id); setModal(null); }} token={token} />}
      {modal === "evento" && selected && <ModalEvento esteira={selected} onClose={() => setModal(null)} onSave={async () => { setModal(null); await carregar(); }} token={token} />}
    </div>
  );
}
