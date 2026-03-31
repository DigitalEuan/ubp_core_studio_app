
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, AttachedDoc, PipelinePhase } from '../types';

import * as pdfjs from 'pdfjs-dist';

// Use unpkg CDN for worker to completely bypass Vite's minification which breaks pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs`;

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (msg: string, attachments: AttachedDoc[]) => void;
  isLoading: boolean;
  onExtractCode: (code: string) => void;
  onExtractToKB: (target: 'system' | 'study' | 'hash' | 'beliefs', content: string) => void;
  onResetKernel: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading, onExtractCode, onExtractToKB, onResetKernel }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedDoc[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive current phase from the last model message
  const [currentPhase, setCurrentPhase] = useState<PipelinePhase>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    
    // Scan for phase signalling
    const lastModelMsg = [...messages].reverse().find(m => m.role === 'model');
    if (lastModelMsg) {
      const match = lastModelMsg.content.match(/\[PHASE: (\d)\]/);
      if (match) setCurrentPhase(parseInt(match[1]) as PipelinePhase);
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    onSendMessage(input, attachments);
    setInput('');
    setAttachments([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await file.arrayBuffer();
        const text = await (async () => {
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }
          return fullText;
        })();
        setAttachments(prev => [...prev, { name: file.name, content: text, type: 'pdf' }]);
      } else {
        const text = await file.text();
        setAttachments(prev => [...prev, { name: file.name, content: text, type: 'text' }]);
      }
    } catch (err: any) { 
      console.error("PDF Parse Error:", err);
      alert("Failed to process file: " + (err.message || "Unknown error")); 
    }
    finally { setIsProcessingFile(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const renderMessageContent = (msg: ChatMessage) => {
    // Regex to capture Python, SYSTEM_KB, STUDY_KB, HASH_MEMORY_KB, BELIEFS_KB and SYSTEM_KB_CANDIDATE blocks
    const parts = msg.content.split(/(```(?:python|SYSTEM_KB|SYSTEM_KB_CANDIDATE|STUDY_KB|HASH_MEMORY_KB|BELIEFS_KB)[\s\S]*?```)/g);
    
    return parts.map((part, idx) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const header = lines[0].replace('```', '');
        const code = lines.slice(1, -1).join('\n').trim();
        
        let label = "Source Code";
        let color = "bg-gray-800";
        let action: (() => void) | null = null;
        let actionLabel = "Inject";

        if (header === 'python') {
          label = "Python Script";
          color = "bg-gray-800";
          action = () => onExtractCode(code);
          actionLabel = "To Editor";
        } else if (header === 'SYSTEM_KB' || header === 'SYSTEM_KB_CANDIDATE') {
          label = "Memory Candidate (Proposal)";
          color = "bg-green-900/40 border-green-500/50";
          action = () => onExtractToKB('system', code);
          actionLabel = "Promote to Memory";
        } else if (header === 'STUDY_KB') {
          label = "Study Observation";
          color = "bg-amber-900/40";
          action = () => onExtractToKB('study', code);
          actionLabel = "Add to KB";
        } else if (header === 'HASH_MEMORY_KB') {
          label = "Fingerprint Update";
          color = "bg-purple-900/40";
          action = () => onExtractToKB('hash', code);
          actionLabel = "Log Fingerprint";
        } else if (header === 'BELIEFS_KB') {
          label = "Belief Structure Update";
          color = "bg-pink-900/40";
          action = () => onExtractToKB('beliefs', code);
          actionLabel = "Update Beliefs";
        }

        return (
          <div key={idx} className={`my-3 rounded overflow-hidden border border-white/10 ${color}`}>
            <div className="flex justify-between items-center px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/70">{label}</span>
              {action && (
                <button 
                  type="button" 
                  onClick={action} 
                  className="text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded transition-all flex items-center gap-1 shadow-md"
                >
                  {actionLabel}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                </button>
              )}
            </div>
            <pre className="p-3 overflow-x-auto text-xs font-mono text-white/80 leading-relaxed whitespace-pre-wrap">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return <span key={idx} className="whitespace-pre-wrap">{part.replace(/\[PHASE: \d\]/, '').trim()}</span>;
    });
  };

  const phases = [
    { id: 1, label: 'Initiation' },
    { id: 2, label: 'Development' },
    { id: 3, label: 'Distillation' },
    { id: 4, label: 'Promotion' },
    { id: 5, label: 'Archival' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#111] border-r border-gray-800">
      <div className="p-4 border-b border-gray-800 bg-[#151515] shrink-0">
        <h2 className="text-[11px] font-black text-white flex items-center gap-2 uppercase tracking-[0.25em] mb-3">
          Assistant v4.2.7 Memory
        </h2>
        <div className="flex items-center gap-1">
          {phases.map((p) => (
            <div 
              key={p.id} 
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${currentPhase && p.id <= currentPhase ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'bg-gray-800'}`}
              title={`${p.label} Phase`}
            />
          ))}
        </div>
        {currentPhase && (
          <div className="text-[9px] text-purple-400 font-bold mt-2 uppercase tracking-widest text-center">
            Phase {currentPhase}: {phases[currentPhase - 1].label}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-none">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[95%] rounded p-4 text-xs shadow-xl leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-white/5 text-gray-100 border border-white/5' 
                : 'bg-black/40 text-gray-300 border border-white/5'
            }`}>
               {/* Thinking/Reasoning Trace */}
               {msg.thought && (
                 <details className="mb-4 group">
                    <summary className="cursor-pointer text-[10px] text-purple-400 font-bold uppercase tracking-widest flex items-center gap-2 select-none opacity-70 hover:opacity-100">
                       <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                       <span>Cognitive Trace</span>
                    </summary>
                    <div className="mt-2 pl-3 border-l-2 border-purple-500/20 text-gray-500 font-mono text-[10px] whitespace-pre-wrap bg-black/20 p-2 rounded">
                        {msg.thought}
                    </div>
                 </details>
               )}
               
               {/* Attachments Display */}
               {msg.attachments && msg.attachments.length > 0 && (
                 <div className="flex flex-wrap gap-2 mb-3">
                   {msg.attachments.map((doc, idx) => (
                     <div key={idx} className="flex items-center gap-1.5 bg-black/30 border border-white/10 px-2 py-1 rounded text-[10px] text-gray-400">
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                       <span className="truncate max-w-[150px]">{doc.name}</span>
                     </div>
                   ))}
                 </div>
               )}

               {renderMessageContent(msg)}
               
               {msg.isError && (
                 <div className="mt-4 pt-4 border-t border-red-900/30 flex flex-col gap-3">
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                       Critical Context Overflow Detected
                    </p>
                    <button 
                      onClick={onResetKernel}
                      className="bg-red-900/50 hover:bg-red-800 text-white px-4 py-2 rounded text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 border border-red-700/50 transition-all"
                    >
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                       Reset Kernel (Clear Context)
                    </button>
                 </div>
               )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start px-4">
             <div className="flex gap-1.5 items-center bg-white/5 px-4 py-2 rounded-full border border-white/5">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
             </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 bg-[#151515] border-t border-gray-800 shrink-0 flex flex-col gap-2">
        {/* Attachment Area (Above Input) */}
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".txt,.md,.pdf,.json,.csv" />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()} 
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded border border-white/10 transition-all text-[10px] font-bold uppercase tracking-wider"
            title="Attach Document"
          >
             <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
             Attach File
          </button>

          {attachments.map((doc, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 px-2 py-1 rounded text-[10px]">
               <span className="truncate max-w-[120px] text-purple-200">{doc.name}</span>
               <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-purple-400 hover:text-red-400 transition-colors">×</button>
            </div>
          ))}
          
          {isProcessingFile && (
            <span className="text-[10px] text-gray-500 animate-pulse">Processing...</span>
          )}
        </div>

        {/* Input Row */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Follow the pipeline protocol..."
            className="flex-1 bg-black border border-white/5 rounded px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-900/50"
          />
          <button type="submit" disabled={isLoading || (!input.trim() && attachments.length === 0)} className="flex-none bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 text-white px-4 py-2.5 rounded transition-all flex items-center justify-center" title="Send Message">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
};
