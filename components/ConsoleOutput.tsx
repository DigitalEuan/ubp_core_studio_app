
import React, { useEffect, useRef } from 'react';
import { ConsoleEntry } from '../types';

interface ConsoleOutputProps {
  logs: ConsoleEntry[];
  hideHeader?: boolean;
}

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ logs, hideHeader }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col h-full bg-black border border-gray-800 rounded-lg overflow-hidden font-mono shadow-inner">
      {!hideHeader && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">System Output</span>
          <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 opacity-50"></div>
              <div className="w-2 h-2 rounded-full bg-yellow-500 opacity-50"></div>
              <div className="w-2 h-2 rounded-full bg-green-500 opacity-50"></div>
          </div>
        </div>
      )}
      <div 
        ref={scrollRef}
        className="flex-1 p-2 overflow-y-auto space-y-2 bg-[#0a0a0a]"
      >
        {logs.length === 0 && (
            <div className="text-gray-600 italic p-4 text-sm text-center">Ready for execution...</div>
        )}
        
        {logs.map((log) => (
            <div key={log.id} className="rounded border border-white/5 bg-[#111] overflow-hidden group">
                {/* Block Header */}
                <div className="flex justify-between items-center px-2 py-1 bg-white/5 border-b border-white/5">
                    <div className="flex items-center gap-2">
                         <span className={`text-[10px] font-bold uppercase px-1 rounded ${
                             log.type === 'error' ? 'bg-red-900/50 text-red-400' :
                             log.type === 'stderr' ? 'bg-yellow-900/50 text-yellow-400' :
                             log.type === 'system' ? 'bg-blue-900/50 text-blue-400' :
                             'bg-green-900/50 text-green-400'
                         }`}>{log.type}</span>
                         <span className="text-[10px] text-gray-600">
                             {new Date(log.timestamp).toLocaleTimeString()}
                         </span>
                    </div>
                    <button 
                        onClick={() => copyToClipboard(log.content)}
                        className="text-[10px] text-gray-500 hover:text-white uppercase opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Copy
                    </button>
                </div>
                {/* Block Content */}
                <pre className={`p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words ${
                    log.type === 'error' ? 'text-red-300' :
                    log.type === 'stderr' ? 'text-yellow-200' :
                    log.type === 'system' ? 'text-blue-200 italic' :
                    'text-gray-300'
                }`}>
                    {log.content}
                </pre>
            </div>
        ))}
      </div>
    </div>
  );
};
