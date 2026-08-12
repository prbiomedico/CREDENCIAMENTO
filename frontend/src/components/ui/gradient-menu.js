import React, { useState } from "react";
import { Home, FileText, Map, Bell, Settings } from "lucide-react";

const items = [
  { title:"Painel",  icon:<Home size={18}/>,     gf:"#2196f3", gt:"#1e88e5", path:"/dashboard" },
  { title:"Docs",    icon:<FileText size={18}/>,  gf:"#56CCF2", gt:"#2F80ED", path:"/documentos" },
  { title:"Mapa",    icon:<Map size={18}/>,       gf:"#80FF72", gt:"#7EE8FA", path:"/mapa-nacional" },
  { title:"Alertas", icon:<Bell size={18}/>,      gf:"#ffa9c6", gt:"#f434e2", path:"/notificacoes" },
  { title:"Config",  icon:<Settings size={18}/>,  gf:"#FF9966", gt:"#FF5E62", path:"/configuracoes" },
];

export default function GradientMenu({ currentPath = "/dashboard", onNavigate }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display:"flex", gap:"10px", padding:"8px 0", flexWrap:"wrap" }}>
      {items.map(({ title, icon, gf, gt, path }, i) => {
        const active = currentPath === path || hovered === i;
        return (
          <div key={i}
            onClick={() => onNavigate && onNavigate(path)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position:"relative", height:"40px",
              width: active ? "110px" : "40px",
              borderRadius:"20px",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer",
              transition:"all 0.35s cubic-bezier(0.4,0,0.2,1)",
              background: active ? `linear-gradient(135deg,${gf},${gt})` : "rgba(255,255,255,0.06)",
              boxShadow: active ? `0 0 18px ${gf}55,0 4px 14px rgba(0,0,0,0.3)` : "0 2px 6px rgba(0,0,0,0.2)",
              border: `1px solid ${active?"transparent":"rgba(255,255,255,0.1)"}`,
              overflow:"hidden", userSelect:"none",
            }}
          >
            <span style={{ color:active?"#fff":"rgba(255,255,255,0.45)", position:"absolute", left:active?"12px":"50%", transform:active?"none":"translateX(-50%)", display:"flex", alignItems:"center", transition:"all 0.3s" }}>{icon}</span>
            <span style={{ position:"absolute", right:"10px", color:"#fff", fontSize:"10px", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", whiteSpace:"nowrap", opacity:active?1:0, transition:"opacity 0.25s" }}>{title}</span>
          </div>
        );
      })}
    </div>
  );
}
