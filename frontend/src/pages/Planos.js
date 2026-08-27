
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Zap, Shield, Star } from "lucide-react";

const PLANOS = [
  {
    id: "starter",
    nome: "Starter",
    preco: 497,
    periodo: "ms",
    descricao: "Ideal para iniciar o credenciamento",
    destaque: false,
    cor: "#6B7280",
    icone: <Zap size={22} />,
    recursos: [
      "1 DETRAN credenciado",
      "At 500 contratos/ms",
      "Painel de compliance",
      "Suporte por e-mail",
      "API bsica",
    ],
  },
  {
    id: "pro",
    nome: "Pro",
    preco: 1497,
    periodo: "ms",
    descricao: "Para registradoras em expanso",
    destaque: true,
    cor: "#2196f3",
    icone: <Star size={22} />,
    recursos: [
      "At 5 DETRANs",
      "At 5.000 contratos/ms",
      "Painel avanado + IA",
      "Suporte prioritrio",
      "API completa + webhooks",
      "Relatrios automticos",
    ],
  },
  {
    id: "enterprise",
    nome: "Enterprise",
    preco: 3997,
    periodo: "ms",
    descricao: "Operao nacional completa",
    destaque: false,
    cor: "#8B5CF6",
    icone: <Shield size={22} />,
    recursos: [
      "DETRANs ilimitados",
      "Contratos ilimitados",
      "SLA 99.9% garantido",
      "Gerente de conta dedicado",
      "White-label disponvel",
      "Integrao CONTRAN 432",
      "Onboarding completo",
    ],
  },
];

export default function Planos() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState("mensal");

  const desconto = periodo === "anual" ? 0.85 : 1;

  return (
    <div style={{ minHeight: "100vh", background: "#080B10", fontFamily: "system-ui, sans-serif", color: "#E8EAF0", padding: "40px 24px" }}>
      {/* Barra de navegao  Home */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:"48px", background:"rgba(8,11,16,0.95)", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", padding:"0 20px", gap:"16px", zIndex:100, backdropFilter:"blur(10px)" }}>
        <a href="/dashboard" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", color:"rgba(255,255,255,0.7)", fontSize:"13px", fontWeight:600 }}>
          <span style={{ fontSize:"16px" }}></span> Incio
        </a>
        <span style={{ color:"rgba(255,255,255,0.15)" }}>|</span>
        <span style={{ fontSize:"13px", color:"rgba(33,150,243,0.8)", fontWeight:600 }}>sigcr SIGCR</span>
      </div>
      <div style={{ height:"48px" }} />

      {/* Header */}
      <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto 48px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(33,150,243,0.1)", border: "1px solid rgba(33,150,243,0.3)", borderRadius: "20px", padding: "6px 16px", marginBottom: "20px" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#2196f3", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2196f3", textTransform: "uppercase", letterSpacing: "0.1em" }}>Escolha seu plano</span>
        </div>
        <h1 style={{ fontSize: "38px", fontWeight: 800, color: "#fff", margin: "0 0 12px", lineHeight: 1.15 }}>
          Comece a credenciar<br />
          <span style={{ color: "#2196f3" }}>em minutos</span>
        </h1>
        <p style={{ fontSize: "15px", color: "#6B7280", margin: "0 0 28px" }}>
          Pague com Pix ou Boleto. Sem carto de crdito obrigatrio.
        </p>
        {/* Toggle mensal/anual */}
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "4px" }}>
          {["mensal", "anual"].map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              style={{ padding: "8px 22px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, transition: "all 0.2s",
                background: periodo === p ? "#2196f3" : "transparent",
                color: periodo === p ? "#fff" : "#6B7280",
              }}>
              {p === "mensal" ? "Mensal" : "Anual 15%"}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", gap: "20px", maxWidth: "1000px", margin: "0 auto", flexWrap: "wrap", justifyContent: "center" }}>
        {PLANOS.map(plano => (
          <div key={plano.id} style={{
            flex: "1 1 280px", maxWidth: "320px",
            background: plano.destaque ? "rgba(33,150,243,0.06)" : "rgba(255,255,255,0.02)",
            border: plano.destaque ? "2px solid rgba(33,150,243,0.5)" : "1.5px solid rgba(255,255,255,0.07)",
            borderRadius: "20px", padding: "28px 24px",
            position: "relative",
            boxShadow: plano.destaque ? "0 0 40px rgba(33,150,243,0.12)" : "none",
          }}>
            {plano.destaque && (
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#2196f3,#1e88e5)", color: "#fff", fontSize: "11px", fontWeight: 800, padding: "4px 16px", borderRadius: "20px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                 Mais popular
              </div>
            )}

            {/* cone + nome */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: `${plano.cor}18`, display: "flex", alignItems: "center", justifyContent: "center", color: plano.cor }}>
                {plano.icone}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "16px", color: "#fff" }}>{plano.nome}</div>
                <div style={{ fontSize: "12px", color: "#6B7280" }}>{plano.descricao}</div>
              </div>
            </div>

            {/* Preo */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>R$</span>
                <span style={{ fontSize: "40px", fontWeight: 900, color: plano.destaque ? "#2196f3" : "#fff", lineHeight: 1 }}>
                  {Math.round(plano.preco * desconto).toLocaleString("pt-BR")}
                </span>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>/{plano.periodo}</span>
              </div>
              {periodo === "anual" && (
                <div style={{ fontSize: "12px", color: "#22c55e", marginTop: "4px" }}>
                  Economize R$ {Math.round(plano.preco * 0.15 * 12).toLocaleString("pt-BR")}/ano
                </div>
              )}
            </div>

            {/* Recursos */}
            <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {plano.recursos.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: `${plano.cor}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={11} color={plano.cor} strokeWidth={3} />
                  </div>
                  <span style={{ fontSize: "13px", color: "#9CA3AF" }}>{r}</span>
                </div>
              ))}
            </div>

            {/* Boto */}
            <button
              onClick={() => navigate(`/checkout?plano=${plano.id}&periodo=${periodo}`)}
              style={{
                width: "100%", padding: "13px",
                borderRadius: "11px", border: "none", cursor: "pointer",
                background: plano.destaque ? "linear-gradient(135deg,#2196f3,#1e88e5)" : "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: "14px", fontWeight: 700,
                transition: "all 0.2s",
                boxShadow: plano.destaque ? "0 4px 20px rgba(33,150,243,0.3)" : "none",
              }}>
              {plano.id === "enterprise" ? "Falar com Vendas" : "Assinar agora"}
            </button>
          </div>
        ))}
      </div>

      {/* Rodap */}
      <div style={{ textAlign: "center", marginTop: "40px", fontSize: "13px", color: "#4B5563" }}>
         Pagamento seguro via Pagar.me  Pix liberado em instantes  Cancele quando quiser
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
