import React, { useState, useEffect } from "react";
import axios from "axios";
import DashboardLayout from "../components/DashboardLayout";
import { MapaNacional } from "../components/ui/interactive-map";
import { useAuth } from "../contexts/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_LABELS = {
  credenciada: "Credenciada",
  edital_aberto: "Edital aberto",
  em_processo: "Em processo",
  sem_edital: "Sem atividade",
};

export default function MapaNacionalPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);
  const [mapaData, setMapaData] = useState([]);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API}/mapa-nacional`, { withCredentials: true })
      .then((res) => setMapaData(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMapaData([]));
  }, [user]);

  const totalCredenciadas = mapaData.filter((d) => d.status_mapa === "credenciada").length;
  const totalEmAndamento = mapaData.filter((d) => d.status_mapa === "edital_aberto" || d.status_mapa === "em_processo").length;

  return (
    <DashboardLayout>
    <div style={{ padding:"24px 32px", height:"100%", background:"#0A0D12", fontFamily:"system-ui, sans-serif", color:"#E8EAF0" }}>
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
            <div style={{ background:"rgba(0,230,118,0.1)", border:"1px solid rgba(0,230,118,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"#00e676" }}>{totalCredenciadas}</div>
              <div style={{ fontSize:"10px", color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em" }}>Credenciados</div>
            </div>
            <div style={{ background:"rgba(255,193,7,0.1)", border:"1px solid rgba(255,193,7,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"#ffc107" }}>{totalEmAndamento}</div>
              <div style={{ fontSize:"10px", color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.08em" }}>Em andamento</div>
            </div>
          </div>
        </div>
      </div>

      {/* Layout mapa + painel */}
      <div style={{ display:"flex", gap:"20px", height:"calc(100vh - 220px)" }}>
        {/* Mapa */}
        <div style={{ flex:1, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", overflow:"hidden" }}>
          <MapaNacional data={mapaData} onDetranClick={setSelected} height="100%" />
        </div>

        {/* Painel lateral */}
        <div style={{ width:"280px", display:"flex", flexDirection:"column", gap:"12px" }}>
          {/* Info selecionado */}
          {selected ? (
            <div style={{ background:"rgba(33,150,243,0.08)", border:"1.5px solid rgba(33,150,243,0.3)", borderRadius:"14px", padding:"20px" }}>
              <div style={{ fontWeight:800, fontSize:"16px", color:"#F1F3F8", marginBottom:"4px" }}>DETRAN-{selected.sigla}</div>
              <div style={{ fontSize:"12px", color:"#6B7280", marginBottom:"16px" }}>Estado: {selected.nome}</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Registradoras credenciadas</span>
                <span style={{ fontSize:"14px", fontWeight:700, color:selected.cfg?.hex || "#00e676" }}>{selected.aprovadas}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Editais ativos</span>
                <span style={{ fontSize:"14px", fontWeight:700, color:"#F1F3F8" }}>{selected.editais_ativos}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"12px", color:"#9CA3AF" }}>Status</span>
                <span style={{ fontSize:"11px", fontWeight:700, padding:"2px 8px", borderRadius:"20px", background:`${selected.cfg?.hex || "#6b7280"}26`, color:selected.cfg?.hex || "#6b7280", textTransform:"uppercase" }}>
                  {STATUS_LABELS[selected.status_mapa] || selected.status_mapa}
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
              { color:"#00e676", label:"Credenciada" },
              { color:"#3b82f6", label:"Edital aberto" },
              { color:"#ffc107", label:"Em processo" },
              { color:"#6b7280", label:"Sem atividade" },
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
    </DashboardLayout>
  );
}
