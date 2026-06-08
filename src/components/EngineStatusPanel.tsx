import { Cpu, ShieldAlert, Zap, AlertOctagon, CheckCircle2, Clock, Inbox, RotateCw, TrendingUp, XCircle } from 'lucide-react';
import { useQueueStatus, useSecurityGates, useExpansionStatus } from '../lib/hooks';
import { Card, CardHeader, CardBody } from './Card';
import { Skeleton } from './Skeleton';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function QueueSection() {
  const { data, loading } = useQueueStatus();

  if (loading && !data) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
      <div className="flex items-center gap-2 mb-3">
        <Inbox size={14} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Job Queue</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-gray-900">{data?.pending ?? 0}</p>
          <p className="text-[10px] text-gray-400">Pending</p>
        </div>
        <div>
          <p className="text-lg font-bold text-blue-600">{data?.running ?? 0}</p>
          <p className="text-[10px] text-gray-400">Running</p>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-600">{data?.completed ?? 0}</p>
          <p className="text-[10px] text-gray-400">Done</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${(data?.dead_letter ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {data?.dead_letter ?? 0}
          </p>
          <p className="text-[10px] text-gray-400">Dead</p>
        </div>
      </div>
      {(data?.dead_letter_items?.length ?? 0) > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          {data?.dead_letter_items?.slice(0, 3).map(item => (
            <div key={item.id} className="text-[11px] text-red-600 flex items-center gap-1.5 py-0.5">
              <XCircle size={10} />
              <span className="font-medium">{item.job_type}</span>
              <span className="text-red-400 truncate max-w-[140px]">{item.error_message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityGatesSection() {
  const { data, loading } = useSecurityGates();

  if (loading && !data) return <Skeleton className="h-20 w-full" />;

  const hasBlocks = data?.blocks_promotion || data?.blocks_expansion || data?.blocks_deployment;

  return (
    <div className={`rounded-xl border p-4 ${hasBlocks ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className={hasBlocks ? 'text-red-500' : 'text-emerald-500'} />
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Security Gates</span>
        </div>
        {!hasBlocks && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">CLEAR</span>
        )}
      </div>

      {hasBlocks ? (
        <div className="space-y-1.5">
          {data?.blocks_promotion && (
            <div className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertOctagon size={11} />
              <span className="font-medium">Promotions blocked</span>
            </div>
          )}
          {data?.blocks_expansion && (
            <div className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertOctagon size={11} />
              <span className="font-medium">Expansion blocked</span>
            </div>
          )}
          {data?.blocks_deployment && (
            <div className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertOctagon size={11} />
              <span className="font-medium">Deployment blocked</span>
            </div>
          )}
          <div className="mt-2 space-y-1">
            {data?.open_gates?.slice(0, 4).map(gate => (
              <div key={gate.id} className="text-[11px] py-1 px-2 rounded bg-red-100/50 text-red-700 flex items-center justify-between">
                <span className="truncate max-w-[200px]">{gate.description}</span>
                <span className={`shrink-0 text-[10px] font-bold px-1.5 rounded ${gate.severity === 'critical' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                  {gate.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 size={12} />
          <span>No blocking issues — promotion and expansion are enabled</span>
        </div>
      )}
    </div>
  );
}

function ExpansionSection() {
  const { data, loading } = useExpansionStatus();

  if (loading && !data) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Expansion Engine</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <div>
          <p className="text-lg font-bold text-gray-900">{data?.active_variants ?? 0}</p>
          <p className="text-[10px] text-gray-400">Active</p>
        </div>
        <div>
          <p className="text-lg font-bold text-blue-600">{data?.testing_variants ?? 0}</p>
          <p className="text-[10px] text-gray-400">Testing</p>
        </div>
        <div>
          <p className="text-lg font-bold text-teal-600">{data?.channels_active ?? 0}</p>
          <p className="text-[10px] text-gray-400">Channels</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-600">{data?.actions_last_24h ?? 0}</p>
          <p className="text-[10px] text-gray-400">24h Acts</p>
        </div>
      </div>
      {(data?.recent_actions?.length ?? 0) > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {data?.recent_actions?.slice(0, 4).map(action => (
            <div key={action.id} className="text-[11px] flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <Zap size={10} className="text-amber-500" />
                <span className="font-medium text-gray-700">{action.action_type}</span>
                <span className="text-gray-400">{action.dimension}</span>
              </div>
              <span className="text-gray-400">{timeAgo(action.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      {(data?.dimensions_covered?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 border-t border-gray-100 pt-2">
          {data?.dimensions_covered?.map(dim => (
            <span key={dim} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100">
              {dim.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function EngineStatusPanel() {
  const { refresh: refreshQueue } = useQueueStatus();
  const { refresh: refreshGates } = useSecurityGates();
  const { refresh: refreshExpansion } = useExpansionStatus();

  return (
    <Card>
      <CardHeader
        title="Execution Engine"
        subtitle="Queue, gates, and expansion"
        icon={<Cpu size={15} />}
        action={
          <button
            onClick={() => { refreshQueue(); refreshGates(); refreshExpansion(); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RotateCw size={13} />
          </button>
        }
      />
      <CardBody className="space-y-3">
        <QueueSection />
        <SecurityGatesSection />
        <ExpansionSection />
      </CardBody>
    </Card>
  );
}
