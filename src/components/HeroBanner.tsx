import { useEffect, useRef, useState } from 'react';
import { Brain, Globe, Zap, Shield, TrendingUp, Cpu, Layers, Sparkles, ArrowRight, Activity } from 'lucide-react';

const TAGLINES = [
  'The Autonomous AI Engine Built to Evolve.',
  'Self-Improving. Self-Scaling. Always On.',
  'Designed for the Intelligence-Native Era.',
  'Where AI Agents Collaborate at Scale.',
];

function TypewriterText({ texts }: { texts: string[] }) {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [erasing, setErasing] = useState(false);
  useEffect(() => {
    const target = texts[idx];
    if (!erasing && displayed.length < target.length) {
      const t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 45);
      return () => clearTimeout(t);
    }
    if (!erasing && displayed.length === target.length) {
      const t = setTimeout(() => setErasing(true), 2800);
      return () => clearTimeout(t);
    }
    if (erasing && displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(d => d.slice(0, -1)), 22);
      return () => clearTimeout(t);
    }
    if (erasing && displayed.length === 0) {
      setErasing(false);
      setIdx(i => (i + 1) % texts.length);
    }
  }, [displayed, erasing, idx, texts]);
  return (
    <span>
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}

// Orbiting nodes visualisation
function OrbitalRing() {
  const icons = [Brain, Globe, Zap, Shield, TrendingUp, Cpu, Layers, Sparkles];
  return (
    <div className="relative w-64 h-64 mx-auto">
      {/* Core */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 shadow-2xl shadow-violet-500/50 flex items-center justify-center">
            <Brain size={32} className="text-white" />
          </div>
          <div className="absolute -inset-2 rounded-full border border-violet-500/30 animate-spin" style={{ animationDuration: '12s' }} />
          <div className="absolute -inset-4 rounded-full border border-violet-500/15 animate-spin" style={{ animationDuration: '20s', animationDirection: 'reverse' }} />
        </div>
      </div>
      {/* Orbiting icons */}
      {icons.map((Icon, i) => {
        const angle = (i / icons.length) * 2 * Math.PI;
        const r = 112;
        const x = 50 + (r / 2.56) * Math.cos(angle);
        const y = 50 + (r / 2.56) * Math.sin(angle);
        const colors = ['text-blue-400','text-emerald-400','text-amber-400','text-rose-400','text-teal-400','text-purple-400','text-cyan-400','text-violet-400'];
        return (
          <div
            key={i}
            className="absolute w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg"
            style={{ left: `calc(${x}% - 16px)`, top: `calc(${y}% - 16px)` }}
          >
            <Icon size={14} className={colors[i % colors.length]} />
          </div>
        );
      })}
    </div>
  );
}

const STATS = [
  { value: '8', label: 'Autonomous Agents', icon: Cpu, color: 'text-cyan-400' },
  { value: '∞', label: 'Self-Evolution', icon: Sparkles, color: 'text-violet-400' },
  { value: '24/7', label: 'Always Running', icon: Activity, color: 'text-emerald-400' },
  { value: 'LIVE', label: 'Real-Time Data', icon: Globe, color: 'text-amber-400' },
];

export function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl mb-8">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-slate-900 to-slate-900" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative px-8 py-10 flex flex-col lg:flex-row items-center gap-10">
        {/* Left: text */}
        <div className="flex-1 space-y-5">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-violet-300 uppercase tracking-widest">AI Growth Platform — Live</span>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-extrabold text-white leading-tight">
              Nexus<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">AI</span>
            </h1>
            <p className="mt-2 text-base font-medium text-slate-300 min-h-[1.8rem]">
              <TypewriterText texts={TAGLINES} />
            </p>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-400 leading-relaxed max-w-md">
            A fully autonomous multi-agent system that discovers opportunities, recruits intelligence, executes actions, and evolves — continuously and without human intervention.
          </p>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-105">
              <Zap size={14} />
              Explore the Engine
              <ArrowRight size={13} />
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-all duration-200">
              <Globe size={14} />
              Live Status
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 pt-2">
            {STATS.map(s => {
              const SIcon = s.icon;
              return (
                <div key={s.label} className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <SIcon size={11} className={s.color} />
                    <span className={`text-base font-bold font-mono ${s.color}`}>{s.value}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium leading-tight">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: orbital visualisation */}
        <div className="shrink-0 hidden lg:block">
          <OrbitalRing />
        </div>
      </div>
    </div>
  );
}
