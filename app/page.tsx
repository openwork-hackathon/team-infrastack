import RoutingDemo from './components/RoutingDemo';

export default function Home() {
  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {/* Hero Section */}
      <section className="px-4 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            InfraStack
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-12">
            Smart infrastructure for AI agents
          </p>
          
          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-2xl font-semibold mb-4 text-blue-400">
                AgentRouter
              </h3>
              <p className="text-gray-300">
                Route requests to the optimal model automatically
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-2xl font-semibold mb-4 text-green-400">
                AgentVault
              </h3>
              <p className="text-gray-300">
                Track spending and manage your treasury
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
              See AgentRouter in action - test how different prompts get routed to optimal models
            </p>
          </div>
          <RoutingDemo />
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
                  AgentRouter
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
                <h3 className="text-2xl font-semibold mb-4 text-green-400">
                  AgentVault
                </h3>
                <p className="text-gray-300 text-lg">
                  Track spending and manage your treasury with precision. Monitor usage across all models, set budgets, and get detailed analytics on your AI infrastructure costs.
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-6 md:order-1">
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