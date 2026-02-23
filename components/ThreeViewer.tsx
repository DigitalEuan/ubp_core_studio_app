
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { Scene3DData } from '../types';

interface ThreeViewerProps {
  data: Scene3DData;
}

export const ThreeViewer: React.FC<ThreeViewerProps> = ({ data }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Setup Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111111);
    
    // Add grid/axes for context
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // Setup Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(5, 5, 5);

    // Setup Renderer with preserveDrawingBuffer for Screenshots
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        preserveDrawingBuffer: true 
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Setup Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // --- Parse and Add Data ---

    // Points
    if (data.points) {
        const geometry = new THREE.BufferGeometry();
        const positions: number[] = [];
        const colors: number[] = [];
        const sizes: number[] = [];
        
        data.points.forEach(p => {
            positions.push(p.x, p.y, p.z);
            const c = new THREE.Color(p.color || '#ffffff');
            colors.push(c.r, c.g, c.b);
            sizes.push(p.size || 0.2); 
        });

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({ 
            size: 0.2, 
            vertexColors: true,
            sizeAttenuation: true 
        });
        const pointsObj = new THREE.Points(geometry, material);
        pointsObj.name = "UBP_Points";
        scene.add(pointsObj);
    }

    // Lines
    if (data.lines) {
        data.lines.forEach((line, idx) => {
             const points = [];
             points.push(new THREE.Vector3(...line.start));
             points.push(new THREE.Vector3(...line.end));
             const geometry = new THREE.BufferGeometry().setFromPoints(points);
             const material = new THREE.LineBasicMaterial({ color: line.color || '#ffffff' });
             const lineObj = new THREE.Line(geometry, material);
             lineObj.name = `UBP_Line_${idx}`;
             scene.add(lineObj);
        });
    }

    // Spheres
    if (data.spheres) {
        data.spheres.forEach((s, idx) => {
            const geometry = new THREE.SphereGeometry(s.r, 16, 16);
            const material = new THREE.MeshStandardMaterial({ color: s.color || '#ffffff' });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(s.x, s.y, s.z);
            sphere.name = `UBP_Sphere_${idx}`;
            scene.add(sphere);
        });
    }

    // --- Animation Loop ---
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
        if (!mountRef.current || !camera || !renderer) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [data]);

  // --- Export Utilities ---

  const downloadBlob = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const handleSnapshot = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      
      const renderer = rendererRef.current;
      const originalSize = new THREE.Vector2();
      renderer.getSize(originalSize);
      const originalPixelRatio = renderer.getPixelRatio();

      // Temporarily boost resolution for HD Snapshot (2x)
      renderer.setPixelRatio(originalPixelRatio * 2);
      renderer.render(sceneRef.current, cameraRef.current);
      
      renderer.domElement.toBlob((blob) => {
          if (blob) downloadBlob(blob, `ubp_viz_snapshot_${Date.now()}.png`);
          
          // Restore settings
          renderer.setPixelRatio(originalPixelRatio);
          renderer.render(sceneRef.current, cameraRef.current!);
      }, 'image/png');
  };

  const handleExportGLB = () => {
      if (!sceneRef.current) return;
      setIsExporting(true);
      const exporter = new GLTFExporter();
      
      // We only export the UBP data objects, ignoring grid/axes helpers usually
      // But for simplicity, we export the whole scene or filtered children
      const objectsToExport = sceneRef.current.children.filter(c => 
          c.name.startsWith('UBP_') || c instanceof THREE.Mesh || c instanceof THREE.Line || c instanceof THREE.Points
      );

      // Create a temp group to export only what we want
      const exportGroup = new THREE.Group();
      objectsToExport.forEach(o => exportGroup.add(o.clone()));

      exporter.parse(
          exportGroup,
          (gltf) => {
              if (gltf instanceof ArrayBuffer) {
                  const blob = new Blob([gltf], { type: 'application/octet-stream' });
                  downloadBlob(blob, `ubp_scene_${Date.now()}.glb`);
              }
              setIsExporting(false);
          },
          (err) => {
              console.error("GLTF Export failed", err);
              setIsExporting(false);
          },
          { binary: true }
      );
  };

  const handleExportOBJ = () => {
      if (!sceneRef.current) return;
      setIsExporting(true);
      const exporter = new OBJExporter();
      const objectsToExport = sceneRef.current.children.filter(c => 
        c.name.startsWith('UBP_') || c instanceof THREE.Mesh
      );
      
      const exportGroup = new THREE.Group();
      objectsToExport.forEach(o => exportGroup.add(o.clone()));

      const result = exporter.parse(exportGroup);
      const blob = new Blob([result], { type: 'text/plain' });
      downloadBlob(blob, `ubp_model_${Date.now()}.obj`);
      setIsExporting(false);
  };

  return (
    <div className="w-full h-full relative group">
        <div ref={mountRef} className="w-full h-full" />
        
        {/* Export Toolbar */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button 
                onClick={handleSnapshot}
                className="bg-gray-900/80 hover:bg-cyan-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center"
                title="Take HD Snapshot (PNG)"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button 
                onClick={handleExportGLB}
                className="bg-gray-900/80 hover:bg-purple-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center"
                title="Export Scene (GLB)"
                disabled={isExporting}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </button>
            <button 
                onClick={handleExportOBJ}
                className="bg-gray-900/80 hover:bg-green-600 text-white p-2 rounded border border-white/20 shadow-lg flex items-center justify-center"
                title="Export Model (OBJ)"
                disabled={isExporting}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </button>
        </div>
        {isExporting && (
            <div className="absolute bottom-4 right-4 bg-black/80 text-white px-3 py-1 rounded text-xs animate-pulse border border-blue-500">
                Processing Export...
            </div>
        )}
    </div>
  );
};
