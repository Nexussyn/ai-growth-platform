import { Scale, CheckCircle, AlertTriangle } from 'lucide-react';
import { ReconciliationEntry } from '../lib/types';

interface Props {
  entries: ReconciliationEntry[];
  loading: boolean;
}

export function ReconciliationPanel(props: Props) {
  const latest = props.entries[0];

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 w-fit';
    switch (status) {
      case 'clean':
        return <div className={`${baseClasses} bg-emerald-100 text-emerald-800`}>
          <CheckCircle className="w-4 h-4" /> Clean
        </div>;
      case 'discrepancy_found':
        return <div className={`${baseClasses} bg-red-100 text-red-800`}>
          <AlertTriangle className="w-4 h-4" /> Discrepancy Found
        </div>;
      case 'resolved':
        return <div className={`${baseClasses} bg-amber-100 text-amber-800`}>
          <AlertTriangle className="w-4 h-4" /> Resolved
        </div>;
      default:
        return null;
    }
  };

  if (props.loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Scale className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 bg-gray-200 rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Scale className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Reconciliation</h2>
        </div>
        <div className="p-6 text-center text-gray-500">
          No reconciliation runs yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
        <Scale className="w-5 h-5 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-900">Reconciliation</h2>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          {getStatusBadge(latest.status)}
          <span className="text-sm text-gray-600">
            {new Date(latest.run_at).toLocaleString()}
          </span>
        </div>

        {latest.discrepancy_usdc !== 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertTriangle size={14} />
            <span className="font-medium">Discrepancy detected — under investigation</span>
          </div>
        )}

        {latest.discrepancy_usdc === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <CheckCircle size={14} />
            <span className="font-medium">All ledger entries reconciled — no discrepancies</span>
          </div>
        )}
      </div>
    </div>
  );
}
