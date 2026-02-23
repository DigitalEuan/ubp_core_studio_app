
export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  codeBlock?: string;
  isError?: boolean;
  timestamp: number;
  groundingUrls?: { title: string; uri: string }[];
  attachments?: AttachedDoc[];
  thought?: string;
}

export interface AttachedDoc {
  name: string;
  content: string;
  type: string;
}

export type PyodideInterface = any;

export interface Scene3DData {
  points?: Array<{ x: number, y: number, z: number, color?: string, size?: number }>;
  lines?: Array<{ start: [number, number, number], end: [number, number, number], color?: string }>;
  spheres?: Array<{ x: number, y: number, z: number, r: number, color?: string }>;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  error?: string;
  image?: string; 
  scene3d?: Scene3DData;
  fomState?: any;
}

export type RightPanelTab = 'editor' | 'system_kb' | 'study_kb' | 'hash_memory_kb' | 'memory_status';

export type PipelinePhase = 1 | 2 | 3 | 4 | 5 | null;

export type MobileTab = 'assistant' | 'workspace' | 'studio';

export interface FileTab {
  name: string;
  content: string;
  type: 'script' | 'core' | 'data';
}

export interface Frame {
  frame_id: string;
  description: string;
  base_nrci: number;
  weights: Record<string, number>;
}

export interface ConsoleEntry {
  id: string;
  type: 'system' | 'stdout' | 'stderr' | 'error';
  content: string;
  timestamp: number;
}

// Extend Window interface for UBP GPU Proxy
declare global {
  interface Window {
    loadPyodide: any;
    // The Data Loader: Accepts a JSON string of [{id, vector:[r,g,b]}, ...]
    ubp_gpu_load_data?: (jsonString: string) => string;
    // The Compute Function: Accepts query vector, returns nearest ID
    ubp_gpu_compute?: (r: number, g: number, b: number) => string;
  }
}
