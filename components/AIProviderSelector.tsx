
import React, { useState, useEffect } from 'react';

interface AIProvider {
  id: 'gemini' | 'ollama' | 'lm-studio' | 'gpt4all';
  name: string;
  description: string;
  type: 'cloud' | 'local';
  icon: string;
  status: 'available' | 'unavailable' | 'checking';
  models: string[];
}

interface AIProviderSelectorProps {
  selectedProvider: 'gemini' | 'ollama' | 'lm-studio' | 'gpt4all';
  selectedModel: string;
  onProviderChange: (provider: 'gemini' | 'ollama' | 'lm-studio' | 'gpt4all') => void;
  onModelChange: (model: string) => void;
  onCheckLocalLLM?: () => Promise<void>;
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  onCheckLocalLLM,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [providers, setProviders] = useState<AIProvider[]>([
    {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Cloud-based AI (requires API key)',
      type: 'cloud',
      icon: '☁️',
      status: 'available',
      models: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
    },
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Local LLM (Mac/Linux/Windows)',
      type: 'local',
      icon: '🦙',
      status: 'checking',
      models: [],
    },
    {
      id: 'lm-studio',
      name: 'LM Studio',
      description: 'Local LLM with GUI (Mac/Windows)',
      type: 'local',
      icon: '🎬',
      status: 'checking',
      models: [],
    },
    {
      id: 'gpt4all',
      name: 'GPT4All',
      description: 'Lightweight local LLM (Mac/Windows/Linux)',
      type: 'local',
      icon: '⚡',
      status: 'checking',
      models: [],
    },
  ]);

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  useEffect(() => {
    if (onCheckLocalLLM) {
      onCheckLocalLLM();
    }
  }, [onCheckLocalLLM]);

  const handleProviderClick = (providerId: string) => {
    onProviderChange(providerId as any);
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  };

  const selectedProviderData = providers.find(p => p.id === selectedProvider);

  return (
    <div className="ai-provider-selector bg-gray-900 border-b border-gray-700">
      {/* Compact Header / Toggle */}
      <div 
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
            <span className="text-xl">{selectedProviderData?.icon || '🤖'}</span>
            <div className="flex flex-col">
                <span className="text-sm font-bold text-cyan-400">{selectedProviderData?.name || 'Select AI'}</span>
                <span className="text-[10px] text-gray-500">{selectedModel}</span>
            </div>
        </div>
        <button className="text-gray-500 hover:text-white transform transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            ▼
        </button>
      </div>

      {/* Expanded Content */}
      {!isCollapsed && (
          <div className="p-4 border-t border-gray-800 space-y-4 bg-gray-900/95 absolute z-50 w-80 shadow-2xl">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-300">Select Provider</h3>
                <button
                onClick={(e) => { e.stopPropagation(); setShowSetupGuide(!showSetupGuide); }}
                className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                >
                {showSetupGuide ? 'Hide' : 'Setup'} Guide
                </button>
            </div>

            {/* Provider List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                {providers.map(provider => (
                <div key={provider.id} className="space-y-1">
                    {/* Provider Button */}
                    <button
                    onClick={(e) => { e.stopPropagation(); handleProviderClick(provider.id); }}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                        selectedProvider === provider.id
                        ? 'bg-cyan-600 text-white font-semibold'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    >
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{provider.icon}</span>
                        <div>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-[10px] opacity-75">{provider.type}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        provider.status === 'available'
                            ? 'bg-green-900 text-green-300'
                            : provider.status === 'checking'
                            ? 'bg-yellow-900 text-yellow-300'
                            : 'bg-red-900 text-red-300'
                        }`}>
                        {provider.status === 'available' ? '✓' : provider.status === 'checking' ? '...' : '✗'}
                        </span>
                    </div>
                    </button>

                    {/* Provider Details (Nested) */}
                    {expandedProvider === provider.id && (
                    <div className="bg-gray-950 border border-gray-700 rounded p-3 ml-2 space-y-2 text-xs">
                        <div className="text-gray-400">{provider.description}</div>
                        
                        {provider.models.length > 0 && (
                        <div>
                            <div className="text-gray-500 mb-1">Models:</div>
                            <div className="space-y-1 ml-2">
                            {provider.models.map(model => (
                                <button
                                key={model}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onProviderChange(provider.id);
                                    onModelChange(model);
                                }}
                                className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                                    selectedProvider === provider.id && selectedModel === model
                                    ? 'bg-cyan-600/50 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                                >
                                {model}
                                </button>
                            ))}
                            </div>
                        </div>
                        )}
                    </div>
                    )}
                </div>
                ))}
            </div>

            {/* Setup Guide */}
            {showSetupGuide && (
                <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3 text-xs text-gray-300">
                <div className="font-semibold text-cyan-400">Local LLM Setup</div>
                <div className="space-y-2">
                    <div>
                    <div className="font-bold text-gray-300">🦙 Ollama</div>
                    <code className="block bg-black p-1 rounded mt-1 text-gray-400">brew install ollama && ollama serve</code>
                    </div>
                    <div className="text-yellow-400 italic">
                    Ensure server is running on localhost (default ports).
                    </div>
                </div>
                </div>
            )}
          </div>
      )}
    </div>
  );
};
