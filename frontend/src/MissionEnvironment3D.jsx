import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

const MODELS = {
  mars_base: '/models/mars_habitat.glb',
  lunar_base: '/models/lunar_base.glb',
  rover: '/models/surface_rover.glb',
};

function Prop({environment}) {
  const gltf=useGLTF(MODELS[environment]);
  return <group position={[0,-.8,0]} scale={environment==='rover'?[.95,.95,.95]:[.72,.72,.72]}>
    <primitive object={gltf.scene} />
  </group>;
}
export default function MissionEnvironment3D({environment}) {
  if(!MODELS[environment]) return null;
  return <div className="hgv-model-layer" aria-label="Illustrative interactive three-dimensional mission equipment">
    <Suspense fallback={null}>
      <Canvas camera={{position:[4.8,3.3,11],fov:44}} dpr={[1,1.6]} gl={{alpha:true,antialias:true}} onCreated={({gl})=>gl.setClearColor(0x000000,0)}>
        <ambientLight intensity={2.2}/>
        <hemisphereLight color="#e6efed" groundColor={environment==='lunar_base'?'#585f62':'#7b3422'} intensity={1.5}/>
        <directionalLight position={[-4,8,7]} intensity={2.9} color={environment==='lunar_base'?'#eaf5ff':'#ffd0a0'}/>
        <directionalLight position={[6,3,-5]} intensity={1.4} color="#7be0e1"/>
        <Prop environment={environment}/>
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI/3} maxPolarAngle={Math.PI/2.4} autoRotate={false} target={[0,-.2,0]}/>
      </Canvas>
    </Suspense>
    <span className="hgv-model-caption">3D DEMONSTRATION MODEL · DRAG TO ROTATE</span>
  </div>;
}
