import { useState, useCallback } from 'react';
import {
  Zap, PenTool, Search, Mail, Layout, Code2, BarChart3,
  ArrowRight, CheckCircle, Loader2, Sparkles, Globe, Shield
} from 'lucide-react';
import { edgeFetch } from '../lib/supabase';

interface Product {
  id: string;
  name: string;
  price_usdc: number;
  description: string;
  icon: React.ReactNode;
}

const PRODUCTS: Product[] = [
  { id: "ai-writer", name: "AI Content Writer", price_usdc: 0.03, description: "Generate SEO-optimized blog posts, articles, and social content in seconds", icon: <PenTool size={20} /> },
  { id: "ai-seo", name: "SEO Analyzer", price_usdc: 0.03, description: "Instant SEO audit with keyword opportunities and actionable fixes", icon: <Search size={20} /> },
  { id: "ai-email", name: "Email Generator", price_usdc: 0.02, description: "High-converting cold emails and follow-up sequences", icon: <Mail size={20} /> },
  { id: "ai-landing", name: "Landing Page Copy", price_usdc: 0.05, description: "Complete landing page copy with headlines, benefits, and CTAs", icon: <Layout size={20} /> },
  { id: "ai-code", name: "Code Assistant", price_usdc: 0.03, description: "Generate, review, and optimize code in any language", icon: <Code2 size={20} /> },
  { id: "ai-data", name: "Data Analyzer", price_usdc: 0.03, description: "AI-powered insights from your data in natural language", icon: <BarChart3 size={20} /> },
];

type ResultState = 'idle' | 'loading' | 'success' | 'limit_reached';

export function ProductLanding() {
  const [selectedProduct, setSelectedProduct] = useState<string>("ai-writer");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<ResultState>('idle');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || prompt.length < 3) return;
    setState('loading');
    setError("");
    setResult(null);

    try {
      const res = await edgeFetch('/api/free/generate', {
        method: 'POST',
        body: JSON.stringify({ product: selectedProduct, prompt: prompt.trim() }),
      });
      const data = await res.json();

      if (res.status === 429) {
        setState('limit_reached');
        setError(data.error ?? "Free tier limit reached");
        return;
      }

      if (!res.ok) {
        setState('idle');
        setError(data.error ?? "Something went wrong");
        return;
      }

      setResult(data.result);
      setRemaining(data.remaining_free_calls ?? null);
      setState('success');
    } catch {
      setState('idle');
      setError("Network error. Please try again.");
    }
  }, [prompt, selectedProduct]);

  const selected = PRODUCTS.find(p => p.id === selectedProduct) ?? PRODUCTS[0];

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center space-y-6 pt-4">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-medium">
          <Sparkles size={12} />
          <span>Free tier available — no signup required</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
          AI Tools That Actually<br className="hidden sm:block" /> Make You Money
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Content writing, SEO analysis, cold emails, landing page copy — all AI-powered.
          Pay only for what you use. No subscription. No signup.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5"><Globe size={14} /> Pay with USDC on Base</span>
          <span className="flex items-center gap-1.5"><Shield size={14} /> No account needed</span>
          <span className="flex items-center gap-1.5"><Zap size={14} /> Instant results</span>
        </div>
      </section>

      {/* Product Grid */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Choose a tool</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PRODUCTS.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProduct(p.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                selectedProduct === p.id
                  ? 'border-gray-900 bg-gray-900 text-white shadow-lg scale-[1.02]'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className={selectedProduct === p.id ? 'text-emerald-400' : 'text-gray-400'}>{p.icon}</div>
              <span className="text-xs font-medium leading-tight">{p.name}</span>
              <span className={`text-[10px] ${selectedProduct === p.id ? 'text-gray-300' : 'text-gray-400'}`}>
                ${p.price_usdc} / call
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Try It */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{selected.description}</p>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
            {remaining !== null ? `${remaining + 1} free calls left today` : '3 free/day'}
          </span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {selectedProduct === 'ai-writer' && 'What topic should I write about?'}
              {selectedProduct === 'ai-seo' && 'Enter a URL or topic to analyze'}
              {selectedProduct === 'ai-email' && 'Who are you reaching out to and why?'}
              {selectedProduct === 'ai-landing' && 'Describe your product or service'}
              {selectedProduct === 'ai-code' && 'Describe what code you need'}
              {selectedProduct === 'ai-data' && 'What data question do you have?'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                selectedProduct === 'ai-writer' ? 'e.g., "How to grow a SaaS startup from 0 to $10K MRR"' :
                selectedProduct === 'ai-seo' ? 'e.g., "AI automation tools for small business"' :
                selectedProduct === 'ai-email' ? 'e.g., "Cold email to SaaS founders about our analytics tool"' :
                selectedProduct === 'ai-landing' ? 'e.g., "A project management tool for remote teams"' :
                selectedProduct === 'ai-code' ? 'e.g., "React hook for infinite scroll with pagination"' :
                'e.g., "Sales data by region for Q4 2024"'
              }
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              rows={3}
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={state === 'loading' || !prompt.trim() || prompt.length < 3}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'loading' ? (
              <><Loader2 size={14} className="animate-spin" /> Generating...</>
            ) : (
              <><Zap size={14} /> Generate Free Preview</>
            )}
          </button>

          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              {error}
              {state === 'limit_reached' && (
                <div className="mt-2 text-xs text-amber-600">
                  Connect a wallet with USDC on Base to unlock unlimited access at ${selected.price_usdc} per call.
                </div>
              )}
            </div>
          )}

          {result && state === 'success' && (
            <div className="space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <CheckCircle size={12} /> Preview Generated
                  </span>
                  {remaining !== null && (
                    <span className="text-[10px] text-gray-400">{remaining} free call{remaining !== 1 ? 's' : ''} remaining today</span>
                  )}
                </div>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed overflow-auto max-h-96">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-5 text-white space-y-3">
                <p className="text-sm font-medium">Want the full version? 5x more detail, no daily limit.</p>
                <p className="text-xs text-gray-300">Pay ${selected.price_usdc} USDC per call on Base. Connect any Ethereum wallet.</p>
                <a href="#paywall" className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
                  Unlock Full Access <ArrowRight size={14} />
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center space-y-2">
          <div className="text-2xl font-bold text-gray-900">$0.03</div>
          <div className="text-xs text-gray-500">Average cost per call</div>
          <div className="text-[10px] text-gray-400">~100 calls = $3 total</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center space-y-2">
          <div className="text-2xl font-bold text-gray-900">&lt; 2s</div>
          <div className="text-xs text-gray-500">Average response time</div>
          <div className="text-[10px] text-gray-400">Instant results, no queue</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center space-y-2">
          <div className="text-2xl font-bold text-gray-900">No Signup</div>
          <div className="text-xs text-gray-500">Start using immediately</div>
          <div className="text-[10px] text-gray-400">Just connect wallet to pay</div>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900 text-center">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-600 font-bold text-sm">1</div>
            <h3 className="text-sm font-semibold text-gray-900">Try Free</h3>
            <p className="text-xs text-gray-500 leading-relaxed">Get 3 free preview calls per day. No account, no credit card, no strings.</p>
          </div>
          <div className="text-center space-y-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-600 font-bold text-sm">2</div>
            <h3 className="text-sm font-semibold text-gray-900">See Value</h3>
            <p className="text-xs text-gray-500 leading-relaxed">Preview results show you exactly what you get. Full version is 5x more detailed.</p>
          </div>
          <div className="text-center space-y-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-600 font-bold text-sm">3</div>
            <h3 className="text-sm font-semibold text-gray-900">Pay Per Use</h3>
            <p className="text-xs text-gray-500 leading-relaxed">Connect wallet, pay $0.03 USDC on Base per call. No subscription, cancel anytime.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-900">What wallet do I need?</h4>
            <p className="text-xs text-gray-500">Any Ethereum wallet (MetaMask, Coinbase Wallet, Rainbow, etc.) with USDC on Base network.</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-900">How much does it cost?</h4>
            <p className="text-xs text-gray-500">$0.02-$0.05 per API call depending on the tool. Free tier gives you 3 calls per day.</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-900">Is there a subscription?</h4>
            <p className="text-xs text-gray-500">No. Pay only when you use the service. No monthly fees, no hidden charges.</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-900">What is Base network?</h4>
            <p className="text-xs text-gray-500">Base is an Ethereum Layer 2 with fast, cheap transactions. Fees are under $0.01.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
