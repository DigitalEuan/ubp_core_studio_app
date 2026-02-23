
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
    
    Args:
        data (dict): A dictionary containing 'points', 'lines', and 'spheres'.
    """
    try:
        with open("scene_3d.json", "w") as f:
            json.dump(data, f)
        print("[UBP VIZ] 3D Scene data exported to visual engine.")
    except Exception as e:
        print(f"[UBP VIZ ERROR] Failed to save scene: {e}")
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
        f !== '.' && f !== '..' && f !== 'output' && f !== 'tmp' && f !== 'ubp_viz.py'
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
