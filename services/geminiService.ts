
import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration, Schema } from '@google/genai';
import { FileTab, AttachedDoc } from '../types';

export class GeminiService {
  private ai: GoogleGenAI;
  private model: string = 'gemini-3-pro-preview';

  constructor(apiKey: string, model?: string) {
    this.ai = new GoogleGenAI({ apiKey });
    if (model) this.model = model;
  }

  // Helper to slice the huge KB into a token-friendly snippet
  private getMemorySnippet(fullKb: string): string {
    const MAX_ENTRIES = 20; 
    
    if (!fullKb) return "Memory Empty.";

    try {
        const data = JSON.parse(fullKb);
        let list = Array.isArray(data) ? data : Object.values(data);
        
        if (list.length > MAX_ENTRIES) {
             const snippet = list.slice(-MAX_ENTRIES);
             return `[... ${list.length - MAX_ENTRIES} older verified entries available in Python HEX_DB ...]\n` + JSON.stringify(snippet, null, 2);
        }
        return fullKb;
    } catch (e) {
        const lines = fullKb.split('\n');
        const entryLines = lines.filter(l => l.trim().startsWith('- [') || l.trim().startsWith('{"ubp_id"'));
        
        if (entryLines.length > MAX_ENTRIES) {
            const header = lines.slice(0, 5).join('\n');
            const tail = lines.slice(-200).join('\n'); 
            return `${header}\n\n... [Middle content truncated. Rely on Reflexive Cortex for retrieval] ...\n\n${tail}`;
        }
        
        if (fullKb.length > 8000) {
            return `[... Start of file truncated ...] \n` + fullKb.slice(-8000);
        }
        return fullKb;
    }
  }

  async extractSearchTerms(userText: string): Promise<any[]> {
    try {
        const extractionModel = this.ai.models;
        const result = await extractionModel.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            math: { type: Type.STRING },
                            language: { type: Type.STRING },
                            script: { type: Type.STRING },
                            keyword: { type: Type.STRING }
                        }
                    }
                }
            },
            contents: {
                role: 'user',
                parts: [{ 
                    text: `Analyze the following user input for 'Universal Binary Principle' search vectors. 
                    Extract explicit Math (fractions/decimals), Language (capitalized terms), Script references, or key concepts.
                    Return a list of potential search vectors.
                    Input: "${userText}"` 
                }]
            }
        });
        
        if (result.text) {
            return JSON.parse(result.text);
        }
        return [];
    } catch (e) {
        console.warn("Search term extraction failed", e);
        return [];
    }
  }

  async generateStudyPlan(
    history: { role: string; content: string }[],
    userMessage: string,
    files: FileTab[],
    systemKb: string,
    studyKb: string,
    hashMemoryKb: string,
    beliefsKb: string,
    instructionManual: string,
    attachments: AttachedDoc[] = []
  ): Promise<{ text: string, thought?: string, groundingUrls?: { title: string; uri: string }[] }> {
    
    // 1. Prepare Context (Files & Attachments)
    const validFiles = files.filter(f => f && f.name);
    
    const fileContext = validFiles.length > 0 
      ? validFiles.map(f => `
=== START FILE: ${f.name} (Type: ${f.type}) ===
${f.content}
=== END FILE: ${f.name} ===
`).join('\n')
      : "NO FILES CURRENTLY OPEN IN WORKSPACE.";

    const attachmentContext = attachments.map(doc => `
=== ATTACHMENT: ${doc.name} ===
${doc.content}
=== END ATTACHMENT ===
`).join('\n');

    // 2. Optimized Memory Context (RAG-Lite)
    const recentSystemMemory = this.getMemorySnippet(systemKb);
    const recentBeliefs = this.getMemorySnippet(beliefsKb);

    // 3. Refined System Instruction
    const systemInstruction = `
You are the **UBP Research Cortex v4.2.7**. Your goal is to design, verify, and document "Universal Binary Principle" (UBP) research.

### CORE ARCHITECTURE & CAPABILITIES:
1.  **Python Kernel (Pyodide):** You can write and execute Python code.
    - **FILE I/O:** You can create persistent files in the workspace (e.g., \`with open('my_data.json', 'w') as f: ...\`). These files immediately appear in the user's file list.
    - **Visualization:** You can generate plots (matplotlib) or 3D scenes (JSON format) which render in the "Visual" tab.
    - **Precision:** Use Python for ALL calculations to avoid floating-point errors.
    - **System Memory:** The system memory is now a structured JSON file (\`ubp_system_kb.json\`).

2.  **Geometric Domains (The Octad):**
    UBP Reality is categorized into 8 Geometric Domains based on Bit 12 logic. Use these categories for organization:
    - **SUBSTANCE:** Stable Matter, Elements, Chemistry.
    - **ORGANISM:** Biology, Life, Complex Systems, Psychology.
    - **ALGORITHM:** Logic, Code, Information, Computer Science.
    - **QUANTITY:** Pure Magnitude, Constants, Math, Geometry.
    - **MECHANISM:** Physics, Energy, Forces, Earth Science.
    - **IMPERATIVE:** Laws, Rules, Standards (e.g., ID starting with LAW_).
    - **ENTROPY:** Chaos, Void, Dissolution, Errors.
    - **MEANING:** Semantic Value, Language, Vocabulary.

3.  **Frame of Mind (FOM):**
    The user can activate specific cognitive biases via the FOM panel. You should suggest switching frames (e.g., "Switch to SCIENTIFIC_STRICT frame") if a task requires specific weighting.

### WORKFLOW (STRICT):
1.  **ANALYZE:** Briefly state the hypothesis.
2.  **CODE:** Write a Python script to calculate the result or generate the data.
    - Use \`from hex_dictionary_v4_exact import HEX_DB_EXACT\` if you need to check existing hashes.
    - If saving data, write it to a file (e.g., \`output.json\`) so the user can see it in the Workspace.
3.  **WAIT:** Do not assume the result. The user must run the code.
4.  **PROPOSE (ONLY IF PROVEN):** If previous output confirms a discovery (NRCI >= 0.5), propose a memory entry.

### MEMORY PROTOCOL:
- **DO NOT** update memory directly.
- **TO PROPOSE AN ENTRY:** Output a code block labeled \`\`\`SYSTEM_KB_CANDIDATE\`.
- Format (JSON Object):
  {
    "ubp_id": "UBP-X.X.XXX",
    "name": "Title",
    "math_value": "...",
    "tags": ["..."],
    "nrci_score": 0.0
  }

### WORKSPACE FILES (VISIBLE):
${fileContext}

### ATTACHED DOCUMENTS:
${attachmentContext || "No attachments."}

### MEMORY CONTEXT:
**System Knowledge Base (JSON Snippet):**
${recentSystemMemory}

**Beliefs & Understanding Structures (JSON Snippet):**
${recentBeliefs}

**Short-Term Hash Index (JSON):**
${hashMemoryKb}
`;

    // 4. Configure Thinking Budget
    const thinkingConfig = (this.model.includes('gemini-3') || this.model.includes('gemini-2.5')) 
      ? { thinkingBudget: 2048 } 
      : undefined;

    // 5. Create Chat Session with Google Search Only (No Memory Tool)
    const chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction,
        temperature: 0.2, 
        thinkingConfig, 
        tools: [
            { googleSearch: {} }
        ], 
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.content }],
      })),
    });

    try {
        // 6. Send Message
        const result: GenerateContentResponse = await chat.sendMessage({
          message: userMessage,
        });

        // 7. Process Response
        let finalText = result.text || "";
        
        // 8. Grounding Metadata
        let groundingUrls: { title: string; uri: string }[] = [];
        const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            groundingUrls = chunks
                .filter((c: any) => c.web?.uri)
                .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));
        }
        
        return { 
            text: finalText, 
            thought: undefined,
            groundingUrls 
        };

    } catch (err: any) {
        console.error("Gemini Generation Error:", err);
        return { text: `**System Error:** ${err.message}\n\nPlease try resetting the kernel.`, thought: undefined };
    }
  }
}
