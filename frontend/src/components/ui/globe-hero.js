import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";

const Globe = ({ rotationSpeed = 0.003, radius = 1.2 }) => {
  const ref = useRef(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += rotationSpeed;
      ref.current.rotation.x += rotationSpeed * 0.25;
    }
  });
  return (
    <group ref={ref}>
      <mesh><sphereGeometry args={[radius, 48, 48]} /><meshBasicMaterial color="#f97316" transparent opacity={0.07} wireframe /></mesh>
      <mesh><sphereGeometry args={[radius*0.97, 24, 24]} /><meshBasicMaterial color="#fb923c" transparent opacity={0.03} wireframe /></mesh>
    </group>
  );
};

export function GlobeHero({ rotationSpeed = 0.003, children, style = {} }) {
  return (
    <div style={{ position:"relative", width:"100%", overflow:"hidden", ...style }}>
      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%" }}>
        {children}
      </div>
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none" }}>
        <Canvas>
          <PerspectiveCamera makeDefault position={[0,0,3.5]} fov={60} />
          <ambientLight intensity={0.2} />
          <pointLight position={[10,10,10]} intensity={0.6} color="#f97316" />
          <Globe rotationSpeed={rotationSpeed} />
        </Canvas>
      </div>
    </div>
  );
}
export default GlobeHero;
