import React, { useState, useEffect } from "react";
import { Cookie, X, Shield, ChevronDown } from "lucide-react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [prefs, setPrefs] = useState({ essenciais:true, analytics:false, marketing:false });

  useEffect(() => {
    const aceito = localStorage.getItem("sigcr_cookies");
    if (!aceito) setTimeout(() => setVisible(true), 1500);
  }, []);

  const aceitar = (tipo) => {
    const config = tipo === "todos"
      ? { essenciais:true, analytics:true, marketing:true }
      : tipo === "essenciais"
      ? { essenciais:true, analytics:false, marketing:false }
      : prefs;
    localStorage.setItem("sigcr_cookies", JSON.stringify({ aceito:true, config, data: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div data-testid="cookie-banner" style={{ position:"fixed", bottom:"16px", right:"16px", left:"auto", width:"min(380px, calc(100vw - 32px))", zIndex:9999, background:"#0f1117", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:"14px", boxShadow:"0 20px 60px rgba(0,0,0,0.6)", fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"14px 16px 0" }}>
        <div style={{ width:"30px", height:"30px", background:"rgba(33,150,243,0.1)", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Cookie size={16} color="#2196f3"/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:"13px", color:"#fff" }}>Cookies e Privacidade</div>
          <div style={{ fontSize:"11px", color:"#6B7280" }}>LGPD — Lei nº 13.709/2018</div>
        </div>
        <button data-testid="cookie-close-btn" onClick={() => aceitar("essenciais")} style={{ background:"none", border:"none", color:"#6B7280", cursor:"pointer", padding:"4px" }}>
          <X size={16}/>
        </button>
      </div>

      {/* Corpo */}
      <div style={{ padding:"10px 16px 14px" }}>
        <p style={{ fontSize:"12px", color:"#9CA3AF", lineHeight:1.5, margin:"0 0 10px" }}>
          Utilizamos cookies essenciais para o funcionamento do SIGCR e, com seu consentimento, cookies analíticos para melhoria da plataforma. Nenhum dado pessoal é compartilhado com terceiros.
        </p>

        {/* Expandir opções */}
        <button onClick={() => setExpandido(!expandido)} style={{ display:"flex", alignItems:"center", gap:"6px", background:"none", border:"none", color:"#2196f3", cursor:"pointer", fontSize:"12px", fontWeight:600, padding:0, marginBottom:"10px" }}>
          <Shield size={13}/>
          Personalizar preferências
          <ChevronDown size={13} style={{ transform:expandido?"rotate(180deg)":"none", transition:"0.2s" }}/>
        </button>

        {expandido && (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"10px", background:"rgba(255,255,255,0.02)", borderRadius:"10px", padding:"12px" }}>
            {[
              { key:"essenciais", label:"Essenciais", desc:"Autenticação e segurança", obrig:true },
              { key:"analytics",  label:"Analíticos",  desc:"Melhorias de performance", obrig:false },
              { key:"marketing",  label:"Marketing",   desc:"Comunicações relevantes", obrig:false },
            ].map(c => (
              <div key={c.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"12px", fontWeight:600, color:"#E8EAF0" }}>{c.label} {c.obrig && <span style={{ fontSize:"9px", color:"#6B7280" }}>(obrigatório)</span>}</div>
                  <div style={{ fontSize:"11px", color:"#6B7280" }}>{c.desc}</div>
                </div>
                <div onClick={() => !c.obrig && setPrefs({...prefs,[c.key]:!prefs[c.key]})}
                  style={{ width:"36px", height:"20px", borderRadius:"10px", background:prefs[c.key]||c.obrig?"#2196f3":"rgba(255,255,255,0.1)", cursor:c.obrig?"default":"pointer", position:"relative", transition:"0.2s", flexShrink:0 }}>
                  <div style={{ position:"absolute", top:"3px", left:prefs[c.key]||c.obrig?"18px":"3px", width:"14px", height:"14px", borderRadius:"50%", background:"#fff", transition:"0.2s" }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botões */}
        <div style={{ display:"flex", gap:"8px" }}>
          <button data-testid="cookie-essenciais-btn" onClick={() => aceitar("essenciais")} style={{ flex:1, padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"#9CA3AF", fontSize:"12px", cursor:"pointer", fontWeight:600 }}>
            Só essenciais
          </button>
          {expandido
            ? <button data-testid="cookie-salvar-btn" onClick={() => aceitar("personalizado")} style={{ flex:1, padding:"8px", borderRadius:"8px", border:"none", background:"rgba(33,150,243,0.15)", color:"#2196f3", fontSize:"12px", cursor:"pointer", fontWeight:700 }}>Salvar preferências</button>
            : <button data-testid="cookie-aceitar-btn" onClick={() => aceitar("todos")} style={{ flex:1, padding:"8px", borderRadius:"8px", border:"none", background:"linear-gradient(135deg,#2196f3,#1e88e5)", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:700 }}>Aceitar todos</button>
          }
        </div>
        <p style={{ fontSize:"10px", color:"#4B5563", textAlign:"center", margin:"8px 0 0" }}>
          Ver <a href="/privacidade" style={{ color:"#6B7280" }}>Política de Privacidade</a> · <a href="/termos" style={{ color:"#6B7280" }}>Termos de Uso</a>
        </p>
      </div>
    </div>
  );
}
