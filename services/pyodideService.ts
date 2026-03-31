
import { PyodideInterface, ExecutionResult, Scene3DData } from '../types';

const WORKSPACE = '/home/pyodide';

class PyodideService {
  private pyodide: PyodideInterface | null = null;
  private outputBuffer: string[] = [];

  async initialize(): Promise<void> {
    if (this.pyodide) return;

    if (!(window as any).loadPyodide) {
      throw new Error("Pyodide script not loaded in index.html");
    }

    this.pyodide = await (window as any).loadPyodide();
    await this.pyodide.loadPackage(["numpy", "pandas", "scipy", "matplotlib"]);
    
    // Ensure Workspace Structure
    try { this.pyodide.FS.mkdir(WORKSPACE); } catch(e) { /* ignore if exists */ }
    try { this.pyodide.FS.mkdir(`${WORKSPACE}/output`); } catch(e) { /* ignore */ }

    // Configure Python Environment (sys.path & cwd)
    await this.pyodide.runPythonAsync(`
      import sys
      import os
      workspace = "${WORKSPACE}"
      if not os.path.exists(workspace):
          os.makedirs(workspace)
      os.chdir(workspace)
      if workspace not in sys.path:
          sys.path.insert(0, workspace)
    `);
    
    // Create Standalone Visualization Module
    this.pyodide.FS.writeFile(`${WORKSPACE}/ubp_viz.py`, `
"""
UBP Visualization Module (Standalone)
Provides interface to the React Three.js Viewer.
"""
import json
import os

def save_scene_3d(data):
    """
    Saves 3D scene data to scene_3d.json for the frontend to render.
    Also sends live updates directly to the React frontend.
    """
    try:
        with open("scene_3d.json", "w") as f:
            json.dump(data, f)
            
        # Send live update to React frontend
        import js
        if hasattr(js.window, 'updateScene3D'):
            js.window.updateScene3D(json.dumps(data))
            
        print("[UBP VIZ] 3D Scene data exported to visual engine.")
    except Exception as e:
        print(f"[UBP VIZ ERROR] Failed to save scene: {e}")
`);

    // Create Mock Modules for FastAPI, Uvicorn, and Websockets to allow server scripts to run in browser
    this.pyodide.FS.writeFile(`${WORKSPACE}/fastapi.py`, `
class WebSocket:
    async def accept(self): pass
    async def send_text(self, data):
        import js
        if hasattr(js.window, 'updateScene3D'):
            js.window.updateScene3D(data)
    async def receive_text(self):
        import asyncio
        await asyncio.sleep(100000)
        return "{}"

class FastAPI:
    def __init__(self, *args, **kwargs): pass
    def get(self, *args, **kwargs): return lambda f: f
    def post(self, *args, **kwargs): return lambda f: f
    def websocket(self, *args, **kwargs): return lambda f: f
`);

    this.pyodide.FS.writeFile(`${WORKSPACE}/ubp_browser_engine.py`, `
"""
UBP Browser Engine (V3)
This script adapts your UBP Physics Engine to run directly inside the browser's 
animation loop, bypassing the need for FastAPI or WebSockets.

Instructions:
1. Ensure your engine files (ubp_space_v3.py, etc.) are uploaded to this workspace.
2. Run this script instead of ubp_server_v3.py.
3. Switch to the VISUAL tab to see the live simulation!
"""
import asyncio
import json
import js

# Try to import the user's space module, fallback to a dummy simulation if not found
try:
    from ubp_space_v3 import Space
    space = Space()
    # Add some default entities if the space is empty
    # space.add_entity(...) 
    HAS_ENGINE = True
except ImportError:
    print("[UBP BROWSER ENGINE] ubp_space_v3.py not found. Running dummy simulation.")
    HAS_ENGINE = False

async def game_loop():
    if globals().get('_ubp_loop_running'):
        print("[UBP BROWSER ENGINE] Loop already running. Stopping previous loop.")
        globals()['_ubp_loop_running'] = False
        await asyncio.sleep(0.1) # Wait for previous loop to exit
        
    globals()['_ubp_loop_running'] = True
    print("[UBP BROWSER ENGINE] Starting live simulation loop at 30 TPS...")
    tick = 0
    while globals().get('_ubp_loop_running'):
        if HAS_ENGINE:
            space.tick()
            # Assuming space.to_dict() returns the Three.js compatible scene data
            scene_data = space.to_dict()
        else:
            # Dummy simulation for demonstration
            import math
            scene_data = {
                "spheres": [
                    {"id": "1", "x": math.cos(tick*0.1)*5, "y": 0, "z": math.sin(tick*0.1)*5, "r": 1, "color": "#E31E24", "label": "Dummy Entity"}
                ],
                "points": [],
                "lines": []
            }
            
        # Send live update to React frontend
        if hasattr(js.window, 'updateScene3D'):
            js.window.updateScene3D(json.dumps(scene_data))
            
        tick += 1
        # Yield to the browser's event loop (approx 30 FPS)
        await asyncio.sleep(1/30)
    print("[UBP BROWSER ENGINE] Loop stopped.")

# Start the loop in the background
asyncio.ensure_future(game_loop())
print("[UBP BROWSER ENGINE] Loop scheduled. Switch to the VISUAL tab!")
`);

    this.pyodide.FS.writeFile(`${WORKSPACE}/uvicorn.py`, `
import asyncio
def run(app, *args, **kwargs):
    print("[UBP BROWSER ENGINE] Intercepted uvicorn.run(). Running in browser mode instead.")
    # We don't block here, we let the browser's event loop handle async tasks
    pass
`);

    this.pyodide.FS.writeFile(`${WORKSPACE}/websockets.py`, `
class WebSocketServerProtocol:
    async def send(self, data):
        import js
        if hasattr(js.window, 'updateScene3D'):
            js.window.updateScene3D(data)
    async def recv(self):
        import asyncio
        await asyncio.sleep(100000) # Dummy block
        return "{}"

async def serve(*args, **kwargs):
    print("[UBP BROWSER ENGINE] Intercepted websockets.serve(). Running in browser mode instead.")
    import asyncio
    class DummyServer:
        async def wait_closed(self):
            await asyncio.sleep(100000)
    return DummyServer()
`);

    console.log(`Pyodide initialized. Workspace: ${WORKSPACE}`);
  }

  reset(): void {
    this.pyodide = null;
  }

  get isReady(): boolean {
    return this.pyodide !== null;
  }

  // Helper to ensure we always point to the workspace
  private resolvePath(filename: string): string {
      if (filename.startsWith('/')) return filename;
      return `${WORKSPACE}/${filename}`;
  }

  async writeFile(filename: string, content: string): Promise<void> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    this.pyodide.FS.writeFile(this.resolvePath(filename), content);
  }

  async renameFile(oldName: string, newName: string): Promise<void> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    const oldPath = this.resolvePath(oldName);
    const newPath = this.resolvePath(newName);
    
    // Check if source exists
    const analysis = this.pyodide.FS.analyzePath(oldPath);
    if (!analysis.exists) {
        throw new Error(`File not found: ${oldName}`);
    }
    
    this.pyodide.FS.rename(oldPath, newPath);
  }

  async deleteFile(filename: string): Promise<void> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    const path = this.resolvePath(filename);
    try {
        const analyze = this.pyodide.FS.analyzePath(path);
        if (analyze.exists) {
            const stat = this.pyodide.FS.stat(path);
            if (this.pyodide.FS.isDir(stat.mode)) {
                this.pyodide.FS.rmdir(path);
            } else {
                this.pyodide.FS.unlink(path);
            }
            console.debug(`[FS] Successfully Deleted: ${path}`);
        } else {
            console.warn(`[FS] Path for deletion not found: ${path}`);
        }
    } catch (e) {
        console.error(`[FS ERROR] failure deleting ${path}`, e);
        throw e;
    }
  }

  async writeBinaryFile(filename: string, data: Uint8Array): Promise<void> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    this.pyodide.FS.writeFile(this.resolvePath(filename), data);
  }

  async readFile(filename: string): Promise<string> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    const path = this.resolvePath(filename);
    if (this.pyodide.FS.analyzePath(path).exists) {
        return this.pyodide.FS.readFile(path, { encoding: 'utf8' });
    }
    return "";
  }

  async readBinaryFile(filename: string): Promise<Uint8Array | null> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");
    const path = this.resolvePath(filename);
    if (this.pyodide.FS.analyzePath(path).exists) {
        return this.pyodide.FS.readFile(path);
    }
    return null;
  }

  async listFiles(): Promise<string[]> {
    if (!this.pyodide) return [];
    
    // List Workspace Files
    let rootFiles: string[] = [];
    try {
        rootFiles = this.pyodide.FS.readdir(WORKSPACE);
    } catch(e) { return []; }

    const filteredRoot = rootFiles.filter((f: string) => 
        f !== '.' && f !== '..' && f !== 'output' && f !== 'tmp' && f !== 'ubp_viz.py' && f !== 'fastapi.py' && f !== 'uvicorn.py' && f !== 'websockets.py'
    );
    
    // List Output Files
    let outputFiles: string[] = [];
    try {
        const out = this.pyodide.FS.readdir(`${WORKSPACE}/output`);
        outputFiles = out
            .filter((f: string) => f !== '.' && f !== '..')
            .map((f: string) => `output/${f}`);
    } catch (e) { }

    return [...filteredRoot, ...outputFiles];
  }

  async runPython(code: string): Promise<ExecutionResult> {
    if (!this.pyodide) throw new Error("Pyodide not initialized");

    this.outputBuffer = [];
    let image: string | undefined = undefined;
    let scene3d: Scene3DData | undefined = undefined;

    this.pyodide.setStdout({ batched: (msg: string) => this.outputBuffer.push(msg) });
    this.pyodide.setStderr({ batched: (msg: string) => this.outputBuffer.push(`ERR: ${msg}`) });

    // Environment Safety Check: Force CWD and sys.path before every run
    try {
        await this.pyodide.runPythonAsync(`
            import os
            import sys
            if os.getcwd() != "${WORKSPACE}":
                os.chdir("${WORKSPACE}")
            if "${WORKSPACE}" not in sys.path:
                sys.path.insert(0, "${WORKSPACE}")
        `);
    } catch(e) { console.error("Env setup failed", e); }

    // Cleanup previous run artifacts
    const plotPath = `${WORKSPACE}/plot.png`;
    const scenePath = `${WORKSPACE}/scene_3d.json`;
    
    try {
        if (this.pyodide.FS.analyzePath(plotPath).exists) this.pyodide.FS.unlink(plotPath);
        if (this.pyodide.FS.analyzePath(scenePath).exists) this.pyodide.FS.unlink(scenePath);
    } catch (e) { /* ignore */ }

    try {
      // Execute User Code
      await this.pyodide.runPythonAsync(code);
      
      // Check for Generated Image
      if (this.pyodide.FS.analyzePath(plotPath).exists) {
          const imageBuffer = this.pyodide.FS.readFile(plotPath);
          const binary = String.fromCharCode.apply(null, Array.from(imageBuffer));
          image = btoa(binary);
      }

      // Check for Generated 3D Scene
      if (this.pyodide.FS.analyzePath(scenePath).exists) {
          const sceneContent = this.pyodide.FS.readFile(scenePath, { encoding: 'utf8' });
          try { scene3d = JSON.parse(sceneContent); } 
          catch (e) { this.outputBuffer.push("ERR: Failed to parse scene_3d.json"); }
      }

      return {
        stdout: this.outputBuffer.join('\n'),
        stderr: '',
        image,
        scene3d
      };
    } catch (err: any) {
      return {
        stdout: this.outputBuffer.join('\n'),
        stderr: err.toString(),
        error: err.toString()
      };
    }
  }
}

export const pyodideService = new PyodideService();
