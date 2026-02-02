'use client';

import { useState } from 'react';

interface RouteRequest {
  prompt: string;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google';
  };
}

interface RouteResponse {
  selectedModel: string;
  reason: string;
  estimatedCost: 'low' | 'medium' | 'high';
  complexity: number;
}

const getStrategyColor = (model: string) => {
  if (model.includes('opus')) return 'text-purple-400';
  if (model.includes('gpt-4o') && !model.includes('mini')) return 'text-blue-400';
  if (model.includes('sonnet')) return 'text-green-400';
  if (model.includes('mini') || model.includes('flash')) return 'text-yellow-400';
  return 'text-gray-400';
};

const getCostColor = (cost: string) => {
  switch (cost) {
    case 'low': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'high': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

const getComplexityColor = (complexity: number) => {
  if (complexity >= 4) return 'text-red-400';
  if (complexity >= 3) return 'text-yellow-400';
  return 'text-green-400';
};

export default function RoutingDemo() {
  const [prompt, setPrompt] = useState('');
  const [maxCost, setMaxCost] = useState<'low' | 'medium' | 'high' | ''>('');
  const [preferredProvider, setPreferredProvider] = useState<'anthropic' | 'openai' | 'google' | ''>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoute = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestBody: RouteRequest = {
        prompt: prompt.trim(),
        ...(maxCost || preferredProvider ? {
          constraints: {
            ...(maxCost && { maxCost }),
            ...(preferredProvider && { preferredProvider })
          }
        } : {})
      };

      const response = await fetch('/api/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: RouteResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleRoute();
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-8 text-blue-400">
        Try AgentRouter
      </h2>
      <p className="text-gray-300 text-center mb-8">
        Test our intelligent routing system - enter a prompt and see which model gets selected
      </p>

      <div className="space-y-6">
        {/* Prompt Input */}
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
            Prompt <span className="text-red-400">*</span>
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter your prompt here... (Ctrl/Cmd + Enter to route)"
            className="w-full h-32 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
          />
        </div>

        {/* Constraints */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxCost" className="block text-sm font-medium text-gray-300 mb-2">
              Max Cost (optional)
            </label>
            <select
              id="maxCost"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value as 'low' | 'medium' | 'high' | '')}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No constraint</option>
              <option value="low">Low cost</option>
              <option value="medium">Medium cost</option>
              <option value="high">High cost</option>
            </select>
          </div>

          <div>
            <label htmlFor="preferredProvider" className="block text-sm font-medium text-gray-300 mb-2">
              Preferred Provider (optional)
            </label>
            <select
              id="preferredProvider"
              value={preferredProvider}
              onChange={(e) => setPreferredProvider(e.target.value as 'anthropic' | 'openai' | 'google' | '')}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No preference</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </div>
        </div>

        {/* Route Button */}
        <button
          onClick={handleRoute}
          disabled={loading || !prompt.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Routing...
            </>
          ) : (
            'Route Request'
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
            <div className="text-red-400 font-semibold mb-1">Error</div>
            <div className="text-red-300">{error}</div>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="bg-gray-700 rounded-lg p-6 space-y-4">
            <h3 className="text-xl font-semibold text-white mb-4">Routing Result</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Selected Model</div>
                  <div className={`text-lg font-mono font-semibold ${getStrategyColor(result.selectedModel)}`}>
                    {result.selectedModel}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-1">Estimated Cost</div>
                  <div className={`text-lg font-semibold capitalize ${getCostColor(result.estimatedCost)}`}>
                    {result.estimatedCost}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-1">Complexity Score</div>
                  <div className={`text-lg font-semibold ${getComplexityColor(result.complexity)}`}>
                    {result.complexity}/5
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-400 mb-2">Reasoning</div>
                <div className="text-gray-300 text-sm leading-relaxed bg-gray-800 rounded p-3">
                  {result.reason}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-center text-sm text-gray-400">
          <p>Tip: Try different types of prompts to see how routing adapts!</p>
          <p className="mt-1">Examples: "Hello world", "Analyze this complex algorithm", "Write Python code"</p>
        </div>
      </div>
    </div>
  );
}