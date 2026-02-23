
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pyodideService } from './services/pyodideService';
import { GeminiService } from './services/geminiService';
import { LocalLLMService, createLocalLLMService } from './services/localLlmService';
import { 
    INITIAL_SYSTEM_KB,
    INITIAL_STUDY_KB,
    INITIAL_HASH_MEMORY_KB,
    INITIAL_BELIEFS_KB
} from './constants';
import { ChatMessage, FileTab, Scene3DData, RightPanelTab, AttachedDoc, MobileTab, Frame, ConsoleEntry } from './types';
import { CodeEditor } from './components/CodeEditor';
import { ConsoleOutput } from './components/ConsoleOutput';
import { ChatInterface } from './components/ChatInterface';
import { ThreeViewer } from './components/ThreeViewer';
import { MemoryStatus } from './components/MemoryStatus';
import { FOMStatus } from './components/FOMStatus';
import { AIProviderSelector } from './components/AIProviderSelector';
import { marked } from 'marked';

const UBPLogo = () => (
  <svg width="28" height="28" viewBox="0 0 100 100" className="drop-shadow-md">
    <defs>
      <clipPath id="hexClip">
        <polygon points="50,5 93.3,30 93.3,70 50,95 6.7,70 6.7,30" />
      </clipPath>
    </defs>
    <g clipPath="url(#hexClip)">
      <polygon points="50,50 6.7,30 50,5" fill="#E31E24" />
      <polygon points="50,50 50,5 93.3,30" fill="#F7941D" />
      <polygon points="50,50 93.3,30 93.3,70" fill="#FFF200" />
      <polygon points="50,50 93.3,70 50,95" fill="#39B54A" />
      <polygon points="50,50 50,95 6.7,70" fill="#00AEEF" />
      <polygon points="50,50 6.7,70 6.7,30" fill="#662D91" />
    </g>
    <polygon points="50,5 93.3,30 93.3,70 50,95 6.7,70 6.7,30" fill="none" stroke="black" strokeWidth="7" strokeLinejoin="round" />
  </svg>
);

export const App: React.FC = () => {
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Mobile Tab State
  const [mobileTab, setMobileTab] = useState<'chat' | 'workspace' | 'tools'>('chat');

  // AI Provider Selection
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama' | 'lm-studio' | 'gpt4all'>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-pro-preview');
  const [localLLMService, setLocalLLMService] = useState<LocalLLMService | null>(null);
  const [localLLMStatus, setLocalLLMStatus] = useState<'available' | 'unavailable' | 'checking'>('checking');
  
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [files, setFiles] = useState<FileTab[]>([]);
  
  // Inline File Management State
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [fileToDelete, setFileToDelete] = useState<string | null>(null); // Track which file is pending deletion
  
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  
  const [systemKb, setSystemKb] = useState("[]"); // Default empty JSON array
  const [studyKb, setStudyKb] = useState(INITIAL_STUDY_KB);
  const [hashMemoryKb, setHashMemoryKb] = useState(INITIAL_HASH_MEMORY_KB);
  const [beliefsKb, setBeliefsKb] = useState(INITIAL_BELIEFS_KB);
  const [initialFomIndex, setInitialFomIndex] = useState<string | null>(null); // State for fetched FOM Index
  const [instructionManual, setInstructionManual] = useState("");
  
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [scene3dData, setScene3dData] = useState<Scene3DData | null>(null);
  
  const [activeOutputTab, setActiveOutputTab] = useState<'console' | 'visual' | 'memory' | 'fom'>('console');
  const [midColumnMode, setMidColumnMode] = useState<'files' | 'editor' | 'system' | 'study' | 'hash' | 'beliefs'>('files');

  // GPU Proxy Reference Store
  const gpuVectorStoreRef = useRef<{ id: string, vector: number[] }[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content: 'Welcome to UBP Core Studio v4.2.7 (FOM). I am ready to assist with your studies.',
      timestamp: Date.now()
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // FOM State
  const [fomFrames, setFomFrames] = useState<Frame[]>([]);
  const [activeFrame, setActiveFrame] = useState<string>('');

  const loadStudyRef = useRef<HTMLInputElement>(null);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  const addConsoleLog = (type: 'system' | 'stdout' | 'stderr' | 'error', content: string) => {
      setConsoleLogs(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          type,
          content,
          timestamp: Date.now()
      }]);
  };

  const refreshFileList = useCallback(async () => {
    if (!pyodideService.isReady) return;
    try {
        const fsFiles = await pyodideService.listFiles();
        
        // Map to hold new state to prevent duplicates
        const newFilesMap = new Map<string, FileTab>();

        // EXCLUDE LARGE KB FILES to prevent browser crash/stalls
        const EXCLUDED_FILES = [
            'ubp_system_kb.json',
            'ubp_beliefs_kb.json',
            'ubp_hash_memory_kb.json',
            'ubp_system_kb.md', 
            'ubp_study_kb.md', 
            'ubp_hash_memory_kb.md',
            'ubp_viz.py',
            'ubp_fom_index.json' // Also exclude FOM index from file list to avoid clutter, accessible via FOM tab
        ];

        // Read all files from FS
        for (const name of fsFiles) {
            if (EXCLUDED_FILES.includes(name)) continue;

            try {
                const content = await pyodideService.readFile(name);
                let type: 'script' | 'core' | 'data' = 'data';
                if (name.endsWith('.py')) type = 'script';
                // Try to preserve existing type if file was already open (e.g., 'core')
                const existing = files.find(f => f.name === name);
                if (existing) type = existing.type;

                newFilesMap.set(name, { name, content, type });
            } catch (err) {
                console.warn(`Failed to read file ${name} during sync`, err);
            }
        }
        
        setFiles(Array.from(newFilesMap.values()));
    } catch (e) {
        console.error("Failed to list files", e);
    }
  }, [pyodideService.isReady, files]); // Depend on files to preserve types

  // Initialize GPU Proxy Bridge
  useEffect(() => {
    // 1. DATA LOADER: Python calls this once to load 1725 vectors
    window.ubp_gpu_load_data = (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data)) {
                gpuVectorStoreRef.current = data;
                addConsoleLog('system', `[GPU Proxy] Loaded ${data.length} vectors into Main Thread memory.`);
                return `OK:${data.length}`;
            }
            return "ERR:InvalidFormat";
        } catch (e: any) {
            console.error("GPU Load Error", e);
            return `ERR:${e.message}`;
        }
    };

    // 2. COMPUTE FUNCTION: Python calls this for every calculation
    window.ubp_gpu_compute = (r: number, g: number, b: number) => {
        const store = gpuVectorStoreRef.current;
        if (store.length === 0) return "ERR:NoData";

        let minDist = Infinity;
        let bestId = "UNKNOWN";
        
        // Optimized V8 Loop (Main Thread)
        // This is significantly faster than Pyodide Wasm loop
        for (let i = 0; i < store.length; i++) {
            const item = store[i];
            const v = item.vector;
            // Squared Euclidean Distance (avoids sqrt for speed)
            const d = (r - v[0]) ** 2 + (g - v[1]) ** 2 + (b - v[2]) ** 2;
            
            if (d < minDist) {
                minDist = d;
                bestId = item.id;
            }
        }
        return bestId;
    };

    return () => {
        // Cleanup
        window.ubp_gpu_load_data = undefined;
        window.ubp_gpu_compute = undefined;
    };
  }, []);

  // Initialize Pyodide
  useEffect(() => {
    const initKernel = async () => {
        try {
            addConsoleLog('system', "Initializing Pyodide Runtime...");
            await pyodideService.initialize();
            setIsPyodideReady(true);
            addConsoleLog('system', "Pyodide Ready.");
            
            // Initial Sync of basic files
            await pyodideService.writeFile('ubp_system_kb.json', systemKb); 
            await pyodideService.writeFile('ubp_beliefs_kb.json', beliefsKb);
            await pyodideService.writeFile('ubp_study_kb.md', studyKb);
            await pyodideService.writeFile('ubp_hash_memory_kb.json', hashMemoryKb);
            
            await syncFOMSystem();
            addConsoleLog('system', "FOM System Ready.");
            await fetchFOMState();
            // REMOVED refreshFileList() to prevent race condition wiping out GitHub files
        } catch (err: any) { 
            addConsoleLog('error', `Error initializing runtime: ${err.toString()}`); 
        }
    };
    initKernel();
  }, []);

  // Initialize Local LLM Services
  useEffect(() => {
    const initLocalLLMs = async () => {
      const ollama = createLocalLLMService('ollama');
      const lmStudio = createLocalLLMService('lm-studio');
      const gpt4all = createLocalLLMService('gpt4all');
      
      const ollamaAvailable = await ollama.isServiceAvailable();
      const lmStudioAvailable = await lmStudio.isServiceAvailable();
      const gpt4allAvailable = await gpt4all.isServiceAvailable();
      
      if (ollamaAvailable) {
        setLocalLLMService(ollama);
        setLocalLLMStatus('available');
      } else if (lmStudioAvailable) {
        setLocalLLMService(lmStudio);
        setLocalLLMStatus('available');
      } else if (gpt4allAvailable) {
        setLocalLLMService(gpt4all);
        setLocalLLMStatus('available');
      } else {
        setLocalLLMStatus('unavailable');
      }
    };
    initLocalLLMs();
  }, []);

  // Sync All Workspace Files to Pyodide - Triggered by Readiness OR File Loading
  useEffect(() => {
    if (isPyodideReady && files.length > 0) {
        const syncFiles = async () => {
            try {
                for (const f of files) {
                   await pyodideService.writeFile(f.name, f.content);
                }
            } catch (e) { console.error("Auto-sync error", e); }
        };
        syncFiles();
    }
  }, [isPyodideReady, files.length]); // Updated dependency to catch late-arriving files

  // Sync Knowledge Bases to Python File System whenever they change content
  useEffect(() => {
    if (isPyodideReady) {
        const syncKBs = async () => {
            await pyodideService.writeFile('ubp_system_kb.json', systemKb);
            await pyodideService.writeFile('ubp_beliefs_kb.json', beliefsKb);
            await pyodideService.writeFile('ubp_study_kb.md', studyKb);
            await pyodideService.writeFile('ubp_hash_memory_kb.json', hashMemoryKb);
        };
        syncKBs();
    }
  }, [systemKb, studyKb, hashMemoryKb, beliefsKb, isPyodideReady]);

  // Load Initial Resources from GitHub
  useEffect(() => {
    const loadResources = async () => {
      try {
        const ts = Date.now();
        const sysUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/system_kb/ubp_system_kb.json';
        const beliefsUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/core/ubp_beliefs_kb.json';
        const hashUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/system_kb/hash_memory_kb.json';
        const manualUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/README.md';
        const autoTriggerUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/core/auto_trigger.py';
        const fomManagerUrl = 'https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/core/ubp_fom_manager_v2.py';

        // Load Basic Resources
        const [sysRes, beliefsRes, hashRes, manualRes, autoTriggerRes, fomManagerRes] = await Promise.all([
            fetch(sysUrl).catch(() => null),
            fetch(beliefsUrl).catch(() => null),
            fetch(hashUrl).catch(() => null),
            fetch(manualUrl).catch(() => null),
            fetch(autoTriggerUrl).catch(() => null),
            fetch(fomManagerUrl).catch(() => null)
        ]);

        if (sysRes?.ok) {
            const text = await sysRes.text();
            setSystemKb(text);
        }
        if (beliefsRes?.ok) {
            const text = await beliefsRes.text();
            setBeliefsKb(text);
        }
        if (hashRes?.ok) {
            const text = await hashRes.text();
            setHashMemoryKb(text);
        }

        // LOAD FOM INDEX (Attempt multiple paths with cache busting)
        let fomIndexText: string | null = null;
        let fomSource = '';
        const fomCandidates = [
            `https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/system_kb/ubp_fom_index.json?t=${ts}`,
            `https://raw.githubusercontent.com/DigitalEuan/UBP_Repo/main/core_studio_v4.0/core/ubp_fom_index.json?t=${ts}`
        ];

        for (const url of fomCandidates) {
            if (fomIndexText) break;
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const text = await res.text();
                    // Validate content is JSON
                    try {
                        const json = JSON.parse(text);
                        // Check if it's array (user's format) or dict
                        if (Array.isArray(json) || typeof json === 'object') {
                            fomIndexText = text;
                            fomSource = url;
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }

        if (fomIndexText) {
            setInitialFomIndex(fomIndexText);
            addConsoleLog('system', `Fetched FOM Index from ${fomSource}`);
        } else {
            console.warn("Could not auto-load FOM index from any candidate URL.");
        }
        
        let initialFiles: FileTab[] = [];
        if (manualRes?.ok) {
            const content = await manualRes.text();
            setInstructionManual(content);
            initialFiles.push({ name: 'README.md', content, type: 'data' });
        }

        if (autoTriggerRes?.ok) initialFiles.push({ name: 'auto_trigger.py', content: await autoTriggerRes.text(), type: 'core' });
        if (fomManagerRes?.ok) initialFiles.push({ name: 'ubp_fom_manager_v2.py', content: await fomManagerRes.text(), type: 'core' });

        try {
            const repoApiUrl = 'https://api.github.com/repos/DigitalEuan/UBP_Repo/contents/core_studio_v4.0/core';
            const repoRes = await fetch(repoApiUrl);
            if (repoRes.ok) {
                const items = await repoRes.json();
                const scriptPromises = items
                    .filter((item: any) => item.type === 'file' && (item.name.endsWith('.py') || item.name.endsWith('.md') || item.name.endsWith('.json')) && item.name !== 'auto_trigger.py' && item.name !== 'ubp_fom_manager_v2.py')
                    .map(async (item: any) => {
                        try {
                            const res = await fetch(item.download_url);
                            if (res.ok) return { name: item.name, content: await res.text(), type: item.name.endsWith('.py') ? 'script' : 'data' } as FileTab;
                        } catch (e) { }
                        return null;
                    });
                const fetchedScripts = (await Promise.all(scriptPromises))
                    .filter((f): f is FileTab => f !== null)
                    .filter(f => f.name.toLowerCase() !== 'scratch.py'); 

                fetchedScripts.forEach(f => initialFiles.push(f));
            }
        } catch (err) { }

        // Updated Hex Dictionary to default to JSON files
        const hexDictCode = `"""UBP HexDictionary v4.x Exact"""\nimport hashlib\nimport json\nimport os\nimport re\nfrom fractions import Fraction\nfrom typing import Dict, List, Tuple, Optional, Any\nclass HexDictionaryV4Exact:\n    def __init__(self):\n        self.registry = {}\n        self.id_map = {}\n        self.tag_index = {}\n    def load_memory(self, json_file="ubp_system_kb.json", md_file="ubp_system_kb.md"):\n        target = json_file if os.path.exists(json_file) else (md_file if os.path.exists(md_file) else None)\n        if not target: return\n        with open(target, 'r') as f: raw = f.read().strip()\n        if raw.startswith('{') or raw.startswith('['):\n            try:\n                data = json.loads(raw)\n                if isinstance(data, dict): \n                   for _, entry in data.items(): self._register_entry(entry)\n                elif isinstance(data, list):\n                   for entry in data: self._register_entry(entry)\n                return\n            except: pass\n        self._parse_markdown(raw)\n    def _parse_markdown(self, content):\n        current = {}\n        for line in content.split('\\n'):\n            if line.startswith("### UBP-") or line.startswith("## UBP-"):\n                if "ubp_id" in current: self._register_entry(current)\n                parts = line.split(":", 1)\n                current = {"ubp_id": parts[0].replace("#", "").strip(), "name": parts[1].strip() if len(parts)>1 else "Unknown", "tags": []}\n            elif "**Math**:" in line: current["math"] = line.split(":", 1)[1].strip()\n            elif "**Language**:" in line: current["language"] = line.split(":", 1)[1].strip()\n            elif "**Script**:" in line: current["script"] = line.split(":", 1)[1].strip()\n            elif "**Tags**:" in line: current["tags"] = [t.strip() for t in line.split(":", 1)[1].strip().split(",")]\n        if "ubp_id" in current: self._register_entry(current)\n    def _register_entry(self, entry):\n        if "math" not in entry: entry["math"] = "0"\n        if "fingerprint" not in entry:\n            entry["fingerprint"] = hashlib.sha256(f"{entry.get('math','')}|{entry.get('language','')}|{entry.get('script','')}".encode("utf-8")).hexdigest()\n        self.registry[entry["fingerprint"]] = entry\nHEX_DB_EXACT = HexDictionaryV4Exact()`;
        
        if (!initialFiles.find(f => f.name === 'hex_dictionary_v4_exact.py')) {
             initialFiles.push({ name: 'hex_dictionary_v4_exact.py', content: hexDictCode, type: 'script' });
        }

        // Set files state
        setFiles(prev => {
            const combined = [...prev];
            initialFiles.forEach(f => {
                if (f.name.toLowerCase() === 'scratch.py') return; // FILTER
                const idx = combined.findIndex(c => c.name === f.name);
                if (idx >= 0) combined[idx] = f;
                else combined.push(f);
            });
            if (!activeTabId && combined.length > 0) {
                setActiveTabId(combined[0].name);
            }
            return combined.filter(f => f.name.toLowerCase() !== 'scratch.py'); // FINAL FILTER
        });

      } catch (e) { console.error("Resource load failed", e); }
    };
    loadResources();
  }, []);

  // Sync Initial FOM Index to Pyodide once fetched and ready
  useEffect(() => {
    if (isPyodideReady && initialFomIndex) {
        const loadFom = async () => {
            try {
                await pyodideService.writeFile('ubp_fom_index.json', initialFomIndex);
                // Force reload of FOM Manager index from disk
                await pyodideService.runPython(`
                    try:
                        from ubp_fom_system import FOM_MANAGER
                        FOM_MANAGER.load_index()
                        print("FOM Index reloaded successfully.")
                    except Exception as e:
                        print(f"Error reloading FOM Index: {e}")
                `);
                await fetchFOMState();
            } catch (e) {
                console.error("Failed to load initial FOM index", e);
            }
        };
        loadFom();
    }
  }, [isPyodideReady, initialFomIndex]);

  const syncFOMSystem = async () => {
    try {
      const fomCoreCode = `
# UBP Frame of Mind System v4.3.0
import json
import os
class FrameOfMind:
    def __init__(self, frame_id, description="", base_nrci=0.5):
        self.frame_id = frame_id
        self.description = description
        self.base_nrci = base_nrci
        self.weights = {}
        self.category_weights = {} # Octad category weights
    def set_weight(self, ubp_id, nrci): self.weights[ubp_id] = nrci
    def set_category_weight(self, category, nrci): self.category_weights[category] = nrci
    def get_weight(self, ubp_id, category=None):
        if ubp_id in self.weights: return self.weights[ubp_id]
        if category and category in self.category_weights: return self.category_weights[category]
        return self.base_nrci
    def to_dict(self): 
        return {
            'frame_id': self.frame_id, 
            'description': self.description, 
            'base_nrci': self.base_nrci, 
            'weights': self.weights,
            'category_weights': self.category_weights
        }
class FOMManager:
    def __init__(self, index_file='ubp_fom_index.json'):
        self.frames = {}; self.active_frame = None; self.index_file = index_file; self.load_index()
    def load_index(self):
        try:
            if os.path.exists(self.index_file):
                with open(self.index_file, 'r') as f:
                    data = json.load(f)
                    # Handle LIST of frames (Array)
                    if isinstance(data, list):
                        for frame_data in data:
                            fid = frame_data.get('frame_id')
                            if fid:
                                frame = FrameOfMind(fid, frame_data.get('description', ''), frame_data.get('base_nrci', 0.5))
                                frame.weights = frame_data.get('weights', {})
                                frame.category_weights = frame_data.get('category_weights', {})
                                self.frames[fid] = frame
                    # Handle DICTIONARY of frames
                    elif isinstance(data, dict):
                        for frame_id, frame_data in data.items():
                            frame = FrameOfMind(frame_data.get('frame_id', frame_id), frame_data.get('description', ''), frame_data.get('base_nrci', 0.5))
                            frame.weights = frame_data.get('weights', {})
                            frame.category_weights = frame_data.get('category_weights', {})
                            self.frames[frame_id] = frame
                            
                    if self.frames: self.active_frame = list(self.frames.keys())[0]
            else:
                 # Default if no file
                 default = FrameOfMind("FOM_DEFAULT", "Balanced Standard Bias", 0.5)
                 self.frames["FOM_DEFAULT"] = default
                 self.active_frame = "FOM_DEFAULT"
        except Exception as e: print(f"[FOM] Error loading index: {e}")
    def save_index(self):
        try:
             # Save as DICT to maintain standard, or could save as LIST if preferred
             data = {fid: f.to_dict() for fid, f in self.frames.items()}
             with open(self.index_file, 'w') as f: json.dump(data, f)
        except: pass
    def update_frame_from_dict(self, data):
        fid = data.get('frame_id')
        if not fid: return
        f = FrameOfMind(fid, data.get('description',''), data.get('base_nrci', 0.5))
        f.weights = data.get('weights', {})
        f.category_weights = data.get('category_weights', {})
        self.frames[fid] = f
        self.save_index()
    def delete_frame(self, fid):
        if fid in self.frames:
            del self.frames[fid]
            # If we deleted the active frame, switch to another valid one
            if self.active_frame == fid:
                self.active_frame = list(self.frames.keys())[0] if self.frames else None
            self.save_index()
            print(f"DEBUG: Deleted {fid}, active is now {self.active_frame}")
    def switch_frame(self, frame_id):
        if frame_id in self.frames: self.active_frame = frame_id; return True
        return False
    def get_active_frame(self): return self.frames[self.active_frame] if (self.active_frame and self.active_frame in self.frames) else None
    def get_mass(self, ubp_id, category=None): return self.get_active_frame().get_weight(ubp_id, category) if self.get_active_frame() else 0.5
    def list_frames(self): return list(self.frames.keys())
FOM_MANAGER = FOMManager()
`;
      await pyodideService.writeFile('ubp_fom_system.py', fomCoreCode);
    } catch (err) { console.warn("Failed to sync FOM system", err); }
  };

  const fetchFOMState = async () => {
    if (!pyodideService.isReady) return;
    try {
        const code = `
import json
from ubp_fom_system import FOM_MANAGER
result = {
    'frames': [f.to_dict() for f in FOM_MANAGER.frames.values()],
    'active': FOM_MANAGER.active_frame
}
print(json.dumps(result))
`;
        const res = await pyodideService.runPython(code);
        if (res.stdout) {
            try {
                const data = JSON.parse(res.stdout);
                setFomFrames(data.frames);
                setActiveFrame(data.active);
            } catch(e) { /* ignore parse errors */ }
        }
    } catch (e) {}
  };

  const handleImportFOM = async (jsonString: string) => {
      if (!isPyodideReady) return;
      try {
          await pyodideService.writeFile('fom_upload.json', jsonString);
          const code = `
import json
from ubp_fom_system import FOM_MANAGER
try:
    with open('fom_upload.json', 'r') as f:
        data = json.load(f)
    frames_to_load = []
    if isinstance(data, list): frames_to_load = data
    elif isinstance(data, dict):
        if 'frames' in data and isinstance(data['frames'], list): frames_to_load = data['frames']
        elif 'frame_id' in data: frames_to_load = [data]
        else: frames_to_load = [v for k,v in data.items()]
    count = 0
    for f_data in frames_to_load:
        FOM_MANAGER.update_frame_from_dict(f_data)
        count += 1
    print(f"SUCCESS: Imported {count} frames")
except Exception as e: print(f"ERROR: {e}")
`;
          const res = await pyodideService.runPython(code);
          if (res.stdout.includes("SUCCESS")) {
              addConsoleLog('system', res.stdout.trim());
              await fetchFOMState();
          } else {
              addConsoleLog('error', `Import failed: ${res.stdout}`);
          }
      } catch (e: any) {
          addConsoleLog('error', `Import error: ${e.message}`);
      }
  };

  const handleUpdateFOMJson = async (jsonString: string) => {
    if (!isPyodideReady) return;
    try {
         await pyodideService.writeFile('temp_fom_update.json', jsonString);
         const code = `
import json
from ubp_fom_system import FOM_MANAGER
try:
    with open('temp_fom_update.json', 'r') as f:
        data = json.load(f)
    FOM_MANAGER.update_frame_from_dict(data)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
`;
         await pyodideService.runPython(code);
         addConsoleLog('system', "Frame saved.");
         await fetchFOMState();
    } catch (e: any) {
        addConsoleLog('error', `Failed to update FOM: ${e.message}`);
    }
  };

  const handleSwitchFrame = async (id: string) => {
      if (!isPyodideReady) return;
      await pyodideService.runPython(`FOM_MANAGER.switch_frame('${id}')`);
      await fetchFOMState();
  };

  const handleDeleteFrame = async (id: string) => {
      if (!isPyodideReady) return;
      try {
        await pyodideService.runPython(`FOM_MANAGER.delete_frame('${id}')`);
        await fetchFOMState();
        addConsoleLog('system', `Frame ${id} deleted.`);
      } catch (e: any) {
          addConsoleLog('error', `Delete failed: ${e.message}`);
      }
  };

  const handleRunCode = async () => {
    const activeFile = files.find(f => f.name === activeTabId);
    if (!activeFile || !isPyodideReady || isExecuting) return;

    setIsExecuting(true);
    setActiveOutputTab('console');
    addConsoleLog('system', `>>> Running ${activeFile.name}...`);
    
    // 1. Save active file to FS before running
    await pyodideService.writeFile(activeFile.name, activeFile.content);
    
    // 2. Run
    const result = await pyodideService.runPython(activeFile.content);
    
    if (result.stdout) addConsoleLog('stdout', result.stdout);
    if (result.stderr) addConsoleLog('stderr', result.stderr);
    if (result.error) addConsoleLog('error', result.error);
    
    if (result.image) {
        setGeneratedImage(result.image);
        setActiveOutputTab('visual');
    }
    
    if (result.scene3d) {
        setScene3dData(result.scene3d);
        setActiveOutputTab('visual');
    }

    setIsExecuting(false);
    
    // 3. Sync FS back to React State (catch any new files created by the script)
    await refreshFileList();
  };

  const handleSendMessage = async (text: string, attachments: AttachedDoc[]) => {
    if (isChatLoading) return;
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now(), attachments };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatLoading(true);
    try {
        let responseText = "";
        let thought: string | undefined = undefined;
        let groundingUrls: { title: string; uri: string }[] | undefined = [];

        if (aiProvider === 'gemini') {
            const apiKey = process.env.API_KEY || '';
            const gemini = new GeminiService(apiKey, selectedModel);
            const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
            const res = await gemini.generateStudyPlan(history, text, files, systemKb, studyKb, hashMemoryKb, beliefsKb, instructionManual, attachments);
            responseText = res.text;
            thought = res.thought;
            groundingUrls = res.groundingUrls;
        } else {
             if (!localLLMService) throw new Error("Local LLM not ready");
             const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
             const res = await localLLMService.generateResponse(text, history, files, systemKb, studyKb, hashMemoryKb);
             responseText = res.text;
        }

        const newModelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', content: responseText, timestamp: Date.now(), thought, groundingUrls };
        setChatMessages(prev => [...prev, newModelMsg]);
    } catch (e: any) {
        addConsoleLog('error', e.message);
         setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', content: `Error: ${e.message}`, timestamp: Date.now(), isError: true }]);
    } finally {
        setIsChatLoading(false);
    }
  };

  const handleExtractCode = async (code: string) => {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const name = `ubp_script_${timestamp}.py`;
      const newFile: FileTab = { name, content: code, type: 'script' };
      setFiles(prev => [...prev, newFile]);
      setActiveTabId(name);
      setMidColumnMode('editor');
      if (isPyodideReady) {
         try {
             await pyodideService.writeFile(name, code);
             addConsoleLog('system', `Extracted code to new file: ${name}`);
             await refreshFileList();
         } catch(e) { console.error(e); }
      }
  };

  const handleExtractToKB = (target: 'system' | 'study' | 'hash' | 'beliefs', content: string) => {
      if (target === 'system') {
          // JSON Merge Logic
          setSystemKb(prev => {
              try {
                  const prevJson = JSON.parse(prev);
                  const newContent = JSON.parse(content);
                  let merged;
                  if (Array.isArray(prevJson)) {
                      merged = [...prevJson, ...(Array.isArray(newContent) ? newContent : [newContent])];
                  } else {
                      merged = { ...prevJson, ...newContent };
                  }
                  return JSON.stringify(merged, null, 2);
              } catch (e) {
                  return prev + "\n" + content; // Fallback
              }
          });
          setMidColumnMode('system');
      } else if (target === 'beliefs') {
          setBeliefsKb(prev => {
              try {
                  const prevJson = JSON.parse(prev);
                  const newContent = JSON.parse(content);
                  let merged;
                  if (Array.isArray(prevJson)) {
                      merged = [...prevJson, ...(Array.isArray(newContent) ? newContent : [newContent])];
                  } else {
                      merged = { ...prevJson, ...newContent };
                  }
                  return JSON.stringify(merged, null, 2);
              } catch (e) {
                  return prev + "\n" + content;
              }
          });
          setMidColumnMode('beliefs');
      } else if (target === 'study') {
          setStudyKb(prev => prev + "\n" + content);
          setMidColumnMode('study');
      } else if (target === 'hash') {
          setHashMemoryKb(prev => {
              try {
                 const prevJson = JSON.parse(prev);
                 const newJson = JSON.parse(content);
                 const merged = { ...prevJson, ...newJson };
                 return JSON.stringify(merged, null, 2);
              } catch (e) { return prev + "\n" + content; }
          });
          setMidColumnMode('hash');
      }
      addConsoleLog('system', `Extracted content to ${target.toUpperCase()} KB.`);
  };

  const updateFileContent = (name: string, content: string) => {
      setFiles(prev => prev.map(f => f.name === name ? { ...f, content } : f));
  };

  // ------------------------------------------------------------------------
  // INLINE FILE HANDLING HANDLERS
  // ------------------------------------------------------------------------

  const startCreateFile = () => {
      setIsCreatingFile(true);
      setNewFileName('');
      // Use setTimeout to allow render before focusing
      setTimeout(() => newFileInputRef.current?.focus(), 50);
  };

  const submitCreateFile = async (e?: React.FormEvent) => {
      e?.preventDefault();
      let name = newFileName.trim();
      if (!name) {
          setIsCreatingFile(false);
          return;
      }
      if (!name.includes('.')) name += '.py';

      if (files.some(f => f.name === name)) {
          alert("File exists");
          return;
      }

      const newFile: FileTab = { name, content: '# New Script\n', type: 'script' };
      setFiles(prev => [...prev, newFile]);
      setIsCreatingFile(false);
      setActiveTabId(name);
      setMidColumnMode('editor');

      if (isPyodideReady) {
          await pyodideService.writeFile(name, newFile.content);
          addConsoleLog('system', `Created file: ${name}`);
      }
  };

  const startRename = (name: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Critical
      setRenamingFile(name);
      setRenameValue(name);
      setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const submitRename = async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!renamingFile) return;
      const oldName = renamingFile;
      const newName = renameValue.trim();
      
      if (!newName || newName === oldName) {
          setRenamingFile(null);
          return;
      }

      setFiles(prev => prev.map(f => f.name === oldName ? { ...f, name: newName } : f));
      if (activeTabId === oldName) setActiveTabId(newName);
      setRenamingFile(null);

      if (isPyodideReady) {
          try {
             const fileData = files.find(f => f.name === oldName);
             await pyodideService.writeFile(newName, fileData?.content || "");
             try { await pyodideService.deleteFile(oldName); } catch(e) {}
             addConsoleLog('system', `Renamed ${oldName} -> ${newName}`);
          } catch (e: any) {
             console.error(e);
          }
      }
  };

  // ----- ROBUST DELETE LOGIC -----
  const requestDelete = (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setFileToDelete(name);
  };

  const confirmDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!fileToDelete) return;
      
      const name = fileToDelete;
      
      // Update UI State
      setFiles(prev => prev.filter(f => f.name !== name));
      if (activeTabId === name) setActiveTabId('');
      
      setFileToDelete(null);

      // Async FS Operation
      if (isPyodideReady) {
          try {
              await pyodideService.deleteFile(name);
              addConsoleLog('system', `Deleted ${name}`);
          } catch (e) { console.error("FS Delete failed", e); }
      }
  };

  const cancelDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      setFileToDelete(null);
  };
  // -------------------------------

  const handleUploadWorkspaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (content) {
              const newFile: FileTab = { name: file.name, content: content, type: file.name.endsWith('.py') ? 'script' : 'data' };
              setFiles(prev => {
                  if (prev.find(f => f.name === file.name)) return prev.map(f => f.name === file.name ? newFile : f);
                  return [...prev, newFile];
              });
              if (isPyodideReady) {
                  await pyodideService.writeFile(file.name, content);
                  addConsoleLog('system', `Uploaded ${file.name}`);
              }
          }
      };
      reader.readAsText(file);
      if (uploadFileRef.current) uploadFileRef.current.value = '';
  };

  const openFile = (name: string) => {
      setActiveTabId(name);
      setMidColumnMode('editor');
  };

  const handleSaveStudy = () => {
      const studyData = { timestamp: Date.now(), files, systemKb, studyKb, hashMemoryKb, beliefsKb, chatMessages, consoleLogs };
      const blob = new Blob([JSON.stringify(studyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ubp_study_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleLoadStudy = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              
              // Filter out KBs from the files list if they were accidentally saved there
              if (data.files) {
                  const EXCLUDED = ['ubp_system_kb.md', 'ubp_system_kb.json', 'ubp_beliefs_kb.json', 'ubp_hash_memory_kb.json', 'ubp_study_kb.md', 'ubp_hash_memory_kb.md'];
                  const cleanFiles = data.files.filter((f: FileTab) => !EXCLUDED.includes(f.name));
                  setFiles(cleanFiles);
                  
                  // If active tab was one of the excluded files, switch to first available
                  if (cleanFiles.length > 0) setActiveTabId(cleanFiles[0].name);
                  
                  // Sync files to Pyodide
                  if (isPyodideReady) {
                      for (const f of cleanFiles) await pyodideService.writeFile(f.name, f.content);
                  }
              }

              if (data.systemKb) {
                  setSystemKb(data.systemKb);
                  if (isPyodideReady) await pyodideService.writeFile('ubp_system_kb.json', data.systemKb);
              }
              if (data.beliefsKb) {
                  setBeliefsKb(data.beliefsKb);
                  if (isPyodideReady) await pyodideService.writeFile('ubp_beliefs_kb.json', data.beliefsKb);
              }
              if (data.studyKb) {
                  setStudyKb(data.studyKb);
                  if (isPyodideReady) await pyodideService.writeFile('ubp_study_kb.md', data.studyKb);
              }
              if (data.hashMemoryKb) {
                  setHashMemoryKb(data.hashMemoryKb);
                  if (isPyodideReady) await pyodideService.writeFile('ubp_hash_memory_kb.json', data.hashMemoryKb);
              }
              
              if (data.chatMessages) setChatMessages(data.chatMessages);
              if (data.consoleLogs) setConsoleLogs(data.consoleLogs);
              
              if (isPyodideReady) await fetchFOMState();
              
              alert("Study Loaded Successfully");
          } catch (err) { alert("Failed to load study: Invalid format."); }
      };
      reader.readAsText(file);
      if (loadStudyRef.current) loadStudyRef.current.value = '';
  };

  const downloadCurrentFile = () => {
    let content = "";
    let name = activeTabId;
    if (midColumnMode === 'editor' || midColumnMode === 'files') {
         content = files.find(f => f.name === activeTabId)?.content || "";
    } else if (midColumnMode === 'system') { content = systemKb; name = 'ubp_system_kb.json'; }
    else if (midColumnMode === 'beliefs') { content = beliefsKb; name = 'ubp_beliefs_kb.json'; }
    else if (midColumnMode === 'study') { content = studyKb; name = 'ubp_study_kb.md'; }
    else { content = hashMemoryKb; name = 'ubp_hash_memory_kb.json'; }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-black text-white overflow-hidden font-sans">
      {/* GLOBAL HEADER */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between h-14 shrink-0">
        <div className="flex items-center gap-3">
          <UBPLogo />
          <div>
            <h1 className="text-lg font-bold text-cyan-400 leading-tight">UBP Core Studio v4.2.7</h1>
            <div className="text-[10px] text-gray-500">Reflexive Memory • Frame of Mind • Local AI</div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                <button onClick={handleSaveStudy} className="px-3 py-1 text-xs hover:bg-gray-700 rounded flex items-center gap-1 text-gray-300">
                    💾 Save Study
                </button>
                <div className="w-px bg-gray-700 mx-1"></div>
                <button onClick={() => loadStudyRef.current?.click()} className="px-3 py-1 text-xs hover:bg-gray-700 rounded flex items-center gap-1 text-gray-300">
                    📂 Load Study
                </button>
                <input type="file" ref={loadStudyRef} onChange={handleLoadStudy} accept=".json" className="hidden" />
             </div>
             <div className={`px-2 py-1 rounded text-[10px] border ${isPyodideReady ? 'border-green-800 bg-green-900/30 text-green-400' : 'border-red-800 bg-red-900/30 text-red-400'}`}>
                {isPyodideReady ? 'KERNEL ONLINE' : 'INITIALIZING...'}
             </div>
        </div>
      </div>

      {/* MOBILE NAVIGATION BAR (Visible only on small screens) */}
      <div className="md:hidden flex border-b border-gray-800 bg-[#111]">
         <button onClick={() => setMobileTab('chat')} className={`flex-1 py-2 text-xs font-bold uppercase ${mobileTab === 'chat' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500'}`}>Assistant</button>
         <button onClick={() => setMobileTab('workspace')} className={`flex-1 py-2 text-xs font-bold uppercase ${mobileTab === 'workspace' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}>Workspace</button>
         <button onClick={() => setMobileTab('tools')} className={`flex-1 py-2 text-xs font-bold uppercase ${mobileTab === 'tools' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}>Tools</button>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex overflow-hidden relative">
      
        {/* LEFT COLUMN: CHAT */}
        <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-[30%] md:min-w-[350px] flex-col border-r border-gray-800 pb-2`}>
           <AIProviderSelector 
              selectedProvider={aiProvider}
              selectedModel={selectedModel}
              onProviderChange={setAiProvider}
              onModelChange={setSelectedModel}
           />
           <div className="flex-1 min-h-0 relative">
               <ChatInterface 
                  messages={chatMessages}
                  isLoading={isChatLoading}
                  onSendMessage={handleSendMessage}
                  onExtractCode={handleExtractCode}
                  onExtractToKB={handleExtractToKB}
               />
           </div>
        </div>

        {/* MIDDLE COLUMN: EDITOR / KB */}
        <div className={`${mobileTab === 'workspace' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-[300px] border-r border-gray-800 bg-[#151515] pb-2`}>
           {/* Mid Toolbar */}
           <div className="h-12 bg-[#1a1a1a] border-b border-gray-800 flex items-center px-2 justify-between">
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                  <button onClick={() => setMidColumnMode('files')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'files' ? 'bg-[#252525] text-white border-t-2 border-gray-300' : 'text-gray-500 hover:text-gray-300'}`}>Files</button>
                  <button onClick={() => setMidColumnMode('editor')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'editor' ? 'bg-[#252525] text-white border-t-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>Editor</button>
                  <button onClick={() => setMidColumnMode('system')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'system' ? 'bg-[#252525] text-white border-t-2 border-green-500' : 'text-gray-500 hover:text-gray-300'}`}>System</button>
                  <button onClick={() => setMidColumnMode('beliefs')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'beliefs' ? 'bg-[#252525] text-white border-t-2 border-pink-500' : 'text-gray-500 hover:text-gray-300'}`}>Beliefs</button>
                  <button onClick={() => setMidColumnMode('study')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'study' ? 'bg-[#252525] text-white border-t-2 border-amber-500' : 'text-gray-500 hover:text-gray-300'}`}>Study</button>
                  <button onClick={() => setMidColumnMode('hash')} className={`px-3 py-1.5 rounded-t text-xs font-bold uppercase tracking-wider ${midColumnMode === 'hash' ? 'bg-[#252525] text-white border-t-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Hash</button>
              </div>
              <div className="flex items-center gap-2">
                 {midColumnMode === 'editor' && (
                     <>
                        <button onClick={downloadCurrentFile} className="p-1 hover:bg-gray-700 rounded text-blue-400" title="Download Current File">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <button 
                          onClick={handleRunCode}
                          disabled={!isPyodideReady || isExecuting}
                          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(21,128,61,0.4)]"
                        >
                          {isExecuting ? 'Running...' : '▶ Run'}
                        </button>
                     </>
                 )}
              </div>
           </div>

           {/* Mid Content */}
           <div className="flex-1 overflow-hidden relative">
               {midColumnMode === 'files' && (
                   <div className="flex flex-col h-full bg-[#111] p-4">
                       <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-800">
                           <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Workspace Explorer</h3>
                           <div className="flex gap-2">
                               <button onClick={startCreateFile} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-white border border-gray-600">
                                   + New Script
                               </button>
                               <button onClick={() => uploadFileRef.current?.click()} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-blue-300 border border-blue-900/50">
                                   ↑ Upload File
                               </button>
                               <input type="file" ref={uploadFileRef} onChange={handleUploadWorkspaceFile} className="hidden" accept=".py,.txt,.md,.json" />
                           </div>
                       </div>
                       
                       <div className="flex-1 overflow-y-auto space-y-1 p-2">
                            {/* NEW FILE INPUT ROW */}
                            {isCreatingFile && (
                                <form onSubmit={submitCreateFile} className="flex items-center p-2 rounded bg-gray-800 border border-green-600 mb-2">
                                    <input 
                                        ref={newFileInputRef}
                                        type="text" 
                                        className="flex-1 bg-transparent text-xs text-white focus:outline-none font-mono"
                                        placeholder="script.py"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Escape' && setIsCreatingFile(false)}
                                        onBlur={() => !newFileName && setIsCreatingFile(false)}
                                    />
                                    <div className="flex items-center gap-1">
                                        <button type="submit" className="text-green-400 hover:text-green-300 text-xs px-2">✓</button>
                                        <button type="button" onClick={() => setIsCreatingFile(false)} className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
                                    </div>
                                </form>
                            )}

                            {files.length === 0 && !isCreatingFile && (
                                <div className="text-center text-gray-600 italic mt-10">No files in workspace.</div>
                            )}
                            
                            {files.map(f => (
                                <div key={f.name} className={`flex items-center justify-between p-2 rounded group border ${activeTabId === f.name ? 'bg-gray-800 border-gray-600' : 'bg-[#151515] border-transparent hover:bg-[#1a1a1a] hover:border-gray-800'}`}>
                                    
                                    {/* DELETE CONFIRMATION MODE */}
                                    {fileToDelete === f.name ? (
                                        <div className="flex-1 flex items-center justify-between bg-red-900/20 rounded p-1">
                                            <span className="text-xs text-red-300 font-bold ml-1">Delete {f.name}?</span>
                                            <div className="flex gap-2">
                                                <button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-0.5 rounded font-bold">Yes</button>
                                                <button onClick={cancelDelete} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-0.5 rounded">No</button>
                                            </div>
                                        </div>
                                    ) : renamingFile === f.name ? (
                                        <form onSubmit={submitRename} className="flex-1 flex items-center gap-2">
                                            <input
                                                ref={renameInputRef}
                                                type="text"
                                                className="flex-1 bg-black text-xs text-white border border-blue-500 rounded px-1 py-0.5 font-mono focus:outline-none"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Escape' && setRenamingFile(null)}
                                                onBlur={submitRename}
                                            />
                                        </form>
                                    ) : (
                                        <div 
                                            onClick={() => openFile(f.name)} 
                                            className="flex-1 cursor-pointer flex items-center gap-2 truncate pr-2 select-none"
                                        >
                                            <span className={`text-xs font-mono ${activeTabId === f.name ? 'text-white font-bold' : 'text-blue-400'}`}>
                                                {f.name}
                                            </span>
                                            <span className="text-[9px] text-gray-600 bg-black/30 px-1 rounded uppercase">{f.type}</span>
                                        </div>
                                    )}
                                    
                                    {/* ACTION BUTTONS */}
                                    <div className="flex items-center gap-1">
                                        {renamingFile === f.name || fileToDelete === f.name ? null : (
                                            <>
                                                <button 
                                                    onClick={(e) => startRename(f.name, e)}
                                                    className="p-1.5 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded cursor-pointer border border-transparent hover:border-gray-600"
                                                    title="Rename"
                                                    type="button"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                                <button 
                                                    onClick={(e) => requestDelete(f.name, e)}
                                                    className="p-1.5 text-gray-500 hover:text-red-400 bg-gray-800 hover:bg-red-900/20 rounded cursor-pointer border border-transparent hover:border-red-900/30"
                                                    title="Delete"
                                                    type="button"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                   </div>
               )}

               {midColumnMode === 'editor' && (
                   <div className="flex flex-col h-full min-h-0">
                       <div className="flex-1 relative min-h-0">
                          {files.find(f => f.name === activeTabId) ? (
                              <CodeEditor code={files.find(f => f.name === activeTabId)?.content || ''} onChange={(val) => updateFileContent(activeTabId, val)} label={activeTabId} />
                          ) : (
                              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                                  <span>No file open.</span>
                                  <button onClick={() => setMidColumnMode('files')} className="text-blue-500 hover:underline">Go to Files</button>
                              </div>
                          )}
                       </div>
                   </div>
               )}
               {midColumnMode === 'system' && <CodeEditor code={systemKb} onChange={setSystemKb} label="ubp_system_kb.json" />}
               {midColumnMode === 'beliefs' && <CodeEditor code={beliefsKb} onChange={setBeliefsKb} label="ubp_beliefs_kb.json" />}
               {midColumnMode === 'study' && <CodeEditor code={studyKb} onChange={setStudyKb} label="ubp_study_kb.md" />}
               {midColumnMode === 'hash' && <CodeEditor code={hashMemoryKb} onChange={setHashMemoryKb} label="ubp_hash_memory_kb.json" />}
           </div>
        </div>

        {/* RIGHT COLUMN: OUTPUT / TOOLS */}
        <div className={`${mobileTab === 'tools' ? 'flex' : 'hidden'} md:flex w-full md:w-[25%] md:min-w-[300px] flex-col border-l border-gray-800 bg-[#111] pb-2`}>
            <div className="h-12 bg-[#1a1a1a] border-b border-gray-800 flex items-center px-2 gap-1">
               <button onClick={() => setActiveOutputTab('console')} className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${activeOutputTab === 'console' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Console</button>
               <button onClick={() => setActiveOutputTab('visual')} className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${activeOutputTab === 'visual' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Visual</button>
               <button onClick={() => setActiveOutputTab('memory')} className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${activeOutputTab === 'memory' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Mem Status</button>
               <button onClick={() => setActiveOutputTab('fom')} className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${activeOutputTab === 'fom' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>FOM</button>
            </div>

            <div className="flex-1 overflow-hidden p-2">
                {activeOutputTab === 'console' && <ConsoleOutput logs={consoleLogs} />}
                {activeOutputTab === 'visual' && (
                    <div className="h-full flex flex-col gap-2">
                        {scene3dData ? (
                            <div className="flex-1 border border-gray-700 rounded overflow-hidden">
                                <ThreeViewer data={scene3dData} />
                            </div>
                        ) : generatedImage ? (
                            <div className="flex-1 border border-gray-700 rounded overflow-hidden flex items-center justify-center bg-black">
                                <img src={`data:image/png;base64,${generatedImage}`} alt="Output" className="max-w-full max-h-full" />
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 mt-10">No Visualization Data</div>
                        )}
                    </div>
                )}
                {activeOutputTab === 'memory' && <MemoryStatus systemKb={systemKb} hashMemoryKb={hashMemoryKb} beliefsKb={beliefsKb} studyKb={studyKb} />}
                {activeOutputTab === 'fom' && <FOMStatus isPyodideReady={isPyodideReady} frames={fomFrames} activeFrameId={activeFrame} onSwitchFrame={handleSwitchFrame} onUpdateFrameJson={handleUpdateFOMJson} onDeleteFrame={handleDeleteFrame} onRefresh={fetchFOMState} onExportFOM={() => { const blob = new Blob([JSON.stringify(fomFrames, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ubp_fom_index.json'; a.click(); }} onImportFOM={handleImportFOM} />}
            </div>
        </div>
      </div>
    </div>
  );
};
