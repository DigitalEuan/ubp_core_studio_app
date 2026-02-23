
import React, { useMemo, useState } from 'react';

interface MemoryStatusProps {
  systemKb: string;
  hashMemoryKb: string;
  beliefsKb: string;
  studyKb?: string;
}

interface ParsedEntry {
  id: string;
  name: string;
  tags: string[];
  fingerprint?: string;
  nrci?: number;
  raw: string;
  category: string; // Now represents Geometric Domain
}

interface ParsedBelief {
    id: string;
    description: string;
    certainty?: string;
}

interface CategoryStat {
  code: string;
  count: number;
  description: string;
  percent: string;
}

export const MemoryStatus: React.FC<MemoryStatusProps> = ({ systemKb, hashMemoryKb, beliefsKb, studyKb }) => {

  const { parsedSystem, categoryStats } = useMemo(() => {
    const entries: ParsedEntry[] = [];
    let validJsonCount = 0;
    let markdownCount = 0;

    // --- GEOMETRIC DOMAIN MAPPER (The Octad) ---
    const categorize = (id: string, name: string, tags: string[] = []): string => {
        const upperId = id.toUpperCase().trim();
        const combined = [...tags, name].map(s => s.toUpperCase().trim());
        
        // 0. ID Override (Highest Priority for UBP Laws)
        // If the ID itself declares it is a LAW, it is Imperative regardless of tags like #physics.
        if (upperId.startsWith('LAW_')) return 'IMPERATIVE';

        // 1. Explicit Geometric Tags (High Priority)
        if (combined.includes('SUBSTANCE')) return 'SUBSTANCE';
        if (combined.includes('ORGANISM')) return 'ORGANISM';
        if (combined.includes('ALGORITHM')) return 'ALGORITHM';
        if (combined.includes('QUANTITY')) return 'QUANTITY';
        if (combined.includes('MECHANISM')) return 'MECHANISM';
        if (combined.includes('IMPERATIVE')) return 'IMPERATIVE';
        if (combined.includes('ENTROPY')) return 'ENTROPY';
        if (combined.includes('MEANING')) return 'MEANING';

        // 2. Specific Subject Mapping (Subject Tags -> Geometric Domain)
        
        // MEANING: English, Vocabulary, Language
        if (combined.some(s => s === 'ENGLISH' || s === 'VOCABULARY' || s.includes('VOCAB'))) return 'MEANING';

        // MECHANISM: Physics, Earth Science
        if (combined.some(s => s === 'PHYSICS' || s === 'EARTH' || s.includes('EARTH_SCIENCE'))) return 'MECHANISM';

        // QUANTITY: Math, Mathematics
        if (combined.some(s => s === 'MATH' || s === 'MATHEMATICS')) return 'QUANTITY';

        // SUBSTANCE: Chemistry
        if (combined.some(s => s === 'CHEMISTRY')) return 'SUBSTANCE';

        // ORGANISM: Psychology, Biology
        if (combined.some(s => s === 'PSYCHOLOGY' || s === 'BIOLOGY')) return 'ORGANISM';

        // ALGORITHM: Python, CS
        if (combined.some(s => s === 'PYTHON' || s === 'CS' || s === 'COMPUTER SCIENCE')) return 'ALGORITHM';


        // 3. Comprehensive Pattern Inference (Broad Keywords)

        // IMPERATIVE: Laws, Rules (Only if not caught by specific subjects above, and not a LAW_ ID which is already handled)
        if (combined.some(s => 
            s.includes('LAW') || s.includes('RULE') || s.includes('AXIOM') || 
            s.includes('STANDARD') || s.includes('PRINCIPLE') || s.includes('REQ') || 
            s.includes('PROTOCOL') || s.includes('COMMAND')
        )) return 'IMPERATIVE';

        // SUBSTANCE: Elements, Matter, Periodic Table, Materials
        if (combined.some(s => 
            s.includes('ELEMENT') || s.includes('PERIODIC') || s.includes('METAL') || 
            s.includes('GAS') || s.includes('LIQUID') || s.includes('MATTER') || 
            s.includes('ATOM') || s.includes('MOLECULE') || s.includes('CHEMICAL') ||
            s.includes('MINERAL') || s.includes('PLASTIC') || s.includes('GRAPHENE') ||
            s.startsWith('MAT_') || s.startsWith('ELEM_')
        )) return 'SUBSTANCE';
        
        // ORGANISM: Biology, Life, Health, Complex Systems
        if (combined.some(s => 
            s.includes('BIO') || s.includes('LIFE') || s.includes('CELL') || 
            s.includes('DNA') || s.includes('ORGANIC') || s.includes('ANIMAL') || 
            s.includes('PLANT') || s.includes('FUNGUS') || s.includes('HEALTH') ||
            s.includes('NEURO') || s.includes('BODY') || s.includes('CANCER')
        )) return 'ORGANISM';
        
        // ALGORITHM: Code, Logic, Information, Processes
        if (combined.some(s => 
            s.includes('ALGO') || s.includes('CODE') || s.includes('LOGIC') || 
            s.includes('COMPUTE') || s.includes('DATA') || s.includes('PROCESS') || 
            s.includes('FUNCTION') || s.includes('NETWORK') || s.includes('SYSTEM') ||
            s.includes('INFO') || s.includes('FRACTAL')
        )) return 'ALGORITHM';
        
        // QUANTITY: Numbers, Constants, Measurements, Geometry
        if (combined.some(s => 
            s.includes('NUM') || s.includes('CONST') || s.includes('UNIT') || 
            s.includes('MEASURE') || s.includes('VALUE') || s.includes('RATIO') || 
            s.includes('METRIC') || s.includes('COORDINATE') || s.includes('DIMENSION') ||
            s.includes('GEOMETRY') || s.includes('SHAPE') || s.startsWith('BIN_')
        )) return 'QUANTITY';
        
        // MECHANISM: Physics, Energy, Forces
        if (combined.some(s => 
            s.includes('MECH') || s.includes('PHYS') || s.includes('ENERGY') || 
            s.includes('FORCE') || s.includes('MOTION') || s.includes('WAVE') || 
            s.includes('PARTICLE') || s.includes('REACT') || s.includes('KINETIC')
        )) return 'MECHANISM';
        
        // ENTROPY: Chaos, Void, Errors
        if (combined.some(s => 
            s.includes('CHAOS') || s.includes('VOID') || s.includes('NULL') || 
            s.includes('ERROR') || s.includes('DECAY') || s.includes('NOISE') || 
            s.includes('UNKNOWN') || s.includes('RANDOM')
        )) return 'ENTROPY';
        
        // MEANING: Language, Semantics, Concepts
        if (combined.some(s => 
            s.includes('WORD') || s.includes('TERM') || s.includes('SEMANTIC') || 
            s.includes('CONCEPT') || s.includes('IDEA') || s.includes('SYMBOL') || 
            s.includes('DEFINITION') || s.includes('LANG')
        )) return 'MEANING';

        return 'UNCATEGORIZED'; 
    };

    // 1. Try to parse as a big JSON object/array
    try {
        const json = JSON.parse(systemKb || "[]");
        const list = Array.isArray(json) ? json : Object.values(json);
        list.forEach((item: any) => {
            const tags = item.tags || [];
            const id = item.ubp_id || 'UNKNOWN';
            const name = item.name || 'Untitled';
            entries.push({
                id: id,
                name: name,
                tags: tags,
                fingerprint: item.fingerprint,
                nrci: item.nrci,
                raw: 'JSON Object',
                category: categorize(id, name, tags)
            });
            validJsonCount++;
        });
    } catch (e) {
        // 2. Fallback to Markdown Line Parsing
        const lines = (systemKb || "").split('\n');
        lines.forEach(line => {
            const match = line.match(/^\- \[(.*?)\] \*\*(.*?)\*\*: (.*)/);
            if (match) {
                const content = match[3];
                const tagMatch = content.match(/Tags: (.*?)$/);
                const tags = tagMatch ? tagMatch[1].split(',').map(t => t.trim()) : [];
                const name = content.split('\n')[0]; 
                const id = match[2];

                entries.push({
                    id: id,
                    name: name,
                    tags: tags,
                    raw: 'Markdown Line',
                    category: categorize(id, name, tags)
                });
                markdownCount++;
            } else if (line.trim().startsWith('{')) {
                try {
                   const item = JSON.parse(line.trim().replace(/,$/, ''));
                   const tags = item.tags || [];
                   const id = item.ubp_id || 'UNKNOWN';
                   const name = item.name || 'Untitled';
                   entries.push({
                       id: id,
                       name: name,
                       tags: tags,
                       fingerprint: item.fingerprint,
                       nrci: item.nrci,
                       raw: 'JSON Line',
                       category: categorize(id, name, tags)
                   });
                   validJsonCount++;
                } catch(err) {}
            }
        });
    }

    // Aggregate Stats
    const statsMap: Record<string, number> = {};
    const total = entries.length;
    entries.forEach(e => {
        statsMap[e.category] = (statsMap[e.category] || 0) + 1;
    });

    const categoryStats: CategoryStat[] = Object.entries(statsMap)
        .map(([code, count]) => {
            let desc = "Unknown Domain";
            switch(code) {
                case 'SUBSTANCE': desc = "Stable Matter & Elements (Bit 12=1)"; break;
                case 'ORGANISM': desc = "Biological & Complex Systems"; break;
                case 'ALGORITHM': desc = "Logic, Code & Information"; break;
                case 'QUANTITY': desc = "Pure Magnitude & Constants (Bit 12=0)"; break;
                case 'MECHANISM': desc = "Physical Interactions & Reactions"; break;
                case 'IMPERATIVE': desc = "System Laws & Constraints"; break;
                case 'ENTROPY': desc = "Chaos, Void & Dissolution"; break;
                case 'MEANING': desc = "Semantic & Linguistic Value"; break;
            }
            return { 
                code, 
                count, 
                description: desc,
                percent: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%'
            };
        })
        .sort((a, b) => b.count - a.count);

    return { parsedSystem: { entries, validJsonCount, markdownCount }, categoryStats };
  }, [systemKb]);

  const parsedBeliefs = useMemo(() => {
     const list: ParsedBelief[] = [];
     try {
         const json = JSON.parse(beliefsKb || "{}");
         
         if (Array.isArray(json)) {
             json.forEach((item: any) => {
                 list.push({
                     id: item.ubp_id || item.id || item.name || 'Unknown',
                     description: item.description || item.name || 'No Description',
                     certainty: item.nrci_score ? `NRCI: ${item.nrci_score}` : undefined
                 });
             });
         } else if (typeof json === 'object' && json !== null) {
             // Dictionary Format
             Object.entries(json).forEach(([key, value]: [string, any]) => {
                 list.push({
                     id: key, // The Key is the ID (e.g. BELIEF_SUBSTRATE_001)
                     description: value.name || value.description || 'No Description',
                     certainty: value.nrci_score ? `NRCI: ${value.nrci_score}` : undefined
                 });
             });
         }
     } catch (e) { }
     return list;
  }, [beliefsKb]);

  const parsedHash = useMemo(() => {
     let count = 0;
     const targetKb = hashMemoryKb || "";
     try {
         const json = JSON.parse(targetKb);
         if (typeof json === 'object') {
             count = Array.isArray(json) ? json.length : Object.keys(json).length;
         }
     } catch (e) {
         // Fallback to text lines just in case
         const lines = targetKb.split('\n');
         lines.forEach(line => {
             const trimmed = line.trim();
             if (!trimmed || trimmed.startsWith('#')) return;
             // Basic heuristic for line counting if JSON fails
             if (trimmed.length > 5) count++;
         });
     }
     return count;
  }, [hashMemoryKb]);

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showBeliefs, setShowBeliefs] = useState(false);

  // Filter entries if a category row is clicked
  const filteredEntries = useMemo(() => {
    if (!expandedCategory) return parsedSystem.entries;
    return parsedSystem.entries.filter(e => e.category === expandedCategory);
  }, [parsedSystem.entries, expandedCategory]);

  return (
    <div className="flex flex-col h-full bg-[#111] overflow-hidden">
      
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-2 p-4 border-b border-gray-800 bg-[#151515]">
        <div className="bg-purple-900/20 border border-purple-500/30 p-3 rounded">
            <div className="text-[10px] uppercase text-purple-400 font-bold tracking-widest">Geometric Nodes</div>
            <div className="text-2xl font-mono text-white">{parsedSystem.entries.length}</div>
        </div>
        <div 
             onClick={() => setShowBeliefs(!showBeliefs)}
             className={`p-3 rounded border cursor-pointer transition-colors ${showBeliefs ? 'bg-pink-900/30 border-pink-500' : 'bg-pink-900/20 border-pink-500/30 hover:bg-pink-900/30'}`}
        >
            <div className="text-[10px] uppercase text-pink-400 font-bold tracking-widest">Belief Structures</div>
            <div className="text-xl font-mono text-white">
                {parsedBeliefs.length}
            </div>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 p-3 rounded">
             <div className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Active Hash</div>
             <div className="text-xl font-mono text-white">{parsedHash} keys</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
         
         {showBeliefs ? (
             <div className="space-y-2">
                 <h3 className="text-xs font-bold text-pink-500 uppercase tracking-widest mb-2">Understanding Structures (Beliefs)</h3>
                 {parsedBeliefs.length === 0 ? (
                     <div className="text-gray-500 italic text-sm">No defined beliefs.</div>
                 ) : (
                     parsedBeliefs.map((b, idx) => (
                         <div key={idx} className="bg-[#1a1a1a] border border-gray-800 p-3 rounded border-l-2 border-l-pink-500">
                             <div className="flex justify-between">
                                 <span className="text-xs font-bold text-pink-300 font-mono">{b.id}</span>
                                 {b.certainty && <span className="text-[9px] bg-gray-800 px-1 rounded text-gray-400">{b.certainty}</span>}
                             </div>
                             <div className="text-xs text-gray-400 mt-1">{b.description}</div>
                         </div>
                     ))
                 )}
                 <button onClick={() => setShowBeliefs(false)} className="mt-4 text-xs text-blue-400 hover:underline">← Back to Geometric Registry</button>
             </div>
         ) : (
             <>
                {/* Category Table */}
                <div className="mb-6 border border-gray-800 rounded overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#1a1a1a] border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-widest">
                                <th className="p-2 pl-3 font-bold">Geometric Domain</th>
                                <th className="p-2 font-bold">Count</th>
                                <th className="p-2 font-bold text-right">%</th>
                                <th className="p-2 font-bold">Description</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-mono">
                            {categoryStats.length === 0 ? (
                                <tr><td colSpan={4} className="p-3 text-center text-gray-600">No geometric data available.</td></tr>
                            ) : (
                                categoryStats.map((stat) => (
                                    <tr 
                                        key={stat.code} 
                                        onClick={() => setExpandedCategory(expandedCategory === stat.code ? null : stat.code)}
                                        className={`cursor-pointer transition-colors ${expandedCategory === stat.code ? 'bg-purple-900/20 text-white' : 'hover:bg-[#222] text-gray-400'}`}
                                    >
                                        <td className={`p-2 pl-3 font-bold ${expandedCategory === stat.code ? 'text-purple-400' : 'text-gray-500'}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${
                                                    stat.code === 'SUBSTANCE' ? 'bg-orange-500' :
                                                    stat.code === 'ORGANISM' ? 'bg-green-500' :
                                                    stat.code === 'ALGORITHM' ? 'bg-blue-500' :
                                                    stat.code === 'QUANTITY' ? 'bg-red-500' :
                                                    'bg-gray-500'
                                                }`} />
                                                {stat.code}
                                            </div>
                                        </td>
                                        <td className="p-2 text-white">{stat.count}</td>
                                        <td className="p-2 text-right text-gray-400">{stat.percent}</td>
                                        <td className="p-2 text-gray-500 italic">{stat.description}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-between items-end mb-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {expandedCategory ? `Domain: ${expandedCategory}` : 'Full Geometric Registry'}
                    </h3>
                    {expandedCategory && (
                        <button onClick={() => setExpandedCategory(null)} className="text-[10px] text-blue-400 hover:text-white uppercase">Show All</button>
                    )}
                </div>
                
                <div className="space-y-2">
                    {filteredEntries.length === 0 ? (
                        <div className="text-center p-8 text-gray-600 italic border border-dashed border-gray-800 rounded">
                            Memory is empty or unreadable.
                        </div>
                    ) : (
                        filteredEntries.map((entry, idx) => (
                            <div key={idx} className="bg-[#1a1a1a] border border-gray-800 p-3 rounded hover:border-purple-500/50 transition-colors group">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border border-white/10 ${
                                            entry.category === 'SUBSTANCE' ? 'bg-orange-900/40 text-orange-400' :
                                            entry.category === 'ORGANISM' ? 'bg-green-900/40 text-green-400' :
                                            entry.category === 'ALGORITHM' ? 'bg-blue-900/40 text-blue-400' :
                                            entry.category === 'QUANTITY' ? 'bg-red-900/40 text-red-400' :
                                            'bg-gray-800 text-gray-500'
                                        }`}>{entry.category}</span>
                                        <span className="text-sm font-bold text-gray-200 font-mono group-hover:text-white transition-colors">{entry.id}</span>
                                    </div>
                                    {entry.nrci && (
                                        <span className={`text-[9px] px-1.5 rounded ${entry.nrci >= 0.5 ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                                            NRCI: {entry.nrci}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-400 mb-2 pl-1">{entry.name}</div>
                                
                                <div className="flex flex-wrap gap-2 items-center">
                                    {entry.tags.map((tag, tIdx) => (
                                        <span key={tIdx} className="text-[9px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded border border-gray-700">#{tag}</span>
                                    ))}
                                    {entry.fingerprint && (
                                        <span className="text-[9px] font-mono text-gray-600 bg-black px-1 rounded truncate max-w-[100px]" title={entry.fingerprint}>
                                            {entry.fingerprint.substring(0, 8)}...
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
             </>
         )}
      </div>
      
      <div className="p-2 border-t border-gray-800 bg-[#0d0d0d] text-[10px] text-gray-500 text-center font-mono">
          UBP Geometric Categorization Engine (Octad v1.0)
      </div>
    </div>
  );
};
