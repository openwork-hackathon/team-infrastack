'use client';

import { useState } from 'react';
import RoutingDemo from './components/RoutingDemo';
import OrchestrationDemo from './components/OrchestrationDemo';
import InfraToken from './components/InfraToken';

export default function Home() {
  const [activeDemo, setActiveDemo] = useState<'routing' | 'orchestration'>('routing');

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {/* Hero Section */}
      <section className="px-4 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="flex justify-end mb-4">
            <a
              href="/vault"
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🏦 AgentVault Dashboard
            </a>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-green-400">
              InfraStack
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-4">
            Smart infrastructure for AI agents
          </p>
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 mb-12">
            <span className="text-sm font-semibold text-blue-300">🚀 OpenWork Hackathon 2026</span>
          </div>
          
          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-blue-400">
                🎯 AgentRouter
              </h3>
              <p className="text-gray-300 text-sm">
                Intelligent model routing that saves costs and optimizes performance automatically
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-purple-400">
                ⚡ AgentOrchestrator
              </h3>
              <p className="text-gray-300 text-sm">
                Break down complex tasks and execute them across multiple AI agents in parallel
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-green-400">
                💰 AgentVault
              </h3>
              <p className="text-gray-300 text-sm">
                Complete treasury management with real-time analytics and budget controls
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Try It Section */}
      <section className="px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Try It Live
            </h2>
            <p className="text-xl text-gray-300">
              Experience the power of intelligent AI infrastructure
            </p>
          </div>
          
          {/* Tabs for switching between demos */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-gray-800 rounded-lg p-1 border border-gray-700">
              <button 
                onClick={() => setActiveDemo('routing')}
                className={`px-6 py-3 rounded-md font-medium transition-colors ${
                  activeDemo === 'routing' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🎯 AgentRouter
              </button>
              <button 
                onClick={() => setActiveDemo('orchestration')}
                className={`px-6 py-3 rounded-md font-medium transition-colors ${
                  activeDemo === 'orchestration' 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                ⚡ AgentOrchestrator
              </button>
            </div>
          </div>

          {/* Demo Content */}
          {activeDemo === 'routing' ? (
            <div>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold text-blue-400 mb-3">AgentRouter Demo</h3>
                <p className="text-gray-300">
                  See how different prompts get routed to optimal AI models
                </p>
              </div>
              <RoutingDemo />
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold text-purple-400 mb-3">AgentOrchestrator Demo</h3>
                <p className="text-gray-300">
                  Enter any task and see InfraStack's intelligent execution plan
                </p>
              </div>
              <OrchestrationDemo />
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-16 bg-gray-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Features
          </h2>
          
          <div className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-blue-400">
                  🎯 AgentRouter
                </h3>
                <p className="text-gray-300 text-lg">
                  Route requests to the optimal model automatically. Our intelligent routing system analyzes your requests and selects the best AI model for the task, optimizing for cost, speed, and accuracy.
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-2">Request Flow</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Analyze request</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Select optimal model</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Route & execute</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="md:order-2">
                <h3 className="text-2xl font-semibold mb-4 text-purple-400">
                  ⚡ AgentOrchestrator
                </h3>
                <p className="text-gray-300 text-lg">
                  Break down complex tasks and execute them intelligently across multiple AI agents. Our orchestration system automatically determines the best execution strategy: direct, delegate, parallel, or escalate.
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-6 md:order-1">
                <div className="text-sm text-gray-400 mb-2">Execution Strategies</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span>Direct execution</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span>Delegate to specialist</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span>Parallel sub-agents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span>Human escalation</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-green-400">
                  💰 AgentVault
                </h3>
                <p className="text-gray-300 text-lg">
                  Track spending and manage your treasury with precision. Monitor usage across all models, set budgets, and get detailed analytics on your AI infrastructure costs.
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-2">Cost Management</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Real-time tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Budget alerts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Usage analytics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INFRA Token Section */}
      <InfraToken />

      {/* Stats Section */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-blue-400">
                21
              </div>
              <div className="text-xl text-gray-300">
                Models
              </div>
            </div>
            
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-green-400">
                6
              </div>
              <div className="text-xl text-gray-300">
                Providers
              </div>
            </div>
            
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-purple-400">
                $0.001
              </div>
              <div className="text-xl text-gray-300">
                avg routing cost
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-16 bg-gray-800">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Experience the future of AI infrastructure today
          </p>
          <a
            href="/api/route"
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-colors"
          >
            Try the API
          </a>
        </div>
      </section>
    </div>
  );
}