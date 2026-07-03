import { useEffect, useState } from 'react';
import { Trophy, CheckCircle, XCircle, Clock, RefreshCw, TrendingUp } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const CRITERIA_LABELS: Record<string, string> = {
  continuous_loop_active:             'Continuous loop active',
  no_idle_stalls:                     'No idle stalls',
  no_duplicate_execution:             'No duplicate executions',
  no_events_lost:                     'Zero events lost',
  no_critical_errors:                 'No critical errors',
  db_health_stable:                   'DB health stable',
  queue_depth_bounded:                'Queue depth bounded',
  dlq_under_control:                  'DLQ under control',
  task_completion_repeatable:         'Tasks complete repeatably',
  external_benchmarking_runs_regularly: 'External benchmarks running',
  benchmark_results_logged:           'Benchmark results logged',
  telegram_liveness_confirmed:        'Telegram liveness confirmed',
  monetization_locked:                'Monetization locked',
  no_unsafe_cross_coupling:           'No unsafe cross-coupling',
};

const REQUIRED_PASSES = 10;
const REQUIRED_BENCHMARK_RUNS = 5;

interface PhaseGateRow {
  criterion: string;
  passes: number;
  last_passed_at: string | null;
  last_failed_at: string | null;
  currently_passing: boolean;
}

interface ProjectionRow {
  metric_key: string;
  metric_value: number;
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function CriterionRow({ row }: { row: PhaseGateRow }) {
  const label = CRITERIA_LABELS[row.criterion] ?? row.criterion;
  const progress = Math.min(row.passes / REQUIRED_PASSES, 1);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="flex-shrink-0">
        {row.currently_passing
          ? <CheckCircle size={14} className="text-emerald-500" />
          : <XCircle size={14} className="text-gray-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-xs ${row.currently_passing ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
            {label}
          </span>
          <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{row.passes}/{REQUIRED_PASSES}</span>
        </div>
        <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progress >= 1 ? 'bg-emerald-400' : row.currently_passing ? 'bg-blue-400' : 'bg-gray-200'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <span className="text-[10px] text-gray-300 flex-shrink-0 hidden sm:block">
        {row.currently_passing ? timeAgo(row.last_passed_at) : ''}
      </span>
    </div>
  );
}

export function PhaseGatePanel() {
  const [rows, setRows] = useState<PhaseGateRow[]>([]);
  const [projections, setProjections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
    try {
      const [pgRes, projRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/phase_gate_criteria?select=criterion,passes,last_passed_at,last_failed_at,currently_passing&order=criterion`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/projection_metrics?select=metric_key,metric_value&metric_key=in.(benchmark_runs_total,pivot_score,sustained_gate_passes)`, { headers }),
      ]);
      if (pgRes.ok) setRows(await pgRes.json());
      if (projRes.ok) {
        const proj: ProjectionRow[] = await projRes.json();
        const m: Record<string, number> = {};
        for (const p of proj) m[p.metric_key] = Number(p.metric_value);
        setProjections(m);
      }
      setLastRefresh(new Date());
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const passing = rows.filter(r => r.currently_passing).length;
  const total = rows.length || Object.keys(CRITERIA_LABELS).length;
  const completedCriteria = rows.filter(r => r.passes >= REQUIRED_PASSES).length;
  const pivotScore = projections['pivot_score'] ?? 0;
  const benchmarkRuns = projections['benchmark_runs_total'] ?? 0;
  const sustainedPasses = projections['sustained_gate_passes'] ?? 0;

  const gateUnlocked =
    completedCriteria >= Object.keys(CRITERIA_LABELS).length &&
    benchmarkRuns >= REQUIRED_BENCHMARK_RUNS &&
    sustainedPasses >= REQUIRED_PASSES;

  const overallProgress = Math.round((completedCriteria / Object.keys(CRITERIA_LABELS).length) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${gateUnlocked ? 'bg-emerald-500' : 'bg-gray-900'}`}>
            <Trophy size={13} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Phase Gate</h3>
            <p className="text-[10px] text-gray-400">14 criteria · {REQUIRED_PASSES} sustained passes each</p>
          </div>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-700 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">Criteria passing</p>
          <p className="text-lg font-bold text-gray-900">{passing}<span className="text-xs font-normal text-gray-400">/{total}</span></p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">Completed (≥{REQUIRED_PASSES})</p>
          <p className="text-lg font-bold text-gray-900">{completedCriteria}<span className="text-xs font-normal text-gray-400">/{Object.keys(CRITERIA_LABELS).length}</span></p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">Benchmarks run</p>
          <p className={`text-lg font-bold ${benchmarkRuns >= REQUIRED_BENCHMARK_RUNS ? 'text-emerald-600' : 'text-gray-900'}`}>
            {benchmarkRuns}<span className="text-xs font-normal text-gray-400">/{REQUIRED_BENCHMARK_RUNS}</span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">Pivot score</p>
          <p className={`text-lg font-bold ${pivotScore >= 70 ? 'text-emerald-600' : 'text-gray-900'}`}>
            {pivotScore > 0 ? pivotScore.toFixed(0) : '—'}
            {pivotScore > 0 && <span className="text-xs font-normal text-gray-400">/100</span>}
          </p>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
            <TrendingUp size={11} /> Overall gate progress
          </span>
          <span className="text-xs font-semibold text-gray-700">{overallProgress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              gateUnlocked ? 'bg-emerald-400' : overallProgress >= 50 ? 'bg-blue-400' : 'bg-gray-300'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        {gateUnlocked && (
          <p className="text-xs text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
            <CheckCircle size={11} /> Phase gate UNLOCKED — system ready for next phase
          </p>
        )}
      </div>

      {/* Criteria list */}
      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6">
          <Clock size={20} className="text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Phase gate data not yet available</p>
          <p className="text-[10px] text-gray-300 mt-1">Table <code>phase_gate_criteria</code> may need to be created</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(r => <CriterionRow key={r.criterion} row={r} />)}
        </div>
      )}

      {lastRefresh && (
        <p className="text-[10px] text-gray-300 mt-3 text-right">Last refresh: {lastRefresh.toLocaleTimeString()}</p>
      )}
    </div>
  );
}
