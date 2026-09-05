import React, { useState, useEffect } from "react";
import axios from "axios";
import DashboardLayout from "../components/DashboardLayout";
import { MapaNacional } from "../components/ui/interactive-map";
import { useAuth } from "../contexts/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_LABELS = {
  credenciada: "Credenciamento ativo cadastrado",
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
    <div style={{ padding:"24px 32px", height:"100%", background:"hsl(var(--background))", fontFamily:"system-ui, sans-serif", color:"hsl(var(--foreground))" }}>
      {/* Header */}
      <div style={{ marginBottom:"24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h1 style={{ fontSize:"24px", fontWeight:800, color:"hsl(var(--foreground))", margin:0, marginBottom:"6px" }}>
               Mapa Nacional
            </h1>
            <p style={{ fontSize:"13px", color:"hsl(var(--muted-foreground))", margin:0 }}>
              Credenciamentos registrados no SIGCR por estado
            </p>
          </div>
          <div style={{ display:"flex", gap:"12px" }}>
            <div style={{ background:"rgba(0,230,118,0.1)", border:"1px solid rgba(0,230,118,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"hsl(var(--sigcr-success))" }}>{totalCredenciadas}</div>
              <div style={{ fontSize:"10px", color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:"0.08em" }}>Credenciados</div>
            </div>
            <div style={{ background:"rgba(255,193,7,0.1)", border:"1px solid rgba(255,193,7,0.3)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:"20px", fontWeight:800, color:"hsl(var(--sigcr-warning))" }}>{totalEmAndamento}</div>
              <div style={{ fontSize:"10px", color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:"0.08em" }}>Em andamento</div>
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
              <div style={{ fontWeight:800, fontSize:"16px", color:"hsl(var(--foreground))", marginBottom:"4px" }}>DETRAN-{selected.sigla}</div>
              <div style={{ fontSize:"12px", color:"hsl(var(--muted-foreground))", marginBottom:"16px" }}>Estado: {selected.nome}</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"hsl(var(--muted-foreground))" }}>Credenciamentos ativos cadastrados</span>
                <span style={{ fontSize:"14px", fontWeight:700, color:selected.cfg?.hex || "hsl(var(--sigcr-success))" }}>{selected.aprovadas}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"hsl(var(--muted-foreground))" }}>Editais ativos</span>
                <span style={{ fontSize:"14px", fontWeight:700, color:"hsl(var(--foreground))" }}>{selected.editais_ativos}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"12px", color:"hsl(var(--muted-foreground))" }}>Status</span>
                <span style={{ fontSize:"11px", fontWeight:700, padding:"2px 8px", borderRadius:"20px", background:`${selected.cfg?.hex || "hsl(var(--muted-foreground))"}26`, color:selected.cfg?.hex || "hsl(var(--muted-foreground))", textTransform:"uppercase" }}>
                  {STATUS_LABELS[selected.status_mapa] || selected.status_mapa}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"20px", textAlign:"center", color:"hsl(var(--muted-foreground))", fontSize:"13px" }}>
              Clique em um marcador<br/>para ver detalhes
            </div>
          )}

          {/* Legenda */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"16px" }}>
            <div style={{ fontSize:"11px", fontWeight:700, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"12px" }}>Legenda</div>
            {[
              { color:"hsl(var(--sigcr-success))", label:"Credenciada" },
              { color:"hsl(var(--sigcr-accent))", label:"Edital aberto" },
              { color:"hsl(var(--sigcr-warning))", label:"Em processo" },
              { color:"hsl(var(--muted-foreground))", label:"Sem atividade" },
            ].map((l,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
                <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:l.color, boxShadow:`0 0 8px ${l.color}` }} />
                <span style={{ fontSize:"12px", color:"hsl(var(--muted-foreground))" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
