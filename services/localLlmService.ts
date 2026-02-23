
/**
 * LOCAL LLM SERVICE FOR MAC
 * ========================
 * Provides integration with lightweight LLMs running locally on Mac (CPU-based).
 * Supports: Ollama, LM Studio, GPT4All
 * 
 * This service runs alongside Gemini as an alternative option, not a replacement.
 */

import { FileTab, AttachedDoc } from '../types';

export interface LocalLLMConfig {
  provider: 'ollama' | 'lm-studio' | 'gpt4all';
  baseUrl: string;
  model: string;
  port: number;
}

export interface LocalLLMResponse {
  text: string;
  model: string;
  provider: string;
  executionTime: number;
}

export class LocalLLMService {
  private config: LocalLLMConfig;
  private isAvailable: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor(config: LocalLLMConfig) {
    this.config = config;
    this.initializeConfig();
  }

  private initializeConfig() {
    // Set defaults based on provider
    switch (this.config.provider) {
      case 'ollama':
        this.config.baseUrl = this.config.baseUrl || 'http://localhost:11434';
        this.config.port = this.config.port || 11434;
        this.config.model = this.config.model || 'neural-chat'; // Lightweight model
        break;
      case 'lm-studio':
        this.config.baseUrl = this.config.baseUrl || 'http://localhost:1234';
        this.config.port = this.config.port || 1234;
        this.config.model = this.config.model || 'local-model';
        break;
      case 'gpt4all':
        this.config.baseUrl = this.config.baseUrl || 'http://localhost:4891';
        this.config.port = this.config.port || 4891;
        this.config.model = this.config.model || 'mistral-7b';
        break;
    }
  }

  /**
   * Check if local LLM is available
   */
  async isServiceAvailable(): Promise<boolean> {
    const now = Date.now();
    
    // Use cached result if recent
    if (this.lastHealthCheck > 0 && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);
      
      clearTimeout(timeoutId);

      this.isAvailable = response?.ok ?? false;
      this.lastHealthCheck = now;
      return this.isAvailable;
    } catch (err) {
      this.isAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * Get available models from the local LLM service
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) return [];

      const data = await response.json();
      
      if (this.config.provider === 'ollama') {
        return data.models?.map((m: any) => m.name) || [];
      } else if (this.config.provider === 'lm-studio') {
        return data.data?.map((m: any) => m.id) || [];
      } else if (this.config.provider === 'gpt4all') {
        return data.models || [];
      }
      
      return [];
    } catch (err) {
      console.warn('Failed to fetch available models:', err);
      return [];
    }
  }

  /**
   * Generate response using local LLM
   */
  async generateResponse(
    userMessage: string,
    history: { role: string; content: string }[] = [],
    files: FileTab[] = [],
    systemKb: string = '',
    studyKb: string = '',
    hashMemoryKb: string = ''
  ): Promise<LocalLLMResponse> {
    const startTime = Date.now();

    try {
      // Check service availability
      const available = await this.isServiceAvailable();
      if (!available) {
        throw new Error(`Local LLM service (${this.config.provider}) is not available at ${this.config.baseUrl}`);
      }

      // Build context
      const fileContext = files
        .map(f => `--- File: ${f.name} ---\n${f.content}`)
        .join('\n\n');

      const systemPrompt = `You are the UBP Research Cortex (v4.2.7) running locally on Mac.
You have access to Python (Pyodide) for code execution and can help with:
- UBP (Universal Binary Principle) research
- Python script development
- Mathematical analysis
- Data visualization

WORKSPACE FILES:
${fileContext || 'No files loaded'}

SYSTEM KNOWLEDGE BASE:
${systemKb || 'No system KB loaded'}

STUDY KNOWLEDGE BASE:
${studyKb || 'No study KB loaded'}

HASH MEMORY:
${hashMemoryKb || 'No hash memory loaded'}

Be concise, technical, and focused on UBP research.`;

      // Prepare messages
      const messages = [
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content,
        })),
        {
          role: 'user',
          content: userMessage,
        },
      ];

      // Call appropriate API based on provider
      const response = await this.callLLMAPI(systemPrompt, messages);

      const executionTime = Date.now() - startTime;

      return {
        text: response,
        model: this.config.model,
        provider: this.config.provider,
        executionTime,
      };
    } catch (err: any) {
      throw new Error(`Local LLM Error: ${err.message}`);
    }
  }

  /**
   * Call the appropriate LLM API based on provider
   */
  private async callLLMAPI(systemPrompt: string, messages: any[]): Promise<string> {
    switch (this.config.provider) {
      case 'ollama':
        return this.callOllamaAPI(systemPrompt, messages);
      case 'lm-studio':
        return this.callLMStudioAPI(systemPrompt, messages);
      case 'gpt4all':
        return this.callGPT4AllAPI(systemPrompt, messages);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllamaAPI(systemPrompt: string, messages: any[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: false,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  /**
   * Call LM Studio API
   */
  private async callLMStudioAPI(systemPrompt: string, messages: any[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Call GPT4All API
   */
  private async callGPT4AllAPI(systemPrompt: string, messages: any[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPT4All API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    available: boolean;
    provider: string;
    model: string;
    baseUrl: string;
    port: number;
  }> {
    const available = await this.isServiceAvailable();
    return {
      available,
      provider: this.config.provider,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      port: this.config.port,
    };
  }
}

/**
 * Factory function to create LocalLLMService with sensible defaults
 */
export function createLocalLLMService(provider: 'ollama' | 'lm-studio' | 'gpt4all', model?: string): LocalLLMService {
  const config: LocalLLMConfig = {
    provider,
    baseUrl: '',
    model: model || '',
    port: 0,
  };

  return new LocalLLMService(config);
}