import { Brain, Lightbulb, TrendingUp, Archive, Radio, Map, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import type { ImprovementState } from '../lib/types';

interface Props {
  improvement: ImprovementState | undefined;
  loading: boolean;
}

const statusColors: Record<string, string> = {
  proposed: 'bg-blue-100 text-blue-800',
  approved: 'bg-cyan-100 text-cyan-800',
  testing: 'bg-amber-100 text-amber-800',
  promoted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-600',
  rolled_back: 'bg-red-100 text-red-700',
  discovered: 'bg-blue-100 text-blue-700',
  evaluated: 'bg-gray-100 text-gray-700',
  implemented: 'bg-emerald-100 text-emerald-700',
};

const engineStateLabels: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  learning: { label: 'Learning', color: 'text-blue-600', icon: Brain },
  testing: { label: 'Testing', color: 'text-amber-600', icon: Zap },
  promoting: { label: 'Promoting', color: 'text-emerald-600', icon: TrendingUp },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function ImprovementPanel({ improvement, loading }: Props) {
  if (loading || !improvement) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Brain className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Improvement Engine</h2>
        </div>
        <div className="p-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  const { proposals, signals, roadmap, last_cycle, memory, engine_state } = improvement;
  const engineInfo = engineStateLabels[engine_state] ?? engineStateLabels.testing;
  const EngineIcon = engineInfo.icon;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Improvement Engine</h2>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${engineInfo.color}`}>
          <EngineIcon size={14} />
          <span>{engineInfo.label}</span>
          {engine_state === 'learning' && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
        </div>
      </div>

      {/* Last cycle summary */}
      {last_cycle && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <span>Cycle #{last_cycle.cycle_number} — {last_cycle.status}</span>
          <div className="flex items-center gap-3">
            <span className="text-emerald-600 font-medium">+{last_cycle.promotions} promoted</span>
            <span className="text-red-500 font-medium">-{last_cycle.rejections} rejected</span>
            <span>{last_cycle.proposals_generated} proposals</span>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {/* Active Proposals */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-800">Active Proposals ({proposals.length})</h3>
          </div>
          {proposals.length === 0 ? (
            <p className="text-xs text-gray-400">No proposals yet. Engine is collecting data.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {proposals.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-start justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                      <span className="text-xs text-gray-400">{p.category}</span>
                      <span className="text-xs text-gray-400">conf: {(p.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatTime(p.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* External Signals */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">External Intelligence ({signals.length})</h3>
          </div>
          {signals.length === 0 ? (
            <p className="text-xs text-gray-400">No signals tracked yet.</p>
          ) : (
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {signals.slice(0, 4).map(s => (
                <div key={s.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 line-clamp-1">{s.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.status}
                      </span>
                      <span className="text-xs text-gray-400">{s.signal_type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400">rel: {(s.relevance_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roadmap */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Map size={14} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Roadmap (top {roadmap.length})</h3>
          </div>
          {roadmap.length === 0 ? (
            <p className="text-xs text-gray-400">No roadmap items yet.</p>
          ) : (
            <div className="space-y-1.5">
              {roadmap.slice(0, 5).map((item, i) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 font-mono w-4">{i + 1}.</span>
                    <span className="text-gray-800 font-medium truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-400">{item.category}</span>
                    <span className="text-gray-600 font-medium">score: {item.expected_value_score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memory */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Archive size={14} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">System Memory ({memory.length} active)</h3>
          </div>
          {memory.length === 0 ? (
            <p className="text-xs text-gray-400">No memory entries yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {memory.slice(0, 6).map(m => (
                <div key={m.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                  {m.memory_type.includes('winning') ? (
                    <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                  ) : m.memory_type.includes('failed') ? (
                    <XCircle size={11} className="text-red-400 shrink-0" />
                  ) : (
                    <Clock size={11} className="text-gray-400 shrink-0" />
                  )}
                  <span className="text-xs text-gray-700 truncate max-w-[150px]">{m.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
