import React from "react";
import { Smartphone, Download, Apple, Star, Shield, Zap, QrCode } from "lucide-react";

export default function AppMobile() {
  const features = [
    { icon: <Zap size={18}/>, titulo:"Notificações em tempo real", desc:"Alertas de credenciamento e vencimentos direto no celular" },
    { icon: <Shield size={18}/>, titulo:"Autenticao biomtrica", desc:"Face ID e impresso digital para acesso seguro" },
    { icon: <QrCode size={18}/>, titulo:"Leitura de QR Code", desc:"Escaneie documentos e validaes em campo" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#080B10", fontFamily:"system-ui,sans-serif", color:"#E8EAF0", padding:"40px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom:"40px" }}>
        <a href="/dashboard" style={{ display:"inline-flex", alignItems:"center", gap:"6px", color:"#6B7280", textDecoration:"none", fontSize:"13px", marginBottom:"24px" }}>
           Voltar ao painel
        </a>
        <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
          <div style={{ width:"60px", height:"60px", background:"linear-gradient(135deg,#2196f3,#1e88e5)", borderRadius:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Smartphone size={30} color="#fff"/>
          </div>
          <div>
            <h1 style={{ fontSize:"28px", fontWeight:800, color:"#fff", margin:0 }}>sigcr SIGCR Mobile</h1>
            <p style={{ fontSize:"14px", color:"#6B7280", margin:"4px 0 0" }}>Gerencie credenciamentos de qualquer lugar</p>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:"32px", flexWrap:"wrap" }}>
        {/* Coluna principal */}
        <div style={{ flex:"1 1 400px" }}>
          {/* Store badges */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1.5px solid rgba(255,255,255,0.07)", borderRadius:"18px", padding:"28px", marginBottom:"20px" }}>
            <h2 style={{ fontSize:"18px", fontWeight:700, color:"#fff", marginBottom:"20px" }}>Disponvel em breve</h2>
            <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", marginBottom:"24px" }}>
              {/* App Store */}
              <div style={{ flex:"1 1 180px", display:"flex", alignItems:"center", gap:"12px", background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:"12px", padding:"14px 18px", cursor:"pointer", opacity:0.7 }}>
                <Apple size={28} color="#fff"/>
                <div>
                  <div style={{ fontSize:"10px", color:"#9CA3AF" }}>Em breve na</div>
                  <div style={{ fontWeight:700, color:"#fff", fontSize:"15px" }}>App Store</div>
                </div>
              </div>
              {/* Play Store */}
              <div style={{ flex:"1 1 180px", display:"flex", alignItems:"center", gap:"12px", background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:"12px", padding:"14px 18px", cursor:"pointer", opacity:0.7 }}>
                <Download size={28} color="#22c55e"/>
                <div>
                  <div style={{ fontSize:"10px", color:"#9CA3AF" }}>Em breve no</div>
                  <div style={{ fontWeight:700, color:"#fff", fontSize:"15px" }}>Google Play</div>
                </div>
              </div>
            </div>
            {/* Aviso beta */}
            <div style={{ background:"rgba(33,150,243,0.08)", border:"1px solid rgba(33,150,243,0.25)", borderRadius:"10px", padding:"12px 16px", display:"flex", gap:"10px", alignItems:"flex-start" }}>
              <span style={{ fontSize:"16px" }}></span>
              <div>
                <div style={{ fontWeight:700, fontSize:"13px", color:"#2196f3", marginBottom:"4px" }}>Programa de Beta Testers</div>
                <div style={{ fontSize:"12px", color:"#9CA3AF" }}>Cadastre seu e-mail para ser um dos primeiros a testar o aplicativo sigcr SIGCR Mobile.</div>
              </div>
            </div>
            {/* Form email */}
            <div style={{ display:"flex", gap:"8px", marginTop:"14px" }}>
              <input placeholder="E-mail corporativo" style={{ flex:1, background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:"8px", color:"#E8EAF0", padding:"10px 14px", fontSize:"13px", outline:"none" }} />
              <button style={{ background:"linear-gradient(135deg,#2196f3,#1e88e5)", border:"none", borderRadius:"8px", color:"#fff", padding:"10px 18px", fontSize:"13px", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                Quero testar
              </button>
            </div>
            <p style={{ fontSize:"11px", color:"#4B5563", marginTop:"8px" }}>
               Seus dados so protegidos conforme a LGPD. No compartilhamos com terceiros.
            </p>
          </div>

          {/* Features */}
          <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
            {features.map((f, i) => (
              <div key={i} style={{ display:"flex", gap:"14px", alignItems:"flex-start", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"12px", padding:"16px" }}>
                <div style={{ width:"38px", height:"38px", background:"rgba(33,150,243,0.1)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", color:"#2196f3", flexShrink:0 }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:"14px", color:"#E8EAF0", marginBottom:"4px" }}>{f.titulo}</div>
                  <div style={{ fontSize:"12px", color:"#6B7280" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mock do app */}
        <div style={{ flex:"0 0 220px", display:"flex", flexDirection:"column", alignItems:"center", gap:"16px" }}>
          <div style={{ width:"200px", height:"360px", background:"rgba(255,255,255,0.03)", border:"2px solid rgba(255,255,255,0.1)", borderRadius:"32px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", position:"relative", overflow:"hidden" }}>
            {/* Notch */}
            <div style={{ position:"absolute", top:"12px", width:"60px", height:"8px", background:"rgba(255,255,255,0.1)", borderRadius:"4px" }} />
            {/* Contedo mock */}
            <div style={{ width:"160px", padding:"0 8px" }}>
              <div style={{ background:"rgba(33,150,243,0.15)", border:"1px solid rgba(33,150,243,0.3)", borderRadius:"10px", padding:"12px", marginBottom:"8px", textAlign:"center" }}>
                <div style={{ fontSize:"10px", color:"#2196f3", fontWeight:700 }}> DETRAN-CE</div>
                <div style={{ fontSize:"9px", color:"#9CA3AF", marginTop:"3px" }}>POC convocada!</div>
              </div>
              <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:"10px", padding:"10px", marginBottom:"6px" }}>
                <div style={{ fontSize:"9px", color:"#22c55e", fontWeight:700 }}> DETRAN-RS OK</div>
              </div>
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:"8px", padding:"8px", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"9px", color:"#6B7280" }}>Contratos</span>
                <span style={{ fontSize:"9px", color:"#2196f3", fontWeight:700 }}>2.847</span>
              </div>
            </div>
            <div style={{ fontSize:"10px", color:"#4B5563" }}>sigcr SIGCR</div>
          </div>
          <div style={{ display:"flex", gap:"4px" }}>
            {[1,2,3,4,5].map(s => <Star key={s} size={14} color="#2196f3" fill="#2196f3"/>)}
          </div>
          <div style={{ fontSize:"12px", color:"#6B7280", textAlign:"center" }}>Preview do app mobile</div>
        </div>
      </div>
    </div>
  );
}
