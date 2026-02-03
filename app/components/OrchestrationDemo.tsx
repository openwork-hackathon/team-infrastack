'use client';

import { useState } from 'react';

interface OrchestratorRequest {
  task: string;
  planOnly: boolean;
  constraints?: {
    maxCost?: 'low' | 'medium' | 'high';
    preferredProvider?: 'anthropic' | 'openai' | 'google';
    timeout?: number;
  };
}

interface PlanTask {
  id: number;
  task: string;
  model: string;
  provider: string;
  priority: number;
  dependsOn: number[];
  estimatedTokens: number;
  systemPrompt?: string;
}

interface ExecutionPlan {
  planId: string;
  strategy: 'direct' | 'delegate' | 'parallel' | 'escalate';
  tasks: PlanTask[];
  aggregation?: {
    method: 'merge' | 'select_best' | 'synthesize';
    finalModel?: string;
    finalProvider?: string;
  };
  estimatedCost: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  createdAt: string;
}

const getStrategyColor = (strategy: string) => {
  switch (strategy) {
    case 'direct': return 'text-blue-400';
    case 'delegate': return 'text-green-400';
    case 'parallel': return 'text-purple-400';
    case 'escalate': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

const getStrategyEmoji = (strategy: string) => {
  switch (strategy) {
    case 'direct': return '🎯';
    case 'delegate': return '🤝';
    case 'parallel': return '⚡';
    case 'escalate': return '🚨';
    default: return '❓';
  }
};

const getCostColor = (cost: string) => {
  switch (cost) {
    case 'low': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'high': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

const getPriorityColor = (priority: number) => {
  if (priority === 1) return 'text-red-400';
  if (priority === 2) return 'text-yellow-400';
  return 'text-green-400';
};

const getModelColor = (model: string) => {
  if (model.includes('opus') || model.includes('o1')) return 'text-purple-400';
  if (model.includes('gpt-4o') && !model.includes('mini')) return 'text-blue-400';
  if (model.includes('sonnet') || model.includes('claude')) return 'text-green-400';
  if (model.includes('mini') || model.includes('flash') || model.includes('haiku')) return 'text-yellow-400';
  if (model.includes('human')) return 'text-red-400';
  return 'text-gray-400';
};

const examplePrompts = [
  "Build a modern landing page with pricing tiers",
  "Create a full-stack todo application with user authentication",
  "Analyze market trends for AI infrastructure tools", 
  "Design a React component library with TypeScript",
  "Implement a cryptocurrency payment gateway",
  "Research and compare cloud hosting providers"
];

export default function OrchestrationDemo() {
  const [task, setTask] = useState('');
  const [maxCost, setMaxCost] = useState<'low' | 'medium' | 'high' | ''>('');
  const [preferredProvider, setPreferredProvider] = useState<'anthropic' | 'openai' | 'google' | ''>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExecutionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!task.trim()) {
      setError('Please enter a task description');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestBody: OrchestratorRequest = {
        task: task.trim(),
        planOnly: true,
        ...(maxCost || preferredProvider ? {
          constraints: {
            ...(maxCost && { maxCost }),
            ...(preferredProvider && { preferredProvider })
          }
        } : {})
      };

      const response = await fetch('/api/orchestrate', {
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

      const data: ExecutionPlan = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setTask(example);
    setError(null);
    setResult(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAnalyze();
    }
  };

  const getStrategyExplanation = (strategy: string) => {
    switch (strategy) {
      case 'direct':
        return 'Single AI model handles the entire task - best for simple, focused requests';
      case 'delegate':
        return 'Task delegated to one specialized AI agent - optimal for specific expertise needs';
      case 'parallel':
        return 'Task broken into subtasks executed simultaneously - maximizes efficiency for complex work';
      case 'escalate':
        return 'Task requires human oversight - flagged for manual review due to complexity or risk';
      default:
        return 'Unknown strategy';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-8 max-w-6xl mx-auto">
      {/* Demo Mode Banner */}
      <div className="mb-8 p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
        <div className="flex items-center justify-center gap-3">
          <span className="text-2xl">🔒</span>
          <span className="text-blue-300 font-semibold text-lg">
            Demo Mode — see how InfraStack would execute your task
          </span>
        </div>
      </div>

      <h2 className="text-3xl font-bold text-center mb-4 text-purple-400">
        AgentOrchestrator Demo
      </h2>
      <p className="text-gray-300 text-center mb-8">
        Enter any task and see InfraStack's intelligent execution plan - no code required!
      </p>

      <div className="space-y-6">
        {/* Task Input */}
        <div>
          <label htmlFor="task" className="block text-sm font-medium text-gray-300 mb-2">
            Task Description <span className="text-red-400">*</span>
          </label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Describe any task you want to accomplish... (Ctrl/Cmd + Enter to analyze)"
            className="w-full h-32 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical transition-all"
          />
        </div>

        {/* Example Prompts */}
        <div>
          <div className="text-sm text-gray-400 mb-3">Try these examples:</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                className="text-left p-3 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 rounded-lg text-gray-300 hover:text-white transition-all text-sm"
              >
                "{example}"
              </button>
            ))}
          </div>
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
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">No preference</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </div>
        </div>

        {/* Analyze Button */}
        <button
          onClick={handleAnalyze}
          disabled={loading || !task.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all flex items-center justify-center transform hover:scale-[1.02] disabled:hover:scale-100"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Analyzing Task...
            </>
          ) : (
            <>
              <span className="mr-2">🎯</span>
              Analyze Task
            </>
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 animate-in fade-in duration-300">
            <div className="text-red-400 font-semibold mb-1">Error</div>
            <div className="text-red-300">{error}</div>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="bg-gray-700 rounded-lg p-6 space-y-6 animate-in fade-in duration-500">
            <h3 className="text-xl font-semibold text-white mb-4">📋 Execution Plan</h3>
            
            {/* Strategy Overview */}
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Selected Strategy</div>
                <div className={`text-lg font-semibold mb-2 ${getStrategyColor(result.strategy)}`}>
                  {getStrategyEmoji(result.strategy)} {result.strategy.toUpperCase()}
                </div>
                <div className="text-sm text-gray-300">
                  {getStrategyExplanation(result.strategy)}
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Estimated Cost</div>
                <div className={`text-lg font-semibold capitalize ${getCostColor(result.estimatedCost)}`}>
                  {result.estimatedCost}
                </div>
                <div className="text-sm text-gray-300">
                  ~{result.estimatedTokens.toLocaleString()} tokens
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Task Breakdown</div>
                <div className="text-lg font-semibold text-blue-400">
                  {result.tasks.length} {result.tasks.length === 1 ? 'task' : 'tasks'}
                </div>
                <div className="text-sm text-gray-300">
                  {result.strategy === 'parallel' ? 'Execute in parallel' : 'Sequential execution'}
                </div>
              </div>
            </div>

            {/* Task List */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">📝 Detailed Task Plan</h4>
              <div className="space-y-3">
                {result.tasks.map((planTask) => (
                  <div key={planTask.id} className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-600 text-white text-xs px-2 py-1 rounded font-mono">
                          #{planTask.id}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(planTask.priority)} bg-gray-600`}>
                          Priority {planTask.priority}
                        </span>
                        {planTask.dependsOn.length > 0 && (
                          <span className="text-xs px-2 py-1 rounded bg-orange-900/50 text-orange-300">
                            Depends on: {planTask.dependsOn.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mb-3">
                      <div className="text-white font-medium mb-1">{planTask.task}</div>
                      {planTask.systemPrompt && (
                        <div className="text-xs text-gray-400 italic">
                          {planTask.systemPrompt}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Model:</span>
                        <div className={`font-mono ${getModelColor(planTask.model)}`}>
                          {planTask.model}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-400">Provider:</span>
                        <div className="text-gray-300 capitalize">{planTask.provider}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Tokens:</span>
                        <div className="text-gray-300">{planTask.estimatedTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Status:</span>
                        <div className="text-yellow-400">Ready to execute</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aggregation Strategy (for parallel tasks) */}
            {result.aggregation && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-3">🔄 Result Aggregation</h4>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Method:</span>
                    <div className="text-green-400 capitalize">{result.aggregation.method}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Final Model:</span>
                    <div className="text-green-400 font-mono">{result.aggregation.finalModel}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Final Provider:</span>
                    <div className="text-green-400 capitalize">{result.aggregation.finalProvider}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-300">
                  Subtask results will be {result.aggregation.method === 'synthesize' ? 'synthesized into a cohesive output' : 
                    result.aggregation.method === 'merge' ? 'merged together' : 'evaluated to select the best result'}.
                </div>
              </div>
            )}

            {/* Plan Metadata */}
            <div className="text-center pt-4 border-t border-gray-600">
              <div className="text-xs text-gray-400">
                Plan ID: <span className="font-mono">{result.planId}</span> • 
                Generated: {new Date(result.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-center text-sm text-gray-400">
          <p>💡 <strong>How it works:</strong> InfraStack analyzes your task complexity, chooses the optimal execution strategy, and provides a detailed plan with cost estimates.</p>
          <p className="mt-2">🚀 In production, this plan would be automatically executed across our distributed agent network.</p>
        </div>
      </div>
    </div>
  );
}