import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { MapaNacional } from "../components/ui/interactive-map";
import { useAuth } from "../contexts/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// Header mínimo pra visitante público (sem sessão) — a página é semi-pública
// (rota /mapa-nacional, sem RotaProtegida), então não faz sentido puxar o
// DashboardLayout inteiro (menu por perfil, seletor de simulação etc.) pra
// quem não tem conta. Só um jeito de sair da tela: logo clicável pra home.
function CabecalhoPublico() {
  return (
    <div style={{ padding: "16px 32px 0" }}>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <div style={{ width: "32px", height: "32px", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Shield size={18} color="#f97316" />
        </div>
        <span style={{ fontWeight: 800, fontSize: "14px", color: "#F1F3F8" }}>
          sigcr <span style={{ color: "#f97316" }}>SIGCR</span>
        </span>
      </Link>
    </div>
  );
}

export default function MapaNacionalPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);

  const conteudo = (
    <div style={{ padding:"24px 32px", height:"100%", minHeight:"100vh", background:"#0A0D12", fontFamily:"system-ui, sans-serif", color:"#E8EAF0" }}>
      {/* Header */}
      <div style={{ marginBottom:"24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h1 style={{ fontSize:"24px", fontWeight:800, color:"#F1F3F8", margin:0, marginBottom:"6px" }}>
               Mapa Nacional
            </h1>
            <p style={{ fontSize:"13px", color:"#6B7280", margin:0 }}>
              Cobertura SIGCR  Registradoras credenciadas por DETRAN
            </p>
          </div>
          <div style={{ display:"flex", gap:"12px" }}>
            <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"#22c55e" }}>9</div>
              <div style={{ fontSize:"10px", color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em" }}>Ativos</div>
            </div>
            <div style={{ background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"#f97316" }}>1</div>
              <div style={{ fontSize:"10px", color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em" }}>Pendente</div>
            </div>
          </div>
        </div>
      </div>

      {/* Layout mapa + painel */}
      <div style={{ display:"flex", gap:"20px", height:"calc(100vh - 160px)" }}>
        {/* Mapa */}
        <div style={{ flex:1, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", overflow:"hidden" }}>
          <MapaNacional onDetranClick={setSelected} height="100%" />
        </div>

        {/* Painel lateral */}
        <div style={{ width:"280px", display:"flex", flexDirection:"column", gap:"12px" }}>
          {/* Info selecionado */}
          {selected ? (
            <div style={{ background:"rgba(249,115,22,0.08)", border:"1.5px solid rgba(249,115,22,0.3)", borderRadius:"14px", padding:"20px" }}>
              <div style={{ fontWeight:800, fontSize:"16px", color:"#F1F3F8", marginBottom:"4px" }}>{selected.nome}</div>
              <div style={{ fontSize:"12px", color:"#6B7280", marginBottom:"16px" }}>Estado: {selected.estado}</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Registradoras</span>
                <span style={{ fontSize:"14px", fontWeight:700, color:selected.status==="pendente"?"#f97316":"#22c55e" }}>{selected.credenciadas}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Status</span>
                <span style={{ fontSize:"11px", fontWeight:700, padding:"2px 8px", borderRadius:"20px", background:selected.status==="pendente"?"rgba(249,115,22,0.15)":"rgba(34,197,94,0.15)", color:selected.status==="pendente"?"#f97316":"#22c55e", textTransform:"uppercase" }}>
                  {selected.status === "pendente" ? " POC Pendente" : " Ativo"}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"20px", textAlign:"center", color:"#6B7280", fontSize:"13px" }}>
              Clique em um marcador<br/>para ver detalhes
            </div>
          )}

          {/* Legenda */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"16px" }}>
            <div style={{ fontSize:"11px", fontWeight:700, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"12px" }}>Legenda</div>
            {[
              { color:"#22c55e", label:"DETRAN ativo" },
              { color:"#f97316", label:"POC pendente" },
            ].map((l,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
                <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:l.color, boxShadow:`0 0 8px ${l.color}` }} />
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // /mapa (RotaProtegida, detran/detran_admin) sempre chega aqui com user
  // preenchido — recebe a navegação padrão do painel. /mapa-nacional é
  // pública (sem RotaProtegida): mesmo componente, mas sem sessão nenhuma
  // pra alimentar o DashboardLayout (menu por perfil não faz sentido pra
  // visitante) — só o cabeçalho mínimo com link de volta pra home.
  if (user) {
    return <DashboardLayout>{conteudo}</DashboardLayout>;
  }
  return (
    <>
      <CabecalhoPublico />
      {conteudo}
    </>
  );
}
