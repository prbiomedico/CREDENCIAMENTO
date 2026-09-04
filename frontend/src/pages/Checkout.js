
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { QrCode, FileText, ArrowLeft, Copy, Check, Loader } from "lucide-react";

const PLANOS_INFO = {
  starter:    { nome: "Starter",    preco: { mensal: 497,  anual: Math.round(497*0.85*12)  } },
  pro:        { nome: "Pro",        preco: { mensal: 1497, anual: Math.round(1497*0.85*12) } },
  enterprise: { nome: "Enterprise", preco: { mensal: 3997, anual: Math.round(3997*0.85*12) } },
};

// PIX fake para demonstrao visual
const PIX_COPIA_COLA = "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540510.005802BR5925sigcr TECNOLOGIA LTDA6009SAO PAULO62090505TX1236304A1B2";

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planoId  = params.get("plano") || "pro";
  const periodo  = params.get("periodo") || "mensal";
  const plano    = PLANOS_INFO[planoId] || PLANOS_INFO.pro;
  const valor    = plano.preco[periodo];

  const [metodo, setMetodo] = useState("pix");
  const [step, setStep]     = useState("form"); // form | processando | pix | boleto
  const [copiado, setCopiado] = useState(false);
  const [form, setForm]     = useState({ razao: "", cnpj: "", email: "", telefone: "" });

  const handleCopiar = () => {
    navigator.clipboard.writeText(PIX_COPIA_COLA);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handlePagar = () => {
    if (!form.razao || !form.cnpj || !form.email) return;
    setStep("processando");
    setTimeout(() => setStep(metodo), 2000);
  };

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: "10px",
    color: "hsl(var(--foreground))", padding: "11px 14px", fontSize: "14px",
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", fontFamily: "system-ui,sans-serif", color: "hsl(var(--foreground))", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Barra de navegao  Home */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:"48px", background:"rgba(8,11,16,0.95)", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", padding:"0 20px", gap:"16px", zIndex:100, backdropFilter:"blur(10px)" }}>
        <a href="/dashboard" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", color:"rgba(255,255,255,0.7)", fontSize:"13px", fontWeight:600 }}>
          <span style={{ fontSize:"16px" }}></span> Incio
        </a>
        <span style={{ color:"rgba(255,255,255,0.15)" }}>|</span>
        <span style={{ fontSize:"13px", color:"rgba(33,150,243,0.8)", fontWeight:600 }}>sigcr SIGCR</span>
      </div>
      <div style={{ height:"48px" }} />

      <div style={{ width: "100%", maxWidth: "900px" }}>

        {/* Voltar */}
        <button onClick={() => navigate("/planos")} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: "13px", marginBottom: "24px", padding: 0 }}>
          <ArrowLeft size={14} /> Voltar aos planos
        </button>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>

          {/* COLUNA ESQUERDA  Formulrio / Status */}
          <div style={{ flex: "1 1 340px", background: "rgba(255,255,255,0.02)", border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: "20px", padding: "28px" }}>

            {step === "form" && (
              <>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>Dados da empresa</h2>
                <p style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))", marginBottom: "24px" }}>Necessrio para emisso da nota fiscal</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {[
                    { label: "Razo Social *", key: "razao",    ph: "Razo Social da empresa" },
                    { label: "CNPJ *",         key: "cnpj",     ph: "00.000.000/0001-00" },
                    { label: "E-mail *",        key: "email",    ph: "E-mail corporativo" },
                    { label: "Telefone",        key: "telefone", ph: "Telefone comercial" },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "6px" }}>{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.ph} style={inputStyle} />
                    </div>
                  ))}
                </div>

                {/* Mtodo de pagamento */}
                <div style={{ marginTop: "24px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "12px" }}>Forma de pagamento</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {[
                      { id: "pix",    label: "Pix",    sub: "Instante",    icon: <QrCode size={18} /> },
                      { id: "boleto", label: "Boleto", sub: "12 dias teis", icon: <FileText size={18} /> },
                    ].map(m => (
                      <div key={m.id} onClick={() => setMetodo(m.id)}
                        style={{
                          flex: 1, border: metodo === m.id ? "2px solid hsl(var(--sigcr-accent))" : "1.5px solid rgba(255,255,255,0.08)",
                          borderRadius: "12px", padding: "12px", cursor: "pointer",
                          background: metodo === m.id ? "rgba(33,150,243,0.08)" : "transparent",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                          transition: "all 0.2s",
                        }}>
                        <div style={{ color: metodo === m.id ? "hsl(var(--sigcr-accent))" : "hsl(var(--muted-foreground))" }}>{m.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: "13px", color: metodo === m.id ? "hsl(var(--sigcr-accent))" : "hsl(var(--muted-foreground))" }}>{m.label}</div>
                        <div style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>{m.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={handlePagar}
                  style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "11px", border: "none", cursor: "pointer", background: "linear-gradient(135deg,hsl(var(--sigcr-accent)),hsl(var(--sigcr-accent)))", color: "#fff", fontSize: "15px", fontWeight: 800, boxShadow: "0 4px 20px rgba(33,150,243,0.3)" }}>
                  Gerar {metodo === "pix" ? "QR Code Pix" : "Boleto"}
                </button>

                <p style={{ textAlign: "center", fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "12px" }}>
                   Pagamento processado por Pagar.me  PCI DSS compliant
                </p>
              </>
            )}

            {step === "processando" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "320px", gap: "16px" }}>
                <div style={{ width: "52px", height: "52px", border: "3px solid rgba(33,150,243,0.2)", borderTopColor: "hsl(var(--sigcr-accent))", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#fff" }}>Gerando cobrana...</div>
                <div style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>Conectando ao Pagar.me</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}

            {step === "pix" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", color: "hsl(var(--sigcr-success))", fontWeight: 700, marginBottom: "4px" }}> Pix gerado com sucesso</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>Escaneie ou copie o cdigo</h2>
                </div>
                {/* QR Code fake */}
                <div style={{ width: "180px", height: "180px", background: "#fff", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" }}>
                  <QrCode size={140} color="hsl(var(--background))" strokeWidth={1} />
                </div>
                <div style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "12px", position: "relative" }}>
                  <div style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase" }}>Pix Copia e Cola</div>
                  <div style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))", wordBreak: "break-all", paddingRight: "32px" }}>{PIX_COPIA_COLA.slice(0, 60)}...</div>
                  <button onClick={handleCopiar} style={{ position: "absolute", top: "12px", right: "12px", background: "none", border: "none", cursor: "pointer", color: copiado ? "hsl(var(--sigcr-success))" : "hsl(var(--sigcr-accent))" }}>
                    {copiado ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
                   Expira em <strong style={{ color: "hsl(var(--sigcr-warning))" }}>30 minutos</strong>  Valor: <strong style={{ color: "#fff" }}>R$ {valor.toLocaleString("pt-BR")}</strong>
                </div>
                <button onClick={() => navigate("/pagamento/aguardando")} style={{ width: "100%", padding: "13px", borderRadius: "11px", border: "1.5px solid rgba(33,150,243,0.3)", background: "transparent", color: "hsl(var(--sigcr-accent))", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                  J paguei  verificar
                </button>
              </div>
            )}

            {step === "boleto" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", color: "hsl(var(--sigcr-success))", fontWeight: 700, marginBottom: "4px" }}> Boleto gerado</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>Boleto disponvel</h2>
                </div>
                <div style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Valor</span>
                    <span style={{ fontWeight: 700, color: "#fff" }}>R$ {valor.toLocaleString("pt-BR")}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Vencimento</span>
                    <span style={{ fontWeight: 700, color: "#fff" }}>3 dias teis</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Beneficirio</span>
                    <span style={{ fontWeight: 700, color: "#fff" }}>sigcr TECNOLOGIA</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                  <button style={{ flex: 1, padding: "13px", borderRadius: "11px", border: "none", cursor: "pointer", background: "linear-gradient(135deg,hsl(var(--sigcr-accent)),hsl(var(--sigcr-accent)))", color: "#fff", fontSize: "14px", fontWeight: 700 }}>
                     Baixar boleto
                  </button>
                  <button style={{ flex: 1, padding: "13px", borderRadius: "11px", border: "1.5px solid rgba(255,255,255,0.1)", background: "transparent", color: "hsl(var(--muted-foreground))", fontSize: "14px", cursor: "pointer" }}>
                     Enviar por email
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA  Resumo */}
          <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "22px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>Resumo do pedido</div>
              <div style={{ fontWeight: 800, fontSize: "16px", color: "hsl(var(--sigcr-accent))", marginBottom: "4px" }}>Plano {plano.nome}</div>
              <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "20px" }}>Cobrana {periodo === "mensal" ? "mensal" : "anual"}</div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>Total</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "#fff" }}>R$ {valor.toLocaleString("pt-BR")}</div>
                  <div style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>/{periodo === "mensal" ? "ms" : "ano"}</div>
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(0,230,118,0.04)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: "14px", padding: "16px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "hsl(var(--sigcr-success))", marginBottom: "8px" }}> O que voc recebe hoje</div>
              {["Acesso imediato ao painel", "Esteiras de credenciamento", "API REST completa", "Suporte tcnico ativo"].map((r, i) => (
                <div key={i} style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}> {r}</div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
                Dvidas? <a href="mailto:comercial@sigcr.com.br" style={{ color: "hsl(var(--sigcr-accent))", textDecoration: "none" }}>comercial@sigcr.com.br</a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
