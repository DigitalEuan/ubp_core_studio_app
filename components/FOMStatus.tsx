
import React, { useState, useRef } from 'react';
import { Frame } from '../types';

interface FOMStatusProps {
  isPyodideReady: boolean;
  frames: Frame[];
  activeFrameId: string;
  onSwitchFrame: (id: string) => void;
  onUpdateFrameJson: (json: string) => Promise<void>;
  onDeleteFrame: (id: string) => Promise<void>;
  onRefresh: () => void;
  onExportFOM: () => void;
  onImportFOM: (json: string) => Promise<void>;
}

export const FOMStatus: React.FC<FOMStatusProps> = ({ 
    isPyodideReady, 
    frames, 
    activeFrameId, 
    onSwitchFrame, 
    onUpdateFrameJson,
    onDeleteFrame,
    onRefresh,
    onExportFOM,
    onImportFOM
}) => {
  const [expandedFrame, setExpandedFrame] = useState<string | null>(null);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [jsonBuffer, setJsonBuffer] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Create New Logic
  const [isCreating, setIsCreating] = useState(false);
  const defaultNewJson = JSON.stringify({
      frame_id: "FOM_NEW_NAME",
      description: "Description of bias",
      base_nrci: 0.5,
      weights: {
          "UBP-TARGET-ID": 0.9
      },
      category_weights: {
          "SUBSTANCE": 0.7,
          "ALGORITHM": 0.6
      }
  }, null, 2);
  const [createJson, setCreateJson] = useState(defaultNewJson);

  const toggleFrameExpand = (frameId: string) => {
    setExpandedFrame(expandedFrame === frameId ? null : frameId);
    setEditingFrameId(null);
  };

  const startEditing = (frame: Frame) => {
      setEditingFrameId(frame.frame_id);
      setJsonBuffer(JSON.stringify(frame, null, 2));
  };

  const saveEdit = async () => {
      await onUpdateFrameJson(jsonBuffer);
      setEditingFrameId(null);
  };

  const saveCreate = async () => {
      await onUpdateFrameJson(createJson);
      setIsCreating(false);
      setCreateJson(defaultNewJson);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (content) {
              await onImportFOM(content);
          }
      };
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fom-status-panel bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-cyan-400">Frame of Mind (FOM)</h3>
        <div className="flex gap-1">
             <button
              onClick={onExportFOM}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-blue-300 border border-blue-900/30 rounded text-[10px] uppercase font-bold"
              title="Save All Frames to File"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-green-300 border border-green-900/30 rounded text-[10px] uppercase font-bold"
              title="Load Frames from File"
            >
              Import
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".json" />
            <button
              onClick={onRefresh}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px]"
            >
              ↻
            </button>
        </div>
      </div>

      {/* Active Frame Display */}
      <div className="bg-gray-800 rounded p-3 border border-gray-700">
        <div className="text-xs text-gray-400 mb-1 uppercase tracking-widest">Active Frame Bias</div>
        <div className="text-lg font-bold text-cyan-300 font-mono">{activeFrameId || "None"}</div>
      </div>

      {/* Frame Selector */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
             <div className="text-sm text-gray-400 font-semibold">Available Frames</div>
             <button onClick={() => setIsCreating(!isCreating)} className="text-xs text-green-400 hover:text-green-300 font-bold uppercase">
                 {isCreating ? 'Cancel' : '+ New Frame'}
             </button>
        </div>

        {isCreating && (
            <div className="bg-black/30 p-3 rounded border border-green-900/50 space-y-2 mb-2">
                <div className="text-xs text-gray-400">Edit JSON Definition:</div>
                <textarea
                    className="w-full bg-[#111] text-green-300 font-mono text-xs p-2 rounded border border-gray-700 h-32"
                    value={createJson}
                    onChange={(e) => setCreateJson(e.target.value)}
                />
                <button onClick={saveCreate} className="w-full bg-green-800 hover:bg-green-700 text-white text-xs py-1.5 rounded font-bold">
                    Save New Frame
                </button>
            </div>
        )}

        <div className="space-y-1">
          {frames.length === 0 && <div className="text-xs text-gray-500 italic">No frames loaded (Python kernel initializing...)</div>}
          
          {frames.map((frame) => (
            <div key={frame.frame_id} className="space-y-1">
              <button
                onClick={() => onSwitchFrame(frame.frame_id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  activeFrameId === frame.frame_id
                    ? 'bg-cyan-900/40 text-cyan-100 border border-cyan-700'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold">{frame.frame_id}</span>
                  <div className="flex items-center gap-2">
                     {activeFrameId === frame.frame_id && <span className="text-[9px] bg-cyan-500 text-black px-1 rounded font-bold">ACTIVE</span>}
                     <button
                        onClick={(e) => {
                        e.stopPropagation();
                        toggleFrameExpand(frame.frame_id);
                        }}
                        className="text-xs text-gray-400 hover:text-gray-200 px-1"
                    >
                        {expandedFrame === frame.frame_id ? '▼' : '▶'}
                    </button>
                  </div>
                </div>
              </button>

              {/* Frame Details / Editor */}
              {expandedFrame === frame.frame_id && (
                <div className="bg-gray-900 border border-gray-700 rounded p-2 ml-2 text-xs space-y-2 mb-2">
                  
                  {editingFrameId === frame.frame_id ? (
                      // EDIT MODE
                      <div className="space-y-2">
                          <textarea 
                             className="w-full h-40 bg-[#050505] text-amber-200 font-mono text-[10px] p-2 rounded border border-gray-600 focus:border-amber-500 focus:outline-none"
                             value={jsonBuffer}
                             onChange={(e) => setJsonBuffer(e.target.value)}
                          />
                          <div className="flex gap-2">
                              <button onClick={saveEdit} className="flex-1 bg-amber-700 hover:bg-amber-600 text-white py-1 rounded font-bold">Save JSON</button>
                              <button onClick={() => setEditingFrameId(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded">Cancel</button>
                          </div>
                      </div>
                  ) : (
                      // VIEW MODE
                      <>
                        <div className="text-gray-400 italic">"{frame.description}"</div>
                        <div className="text-gray-400">
                            <span className="text-gray-500">Base NRCI:</span> <span className="text-green-400">{frame.base_nrci}</span>
                        </div>
                        
                        {/* ID Weights */}
                        <div className="text-gray-400">
                            <span className="text-gray-500">ID Weights ({Object.keys(frame.weights).length}):</span>
                        </div>
                        <div className="ml-2 space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                            {Object.entries(frame.weights).length > 0 ? (
                                Object.entries(frame.weights).map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-gray-400 border-b border-gray-800 pb-0.5">
                                        <span>{k}</span>
                                        <span className="text-yellow-500">{v}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-gray-600 italic">No custom ID weights</div>
                            )}
                        </div>

                        {/* Category Weights - NEW */}
                        <div className="text-gray-400 mt-2">
                            <span className="text-gray-500">Category Weights ({(frame as any).category_weights ? Object.keys((frame as any).category_weights).length : 0}):</span>
                        </div>
                        <div className="ml-2 space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                            {(frame as any).category_weights && Object.entries((frame as any).category_weights).length > 0 ? (
                                Object.entries((frame as any).category_weights).map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-gray-400 border-b border-gray-800 pb-0.5">
                                        <span className="text-purple-400">{k}</span>
                                        <span className="text-yellow-500">{v as any}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-gray-600 italic">No category weights</div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-gray-800">
                             <button onClick={(e) => { e.stopPropagation(); startEditing(frame); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-blue-300 py-1 rounded border border-gray-600">
                                 Edit JSON
                             </button>
                             <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete Frame?')) onDeleteFrame(frame.frame_id); }} className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 py-1 rounded border border-red-900/50">
                                 Delete
                             </button>
                        </div>
                      </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
