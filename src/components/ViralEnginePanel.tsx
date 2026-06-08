import {
  Share2, TrendingUp, Eye, MousePointer, Users,
  AlertTriangle, Copy, CheckCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useViralArtifacts, useViralLoops } from '../lib/hooks';
import { Skeleton } from './Skeleton';

const LOOP_ICONS: Record<string, string> = {
  referral: 'Users',
  share: 'Share2',
  content: 'FileText',
  result: 'Award',
  waitlist: 'Clock',
  invite: 'UserPlus',
  social_proof: 'TrendingUp',
};

function LoopStatusBadge({ status }: { status: string }) {
  const cls = status === 'active'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'testing'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {status}
    </span>
  );
}

export function ViralEnginePanel() {
  const { data: artifactsData, loading: aLoading } = useViralArtifacts();
  const { data: loopsData, loading: lLoading } = useViralLoops();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const artifacts = artifactsData?.artifacts ?? [];
  const loops = loopsData?.loops ?? [];
  const loading = aLoading || lLoading;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (loading && artifacts.length === 0 && loops.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={16} className="text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-900">Viral Growth Engine</h3>
        </div>
        <span className="text-xs text-gray-400">{loops.filter(l => l.status === 'active').length} active loops</span>
      </div>

      {/* Active Loops */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Loops</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {loops.map((loop) => (
            <div key={loop.id} className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700 capitalize">{loop.loop_type}</span>
                <LoopStatusBadge status={loop.status} />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-0.5">
                  <Eye size={9} /> {loop.metrics?.impressions ?? 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <MousePointer size={9} /> {loop.metrics?.shares ?? 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <Users size={9} /> {loop.metrics?.conversions ?? 0}
                </span>
              </div>
              {loop.conversion_rate > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp size={9} className="text-emerald-600" />
                  <span className="text-[10px] text-emerald-700 font-medium">{(loop.conversion_rate * 100).toFixed(1)}% CVR</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generated Artifacts */}
      {artifacts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Shareable Artifacts ({artifacts.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {artifacts.slice(0, 6).map((artifact) => {
              const content = artifact.content as Record<string, unknown>;
              const text = (content.text ?? content.headline ?? content.subheadline ?? '') as string;
              const hashtags = (content.hashtags as string[]) ?? [];

              return (
                <div key={artifact.id} className="bg-gray-50 rounded-lg px-3 py-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-gray-400 font-mono">{artifact.artifact_type}</span>
                      <span className="text-[10px] text-gray-300">|</span>
                      <span className="text-[10px] text-gray-400">{artifact.trigger_event}</span>
                    </div>
                    <p className="text-xs text-gray-800 line-clamp-2">{text}</p>
                    {hashtags.length > 0 && (
                      <p className="text-[10px] text-teal-600 mt-0.5 truncate">{hashtags.join(' ')}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{artifact.impressions} views</span>
                      <span>{artifact.clicks} clicks</span>
                      <span>{artifact.conversions} conv</span>
                    </div>
                  </div>
                  {text && (
                    <button
                      onClick={() => handleCopy(text + (hashtags.length ? '\n' + hashtags.join(' ') : ''), artifact.id)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedId === artifact.id
                        ? <CheckCircle size={12} className="text-emerald-600" />
                        : <Copy size={12} className="text-gray-400" />
                      }
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {artifacts.length === 0 && (
        <div className="text-center py-3 text-xs text-gray-400">
          Viral artifacts will be generated automatically after payments are confirmed.
        </div>
      )}
    </div>
  );
}
