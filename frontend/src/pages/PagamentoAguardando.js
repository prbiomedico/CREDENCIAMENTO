
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Clock, RefreshCw } from "lucide-react";

export default function PagamentoAguardando() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("aguardando"); // aguardando | confirmado
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSegundos(s => s + 1), 1000);
    // Simula confirmao em 8s para demo
    const confirm = setTimeout(() => setStatus("confirmado"), 8000);
    return () => { clearInterval(timer); clearTimeout(confirm); };
  }, []);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{ minHeight: "100vh", background: "#080B10", fontFamily: "system-ui,sans-serif", color: "#E8EAF0", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Barra de navegao  Home */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:"48px", background:"rgba(8,11,16,0.95)", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", padding:"0 20px", gap:"16px", zIndex:100, backdropFilter:"blur(10px)" }}>
        <a href="/dashboard" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", color:"rgba(255,255,255,0.7)", fontSize:"13px", fontWeight:600 }}>
          <span style={{ fontSize:"16px" }}></span> Incio
        </a>
        <span style={{ color:"rgba(255,255,255,0.15)" }}>|</span>
        <span style={{ fontSize:"13px", color:"rgba(249,115,22,0.8)", fontWeight:600 }}>sigcr SIGCR</span>
      </div>
      <div style={{ height:"48px" }} />

      <div style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>

        {status === "aguardando" ? (
          <>
            {/* Anel pulsante */}
            <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 28px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(249,115,22,0.1)", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
              <div style={{ position: "absolute", inset: "12px", borderRadius: "50%", background: "rgba(249,115,22,0.15)", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.3s" }} />
              <div style={{ position: "absolute", inset: "24px", borderRadius: "50%", background: "rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Clock size={32} color="#f97316" />
              </div>
            </div>

            <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "10px" }}>Aguardando pagamento</h2>
            <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "28px", lineHeight: 1.6 }}>
              Verificando automaticamente o pagamento via Pix.<br />
              Isso pode levar alguns segundos.
            </p>

            {/* Timer */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ fontSize: "38px", fontWeight: 900, color: "#f97316", fontVariantNumeric: "tabular-nums" }}>{fmt(segundos)}</div>
              <div style={{ fontSize: "12px", color: "#4B5563", marginTop: "4px" }}>aguardando confirmao</div>
            </div>

            {/* Barra de progresso pulsante */}
            <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", marginBottom: "24px", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg,#f97316,#fb923c)", borderRadius: "3px", animation: "progress 2s ease-in-out infinite" }} />
            </div>

            <button onClick={() => setStatus("aguardando")} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 auto", background: "none", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#9CA3AF", padding: "10px 20px", cursor: "pointer", fontSize: "13px" }}>
              <RefreshCw size={14} /> Verificar manualmente
            </button>
          </>
        ) : (
          <>
            {/* Confirmado */}
            <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px", animation: "scaleIn 0.5s ease" }}>
              <CheckCircle size={48} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: "26px", fontWeight: 800, color: "#fff", marginBottom: "10px" }}>Pagamento confirmado!</h2>
            <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "28px" }}>
              Sua assinatura est ativa. Bem-vindo ao sigcr SIGCR Pro!
            </p>
            <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "14px", padding: "20px", marginBottom: "24px", textAlign: "left" }}>
              {[
                ["Plano", "Pro  Mensal"],
                ["Valor pago", "R$ 1.497,00"],
                ["Prxima cobrana", "19/05/2026"],
                ["Status", " Ativo"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "13px", color: "#6B7280" }}>{k}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: k === "Status" ? "#22c55e" : "#fff" }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/dashboard")} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", fontSize: "15px", fontWeight: 800, boxShadow: "0 4px 20px rgba(249,115,22,0.3)" }}>
              Acessar o painel 
            </button>
          </>
        )}

        <style>{`
          @keyframes ping { 75%,100% { transform:scale(1.3); opacity:0 } }
          @keyframes progress { 0%{width:0%} 50%{width:100%} 100%{width:0%} }
          @keyframes scaleIn { from{transform:scale(0)} to{transform:scale(1)} }
        `}</style>
      </div>
    </div>
  );
}
