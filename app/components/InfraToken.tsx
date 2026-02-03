'use client';

import { useState } from 'react';

export default function InfraToken() {
  const [copied, setCopied] = useState(false);
  
  const contractAddress = '0x17942d1514baae9ee6525eee36255d6ba2199f9e';
  const tradeLink = 'https://mint.club/token/base/INFRA';
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <section className="px-4 py-16 bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-t border-gray-700">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              $INFRA Token
            </span>
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Power the InfraStack ecosystem. Trade, hold, and participate in the future of AI infrastructure.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Token Info Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-600">
            <h3 className="text-2xl font-semibold mb-6 text-center">Token Details</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Contract Address
                </label>
                <div className="flex items-center gap-2">
                  <code className="bg-gray-700 px-3 py-2 rounded text-sm font-mono flex-1 break-all">
                    {contractAddress}
                  </code>
                  <button
                    onClick={() => copyToClipboard(contractAddress)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Network
                </label>
                <div className="bg-gray-700 px-3 py-2 rounded text-sm">
                  Base Network
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Parent Token
                </label>
                <div className="bg-gray-700 px-3 py-2 rounded text-sm font-semibold">
                  $OPENWORK
                </div>
              </div>
            </div>
          </div>

          {/* Trading Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-600">
            <h3 className="text-2xl font-semibold mb-6 text-center">Get $INFRA</h3>
            
            <div className="text-center">
              <div className="mb-6">
                <div className="text-4xl mb-2">🚀</div>
                <p className="text-gray-300">
                  Join the InfraStack ecosystem and help power the next generation of AI infrastructure.
                </p>
              </div>
              
              <a
                href={tradeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Trade $INFRA
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              
              <p className="text-sm text-gray-400 mt-4">
                Powered by Mint.club
              </p>
            </div>
          </div>
        </div>

        {/* Token Utility */}
        <div className="bg-gray-800/30 rounded-xl p-8 border border-gray-700">
          <h3 className="text-2xl font-semibold mb-6 text-center">Token Utility</h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">Payment</h4>
              <p className="text-gray-300 text-sm">
                Pay for AgentRouter and AgentVault services with $INFRA tokens
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🏛️</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">Governance</h4>
              <p className="text-gray-300 text-sm">
                Participate in protocol decisions and ecosystem development
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💰</span>
              </div>
              <h4 className="text-lg font-semibold mb-2">Rewards</h4>
              <p className="text-gray-300 text-sm">
                Earn rewards for contributing to the InfraStack ecosystem
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}