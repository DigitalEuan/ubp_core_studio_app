
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { Scene3DData } from '../types';

// --- STATIC SPHERE COMPONENT ---
const StaticSphere = ({ data }: { data: NonNullable<Scene3DData['spheres']>[0] }) => {
  return (
    <mesh position={[data.x, data.y, data.z]}>
      <sphereGeometry args={[data.r, 32, 32]} />
      <meshStandardMaterial 
        color={data.color || '#ffffff'} 
        emissive={data.color || '#ffffff'} 
        emissiveIntensity={0.5} 
        roughness={0.2}
      />
      {data.label && (
        <Html position={[0, data.r + 0.5, 0]} center zIndexRange={[100, 0]}>
          <div className="text-white text-xs font-mono whitespace-nowrap pointer-events-none drop-shadow-md bg-black/50 px-1.5 py-0.5 rounded">
            {data.label}
          </div>
        </Html>
      )}
    </mesh>
  );
};

// --- DYNAMIC SPHERE COMPONENT ---
const DynamicSphere = ({ data }: { data: NonNullable<Scene3DData['spheres']>[0] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // Random initial phase for orbits/pulses so they don't all sync perfectly
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();

    // 1. ORBIT LOGIC (Circular motion around a center)
    if (data.orbit_r && data.orbit_speed) {
      const center = data.orbit_center || [0, 0, 0];
      meshRef.current.position.x = center[0] + Math.cos(time * data.orbit_speed + phase) * data.orbit_r;
      meshRef.current.position.z = center[2] + Math.sin(time * data.orbit_speed + phase) * data.orbit_r;
      // Y usually stays flat or bobs slightly
      meshRef.current.position.y = data.y + Math.sin(time * 0.5 + phase) * 0.2;
    } 
    // 2. VELOCITY LOGIC (Linear movement)
    else if (data.vx || data.vy || data.vz) {
      meshRef.current.position.x += data.vx || 0;
      meshRef.current.position.y += data.vy || 0;
      meshRef.current.position.z += data.vz || 0;
    }

    // 3. PULSE LOGIC (Visualizing NRCI/Stability)
    if (data.pulse_rate) {
      const scale = 1 + Math.sin(time * data.pulse_rate + phase) * 0.1;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <mesh ref={meshRef} position={[data.x, data.y, data.z]}>
      <sphereGeometry args={[data.r, 32, 32]} />
      <meshStandardMaterial 
        color={data.color || '#ffffff'} 
        emissive={data.color || '#ffffff'} 
        emissiveIntensity={0.5} 
        roughness={0.2}
      />
      {data.label && (
        <Html position={[0, data.r + 0.5, 0]} center zIndexRange={[100, 0]}>
          <div className="text-white text-xs font-mono whitespace-nowrap pointer-events-none drop-shadow-md bg-black/50 px-1.5 py-0.5 rounded">
            {data.label}
          </div>
        </Html>
      )}
    </mesh>
  );
};

// --- POINTS COMPONENT ---
const Points = ({ points }: { points: NonNullable<Scene3DData['points']> }) => {
  const positions = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    return arr;
  }, [points]);

  const colors = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      const c = new THREE.Color(p.color || '#ffffff');
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    });
    return arr;
  }, [points]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={points.length}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.2} vertexColors sizeAttenuation />
    </points>
  );
};

// --- EXPORT UTILITIES ---
const SceneExporter = ({ onContextReady }: { onContextReady: (ctx: any) => void }) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onContextReady({ gl, scene, camera });
  }, [gl, scene, camera, onContextReady]);
  return null;
};

// --- MAIN VIEWER ---
interface ThreeViewerProps {
  data: Scene3DData;
}

export const ThreeViewer: React.FC<ThreeViewerProps> = ({ data }) => {
  const [isAnimated, setIsAnimated] = useState(false);
  const [threeCtx, setThreeCtx] = useState<{ gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera } | null>(null);

  const handleSnapshot = () => {
    if (!threeCtx) return;
    const { gl, scene, camera } = threeCtx;
    const originalPixelRatio = gl.getPixelRatio();
    gl.setPixelRatio(originalPixelRatio * 2);
    gl.render(scene, camera);
    
    gl.domElement.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ubp_viz_snapshot_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      gl.setPixelRatio(originalPixelRatio);
      gl.render(scene, camera);
    }, 'image/png');
  };

  const handleExportGLTF = () => {
    if (!threeCtx) return;
    const { scene } = threeCtx;
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (gltf) => {
        const output = JSON.stringify(gltf, null, 2);
        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ubp_viz_${Date.now()}.gltf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error('An error happened during GLTF export:', error);
      },
      {}
    );
  };

  const handleExportOBJ = () => {
    if (!threeCtx) return;
    const { scene } = threeCtx;
    const exporter = new OBJExporter();
    const result = exporter.parse(scene);
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ubp_viz_${Date.now()}.obj`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!data) return <div className="text-gray-500 p-4">Initializing Visual Cortex...</div>;

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 relative group">
      {/* Toggle Button */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setIsAnimated(!isAnimated)}
          className={`px-3 py-1.5 rounded text-xs font-bold border shadow-lg transition-colors ${
            isAnimated 
              ? 'bg-cyan-600 border-cyan-400 text-white' 
              : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {isAnimated ? 'Animated Mode: ON' : 'Animated Mode: OFF'}
        </button>
      </div>

      {/* Export Buttons */}
      {threeCtx && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button 
              onClick={handleSnapshot}
              className="bg-gray-900/80 hover:bg-cyan-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center"
              title="Take HD Snapshot (PNG)"
          >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          {!isAnimated && (
            <>
              <button 
                  onClick={handleExportGLTF}
                  className="bg-gray-900/80 hover:bg-purple-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center text-xs font-bold"
                  title="Export as GLTF"
              >
                  GLTF
              </button>
              <button 
                  onClick={handleExportOBJ}
                  className="bg-gray-900/80 hover:bg-pink-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center text-xs font-bold"
                  title="Export as OBJ"
              >
                  OBJ
              </button>
            </>
          )}
        </div>
      )}

      <Canvas camera={{ position: [20, 20, 20], fov: 60 }} gl={{ preserveDrawingBuffer: true }}>
        <SceneExporter onContextReady={setThreeCtx} />
        <color attach="background" args={['#050505']} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[5, 10, 7]} intensity={0.8} />
        
        <OrbitControls makeDefault enableDamping />
        <gridHelper args={[50, 50, 0x222222, 0x111111]} />
        <axesHelper args={[2]} />

        {/* Render Points */}
        {data.points && data.points.length > 0 && (
          <Points points={data.points} />
        )}

        {/* Render Spheres */}
        {data.spheres && data.spheres.map((sphere, i) => (
          isAnimated ? <DynamicSphere key={i} data={sphere} /> : <StaticSphere key={i} data={sphere} />
        ))}

        {/* Render Lines */}
        {data.lines && data.lines.map((line, i) => (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([...line.start, ...line.end])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={line.color || '#ffffff'} linewidth={1} transparent opacity={0.6} />
          </line>
        ))}
      </Canvas>
    </div>
  );
};
