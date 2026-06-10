import { useEffect, useRef, useState } from 'react';
import {
  Activity, Brain, Zap, Shield, TrendingUp, Users, Clock,
  AlertTriangle, CheckCircle, XCircle, Radio, Loader2,
  Cpu, Sparkles, Globe, BarChart3, Layers, ArrowUpRight,
} from 'lucide-react';
import { useEngineState } from '../lib/hooks';

const MODE_CONFIG: Record<string, {
  label: string;
  gradient: string;
  glowColor: string;
  icon: typeof Activity;
  description: string;
  particleColor: string;
}> = {
  learning:     { label: 'Learning',     gradient: 'from-blue-600 via-blue-500 to-cyan-400',     glowColor: 'shadow-blue-500/40',    icon: Brain,      description: 'Observing metrics & collecting baseline data',  particleColor: '#60a5fa' },
  testing:      { label: 'Testing',      gradient: 'from-amber-600 via-amber-500 to-yellow-400',  glowColor: 'shadow-amber-500/40',   icon: Zap,        description: 'Running experiments & evaluating variants',   particleColor: '#fbbf24' },
  recruiting:   { label: 'Recruiting',   gradient: 'from-cyan-600 via-cyan-500 to-teal-400',     glowColor: 'shadow-cyan-500/40',    icon: Users,      description: 'Discovering & onboarding new agents',          particleColor: '#22d3ee' },
  promoting:    { label: 'Promoting',    gradient: 'from-emerald-600 via-emerald-500 to-green-400', glowColor: 'shadow-emerald-500/40', icon: TrendingUp, description: 'Promoting winning variants to production',      particleColor: '#34d399' },
  expanding:    { label: 'Expanding',    gradient: 'from-teal-600 via-teal-500 to-emerald-400',  glowColor: 'shadow-teal-500/40',    icon: Radio,      description: 'Expanding into new channels & segments',       particleColor: '#2dd4bf' },
  settling:     { label: 'Settling',     gradient: 'from-green-600 via-green-500 to-lime-400',   glowColor: 'shadow-green-500/40',   icon: CheckCircle,description: 'Processing confirmed payments',                 particleColor: '#4ade80' },
  reconciling:  { label: 'Reconciling', gradient: 'from-orange-600 via-orange-500 to-amber-400', glowColor: 'shadow-orange-500/40',  icon: Shield,     description: 'Resolving discrepancies in revenue data',      particleColor: '#fb923c' },
  degraded:     { label: 'Degraded',     gradient: 'from-red-600 via-red-500 to-rose-400',       glowColor: 'shadow-red-500/40',     icon: AlertTriangle, description: 'Some components unavailable',              particleColor: '#f87171' },
  initializing: { label: 'Initializing', gradient: 'from-slate-600 via-slate-500 to-gray-400',   glowColor: 'shadow-slate-500/30',   icon: Loader2,    description: 'Engine starting up',                           particleColor: '#94a3b8' },
};

// Animated particle canvas
function NeuralCanvas({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const nodes = Array.from({ length: 22 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: 1.5 + Math.random() * 2,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      nodes.forEach((a, i) => {
        nodes.slice(i + 1).forEach(b => {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 80) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = color + Math.round((1 - d / 80) * 40).toString(16).padStart(2, '0');
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        });
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = color + 'cc';
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />;
}

// Animated counter
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = display;
    const end = value;
    if (start === end) return;
    const dur = 800;
    const startTime = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - startTime) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(end);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

function StatusDot({ status }: { status: string }) {
  const colors = { healthy: 'bg-emerald-400 shadow-emerald-400/60', degraded: 'bg-amber-400 shadow-amber-400/60', unknown: 'bg-slate-400' };
  const c = colors[status as keyof typeof colors] ?? colors.unknown;
  return <span className={`w-1.5 h-1.5 rounded-full shadow-sm ${c} ${status === 'healthy' ? 'animate-pulse' : ''}`} />;
}

function PulseRing({ healthy }: { healthy: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {healthy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50" />}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${healthy ? 'bg-white' : 'bg-red-300'}`} />
    </span>
  );
}

export function AutonomousEnginePanel() {
  const { data, loading, error } = useEngineState();
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 2000); return () => clearInterval(id); }, []);

  if (loading && !data) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded-lg w-48" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-slate-700/60 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-red-950 border border-red-900/50 p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle size={18} />
          <span className="text-sm font-medium">Engine state unavailable — retrying…</span>
        </div>
      </div>
    );
  }

  const mode = data?.mode ?? 'initializing';
  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.initializing;
  const Icon = config.icon;
  const components = data?.components_status ?? {};
  const degraded = data?.degraded_components ?? [];
  const heartbeatAge = data?.last_heartbeat_at
    ? Math.round((Date.now() - new Date(data.last_heartbeat_at).getTime()) / 1000)
    : null;
  const heartbeatHealthy = heartbeatAge !== null && heartbeatAge < 180;

  const metrics = [
    { label: 'Uptime',      value: data?.total_autonomous_hours ?? 0,  suffix: 'h',  decimals: 1, icon: Clock,      color: 'text-blue-400' },
    { label: 'Decisions',   value: data?.decisions_made ?? 0,           suffix: '',   decimals: 0, icon: Brain,      color: 'text-purple-400' },
    { label: 'Expansions',  value: data?.expansions_completed ?? 0,     suffix: '',   decimals: 0, icon: Globe,      color: 'text-teal-400' },
    { label: 'Agents',      value: data?.agents_recruited ?? 0,         suffix: '',   decimals: 0, icon: Users,      color: 'text-cyan-400' },
    { label: 'Evo Pulses',  value: data?.evolution_pulses ?? 0,         suffix: '',   decimals: 0, icon: Sparkles,   color: 'text-violet-400', highlight: true },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
      {/* Neural background canvas */}
      <div className="absolute inset-0 overflow-hidden">
        <NeuralCanvas color={config.particleColor} />
      </div>

      {/* Mode banner */}
      <div className={`relative bg-gradient-to-r ${config.gradient} px-6 py-5`}>
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg ${config.glowColor}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-base tracking-wide">{config.label} Mode</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white/90 text-[10px] font-semibold uppercase tracking-widest">
                  LIVE
                </span>
              </div>
              <p className="text-white/75 text-xs mt-0.5">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PulseRing healthy={heartbeatHealthy} />
            <span className="text-white/80 text-xs font-mono">
              {heartbeatHealthy ? `+${heartbeatAge}s` : heartbeatAge !== null ? `Stale ${heartbeatAge}s` : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="relative px-6 py-5 space-y-5">
        <div className="grid grid-cols-5 gap-2.5">
          {metrics.map((m) => {
            const MIcon = m.icon;
            return (
              <div
                key={m.label}
                className={`rounded-xl p-3 text-center transition-all duration-300 ${
                  m.highlight
                    ? 'bg-violet-500/10 border border-violet-500/30 shadow-violet-500/10 shadow-md'
                    : 'bg-slate-800/80 border border-slate-700/50'
                }`}
              >
                <MIcon size={14} className={`${m.color} mx-auto mb-1.5`} />
                <p className={`text-lg font-bold font-mono leading-none ${
                  m.highlight ? 'text-violet-300' : 'text-white'
                }`}>
                  <AnimatedNumber value={m.value} decimals={m.decimals} />{m.suffix}
                </p>
                <p className={`text-[10px] mt-1 font-medium uppercase tracking-wider ${
                  m.highlight ? 'text-violet-400' : 'text-slate-400'
                }`}>{m.label}</p>
              </div>
            );
          })}
        </div>

        {/* Subsystems */}
        {Object.keys(components).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers size={12} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Subsystems</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {Object.entries(components).map(([name, status]) => (
                <div
                  key={name}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 transition-colors"
                >
                  <StatusDot status={status as string} />
                  <span className="text-xs text-slate-300 capitalize truncate">{name.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Degraded warning */}
        {degraded.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-amber-300 font-semibold">Degraded components detected</p>
              <p className="text-xs text-amber-400/80 mt-0.5">{degraded.join(', ')}</p>
            </div>
          </div>
        )}

        {/* Recent jobs */}
        {(data?.recent_jobs?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={12} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Recent Jobs</span>
            </div>
            <div className="space-y-1.5">
              {data!.recent_jobs.slice(0, 5).map((job, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Cpu size={11} className="text-slate-500" />
                    <span className="text-xs font-mono text-slate-300">{job.job_name}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {job.duration_ms !== null && (
                      <span className="text-[10px] font-mono text-slate-500">{job.duration_ms}ms</span>
                    )}
                    {job.status === 'completed'
                      ? <CheckCircle size={13} className="text-emerald-400" />
                      : job.status === 'failed'
                        ? <XCircle size={13} className="text-red-400" />
                        : <Clock size={13} className="text-amber-400 animate-spin" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <Activity size={11} className="text-slate-600" />
            <span className="text-[10px] text-slate-600 font-mono">governed-v2.0 · 8 agents</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600">
            <span className="text-[10px] font-mono">live</span>
            <ArrowUpRight size={10} />
          </div>
        </div>
      </div>
    </div>
  );
}
