import React from "react";

export const AiLoader = ({ size = 160, text = "Carregando" }) => {
  const letters = text.split("");
  return (
    <div style={{ position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(to bottom, #0f172a, #080B10, #000)" }}>
      <div style={{ position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:size,height:size,userSelect:"none" }}>
        {letters.map((letter, i) => (
          <span key={i} style={{ display:"inline-block",color:"#2196f3",opacity:0.5,animation:"loaderLetter 3s infinite",animationDelay:`${i*0.1}s`,fontSize:"16px",fontWeight:700,letterSpacing:"0.04em" }}>{letter}</span>
        ))}
        <div style={{ position:"absolute",inset:0,borderRadius:"50%",animation:"loaderCircle 5s linear infinite" }} />
      </div>
      <style>{`
        @keyframes loaderCircle {
          0%   { transform:rotate(90deg);  box-shadow:0 6px 12px 0 #2196f3 inset,0 12px 18px 0 #1e88e5 inset,0 36px 36px 0 #1976d2 inset,0 0 3px 1.2px rgba(33,150,243,0.3); }
          50%  { transform:rotate(270deg); box-shadow:0 6px 12px 0 #64b5f6 inset,0 12px 6px 0 #2196f3 inset,0 24px 36px 0 #1e88e5 inset,0 0 3px 1.2px rgba(33,150,243,0.3); }
          100% { transform:rotate(450deg); box-shadow:0 6px 12px 0 #90caf9 inset,0 12px 18px 0 #2196f3 inset,0 36px 36px 0 #1976d2 inset,0 0 3px 1.2px rgba(33,150,243,0.3); }
        }
        @keyframes loaderLetter {
          0%,100% { opacity:0.4; transform:translateY(0); }
          20%     { opacity:1; transform:scale(1.2); color:#64b5f6; }
          40%     { opacity:0.7; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
};
export default AiLoader;
