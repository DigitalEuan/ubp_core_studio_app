
import React, { useRef, useState, useEffect } from 'react';

interface CodeEditorProps {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  label: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, readOnly, label }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  
  // Search State
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMatchInfo, setSearchMatchInfo] = useState('');

  useEffect(() => {
    const lines = code.split('\n').length;
    setLineCount(lines);
  }, [code]);

  const handleScroll = () => {
    if (textareaRef.current) {
      setScrollTop(textareaRef.current.scrollTop);
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    }
  };

  const handleSearch = () => {
    if (!textareaRef.current || !searchTerm) return;
    
    const text = textareaRef.current.value;
    const currentPos = textareaRef.current.selectionEnd;
    
    // Find next
    let nextIndex = text.indexOf(searchTerm, currentPos);
    
    // Wrap around
    if (nextIndex === -1) {
      nextIndex = text.indexOf(searchTerm);
    }
    
    if (nextIndex !== -1) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextIndex, nextIndex + searchTerm.length);
      
      // Scroll to view (rough estimation)
      const linesBefore = text.substring(0, nextIndex).split('\n').length;
      const lineHeight = 20; // approximate
      const newScrollTop = (linesBefore - 5) * lineHeight;
      textareaRef.current.scrollTop = newScrollTop > 0 ? newScrollTop : 0;
      handleScroll(); // Sync lines
      
      setSearchMatchInfo(`Found at line ${linesBefore}`);
    } else {
      setSearchMatchInfo('Not found');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      // Ctrl+F or Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          setShowSearch(true);
      }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-gray-700 rounded-lg overflow-hidden shadow-xl" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
        <div className="flex items-center gap-4">
            <span className="text-sm font-mono text-gray-300 font-bold">{label}</span>
            <span className="text-xs text-gray-500">{lineCount} lines</span>
        </div>
        
        <div className="flex items-center gap-2">
            {showSearch ? (
                <div className="flex items-center bg-gray-800 rounded px-1 py-0.5 border border-gray-600">
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Find..."
                        className="bg-transparent border-none text-xs text-white focus:outline-none w-32 px-1"
                        autoFocus
                    />
                    <button onClick={handleSearch} className="text-gray-400 hover:text-white px-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </button>
                    <button onClick={() => { setShowSearch(false); setSearchMatchInfo(''); }} className="text-gray-500 hover:text-red-400 px-1 ml-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    {searchMatchInfo && <span className="text-[10px] text-gray-400 ml-2 whitespace-nowrap">{searchMatchInfo}</span>}
                </div>
            ) : (
                <button 
                    onClick={() => setShowSearch(true)} 
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1 bg-gray-800 px-2 py-1 rounded"
                    title="Find (Ctrl+F)"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    Search
                </button>
            )}
            
            {readOnly && <span className="text-xs text-yellow-500 font-mono">[Read Only]</span>}
        </div>
      </div>
      
      <div className="relative flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div 
            ref={lineNumbersRef}
            className="flex-none w-12 bg-[#252525] text-gray-600 text-right pr-3 pt-4 select-none overflow-hidden"
            style={{ fontFamily: '"Fira Code", "Menlo", monospace', fontSize: '14px', lineHeight: '1.5' }}
        >
            {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
            ))}
        </div>

        {/* Editor */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          readOnly={readOnly}
          spellCheck={false}
          className={`flex-1 h-full p-4 pl-2 font-mono text-sm leading-relaxed resize-none focus:outline-none bg-[#1e1e1e] text-gray-300 overflow-auto ${
            readOnly ? 'opacity-90' : ''
          }`}
          style={{
            fontFamily: '"Fira Code", "Menlo", "Monaco", "Courier New", monospace',
            tabSize: 4,
            fontSize: '14px',
            lineHeight: '1.5',
            whiteSpace: 'pre'
          }}
        />
      </div>
    </div>
  );
};
