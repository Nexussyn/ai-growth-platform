import { Layers, CheckCircle, Play, Clock } from 'lucide-react';
import type { GrowthPhase } from '../lib/types';

interface Props {
  phases: GrowthPhase[];
  loading: boolean;
}

export function GrowthPhasesPanel(props: Props) {
  const { phases, loading } = props;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Layers className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Expansion Phases</h2>
        </div>
        <div className="p-5 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Layers className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Expansion Phases</h2>
      </div>

      <div className="p-5">
        <div className="space-y-6">
          {phases.map((phase, index) => {
            const isActive = phase.status === 'active';
            const isCompleted = phase.status === 'completed';
            const isPending = phase.status === 'pending';

            const statusIcon =
              isCompleted ? (
                <CheckCircle className="w-6 h-6 text-blue-600" />
              ) : isActive ? (
                <div className="relative w-6 h-6">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-6 h-6 bg-emerald-400 rounded-full opacity-50" />
                </div>
              ) : (
                <Clock className="w-6 h-6 text-gray-400" />
              );

            const borderColor = isActive ? 'border-emerald-200 bg-emerald-50' : isPending ? 'border-gray-200 bg-gray-50' : 'border-blue-100 bg-blue-50';
            const textColor = isActive ? 'text-gray-900' : isPending ? 'text-gray-600' : 'text-blue-900';

            return (
              <div
                key={phase.id}
                className={`flex gap-4 pb-6 ${index < phases.length - 1 ? 'border-b border-gray-200' : ''}`}
              >
                <div className="flex flex-col items-center">
                  {statusIcon}
                  {index < phases.length - 1 && (
                    <div className={`w-0.5 h-12 mt-2 ${isActive ? 'bg-emerald-300' : isPending ? 'bg-gray-300' : 'bg-blue-300'}`} />
                  )}
                </div>

                <div className={`flex-1 p-4 rounded-lg border ${borderColor}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold ${textColor}`}>{phase.phase_name}</h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                          Phase {phase.phase_number}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{phase.description}</p>
                      {isActive && <Play className="w-4 h-4 text-emerald-600 inline" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
