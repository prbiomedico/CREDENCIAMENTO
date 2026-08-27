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

// Coordenadas das capitais — só georreferenciamento pra plotar o marcador,
// não é dado de negócio (esse vem sempre do GET /mapa-nacional via prop `data`).
const UF_COORDS = {
  AC:[-9.9750,-67.8243], AL:[-9.6498,-35.7089], AP:[0.0389,-51.0664], AM:[-3.1190,-60.0217],
  BA:[-12.9714,-38.5014], CE:[-3.7172,-38.5433], DF:[-15.7942,-47.8822], ES:[-20.3155,-40.3128],
  GO:[-16.6864,-49.2643], MA:[-2.5307,-44.3068], MT:[-15.6014,-56.0979], MS:[-20.4697,-54.6201],
  MG:[-19.9167,-43.9345], PA:[-1.4558,-48.5044], PB:[-7.1195,-34.8450], PR:[-25.4284,-49.2733],
  PE:[-8.0476,-34.8770], PI:[-5.0892,-42.8019], RJ:[-22.9068,-43.1729], RN:[-5.7945,-35.2110],
  RS:[-30.0346,-51.2177], RO:[-8.7619,-63.9039], RR:[2.8235,-60.6758], SC:[-27.5969,-48.5495],
  SP:[-23.5505,-46.6333], SE:[-10.9472,-37.0731], TO:[-10.1689,-48.3317],
};

const STATUS_MAPA_CFG = {
  // Cores Berry: sucesso/aviso seguem o mesmo mapeamento do tailwind.config.js
  // (green->sucesso, orange->aviso aqui — não primária — pra não colidir com
  // o azul de "edital_aberto", que fica como estava). "gold" é o nome mais
  // próximo de âmbar disponível no pacote de ícones leaflet-color-markers.
  credenciada:   { color:"green",  hex:"#00e676", label:"Credenciada" },
  edital_aberto: { color:"blue",   hex:"#3b82f6", label:"Edital aberto" },
  em_processo:   { color:"gold",   hex:"#ffc107", label:"Em processo" },
  sem_edital:    { color:"grey",   hex:"#6b7280", label:"Sem atividade" },
};

export function MapaNacional({ data = [], onDetranClick, height = "100%" }) {
  const [selected, setSelected] = useState(null);
  if (!MapContainer) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"rgba(255,255,255,0.4)",fontSize:"14px" }}>Mapa no disponvel</div>;

  const pontos = data
    .filter(d => UF_COORDS[d.sigla])
    .map(d => ({ ...d, position: UF_COORDS[d.sigla], cfg: STATUS_MAPA_CFG[d.status_mapa] || STATUS_MAPA_CFG.sem_edital }));

  return (
    <div style={{ height, width:"100%", borderRadius:"12px", overflow:"hidden" }}>
      <MapContainer center={[-15.7942,-47.8822]} zoom={4} style={{ height:"100%", width:"100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pontos.map(d => (
          <React.Fragment key={d.sigla}>
            <Circle center={d.position} radius={70000} pathOptions={{ color:d.cfg.hex, fillOpacity:0.1, weight:1.5 }} />
            <Marker position={d.position} icon={createIcon(d.cfg.color)} eventHandlers={{ click:()=>{ setSelected(d); onDetranClick&&onDetranClick(d); } }}>
              <Popup>
                <div style={{ fontFamily:"system-ui",minWidth:"150px" }}>
                  <strong style={{ color:"#1e40af",fontSize:"14px" }}>DETRAN-{d.sigla}</strong><br/>
                  <span style={{ fontSize:"12px",color:"#555" }}>{d.aprovadas} registradora(s) credenciada(s)</span>
                  <div style={{ marginTop:"6px",padding:"3px 8px",background:"#f3f4f6",borderRadius:"4px",fontSize:"11px",color:d.cfg.hex,border:`1px solid ${d.cfg.hex}` }}>{d.cfg.label}</div>
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
