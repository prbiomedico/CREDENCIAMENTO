import React, { useState } from "react";

// Lazy import para evitar SSR issues com leaflet
let MapContainer, TileLayer, Marker, Popup, Circle, L;
try {
  const RL = require("react-leaflet");
  MapContainer = RL.MapContainer;
  TileLayer = RL.TileLayer;
  Marker = RL.Marker;
  Popup = RL.Popup;
  Circle = RL.Circle;
  L = require("leaflet");
  require("leaflet/dist/leaflet.css");
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
} catch(e) { console.warn("Leaflet no carregado:", e.message); }

const createIcon = (color="blue") => L && new L.Icon({
  iconUrl:`https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize:[22,36], iconAnchor:[11,36], popupAnchor:[1,-30], shadowSize:[36,36]
});

const DETRANS = [
  { id:1, estado:"DF", nome:"DETRAN-DF", position:[-15.7942,-47.8822], credenciadas:3, status:"ativo",    color:"orange" },
  { id:2, estado:"SP", nome:"DETRAN-SP", position:[-23.5505,-46.6333], credenciadas:12,status:"ativo",    color:"green" },
  { id:3, estado:"RJ", nome:"DETRAN-RJ", position:[-22.9068,-43.1729], credenciadas:8, status:"ativo",    color:"green" },
  { id:4, estado:"MG", nome:"DETRAN-MG", position:[-19.9167,-43.9345], credenciadas:6, status:"ativo",    color:"green" },
  { id:5, estado:"CE", nome:"DETRAN-CE", position:[-3.7172,-38.5433],  credenciadas:1, status:"pendente", color:"red" },
  { id:6, estado:"RS", nome:"DETRAN-RS", position:[-30.0346,-51.2177], credenciadas:4, status:"ativo",    color:"green" },
  { id:7, estado:"BA", nome:"DETRAN-BA", position:[-12.9714,-38.5014], credenciadas:5, status:"ativo",    color:"green" },
  { id:8, estado:"PR", nome:"DETRAN-PR", position:[-25.4278,-49.2731], credenciadas:7, status:"ativo",    color:"green" },
  { id:9, estado:"SC", nome:"DETRAN-SC", position:[-27.5969,-48.5495], credenciadas:3, status:"ativo",    color:"green" },
  { id:10,estado:"GO", nome:"DETRAN-GO", position:[-16.6864,-49.2643], credenciadas:2, status:"ativo",    color:"green" },
];

export function MapaNacional({ onDetranClick, height = "100%" }) {
  const [selected, setSelected] = useState(null);
  if (!MapContainer) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"rgba(255,255,255,0.4)",fontSize:"14px" }}>Mapa no disponvel</div>;
  return (
    <div style={{ height, width:"100%", borderRadius:"12px", overflow:"hidden" }}>
      <MapContainer center={[-15.7942,-47.8822]} zoom={4} style={{ height:"100%", width:"100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {DETRANS.map(d => (
          <React.Fragment key={d.id}>
            <Circle center={d.position} radius={70000} pathOptions={{ color:d.status==="pendente"?"#f97316":"#22c55e", fillOpacity:0.1, weight:1.5 }} />
            <Marker position={d.position} icon={createIcon(d.color)} eventHandlers={{ click:()=>{ setSelected(d); onDetranClick&&onDetranClick(d); } }}>
              <Popup>
                <div style={{ fontFamily:"system-ui",minWidth:"150px" }}>
                  <strong style={{ color:"#1e40af",fontSize:"14px" }}>{d.nome}</strong><br/>
                  <span style={{ fontSize:"12px",color:"#555" }}>{d.credenciadas} registradora(s) credenciada(s)</span>
                  {d.status==="pendente"&&<div style={{ marginTop:"6px",padding:"3px 8px",background:"#fff7ed",borderRadius:"4px",fontSize:"11px",color:"#ea580c",border:"1px solid #fed7aa" }}> POC pendente</div>}
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
export default MapaNacional;
