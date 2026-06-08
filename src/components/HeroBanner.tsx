import { Zap, ArrowRight } from 'lucide-react';
import { useLoopStatus, useMarketingSummary } from '../lib/hooks';
import { Skeleton } from './Skeleton';

export function HeroBanner() {
  const { data: loop, loading: loopLoading } = useLoopStatus();
  const { data: marketing } = useMarketingSummary();

  const variant = loop?.best_variant;

  const headline = variant?.title ?? marketing?.headline ?? 'AI Agents. Real Revenue. On-Chain.';
  const sub =
    variant?.description ??
    marketing?.value_proposition ??
    'Autonomous agents run 24/7 — every confirmed payment settles USDC to your wallet on Base.';
  const cta = variant?.cta ?? 'Unlock paid access — 0.03 USDC';

  const impressions = loop?.metrics.views ?? 0;
  const clicks = loop?.metrics.clicks ?? 0;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-900 text-white">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative px-6 py-10 sm:px-10 sm:py-12">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="flex-1 max-w-xl">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-medium px-3 py-1 rounded-full mb-4 border border-white/10">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live · Autonomous · Base Network
            </div>

            {loopLoading ? (
              <>
                <Skeleton className="h-9 w-80 mb-3 bg-white/10" />
                <Skeleton className="h-4 w-64 bg-white/10" />
              </>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-white">
                  {headline}
                </h1>
                <p className="mt-3 text-sm text-white/60 leading-relaxed max-w-md">{sub}</p>
              </>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#paywall"
                className="inline-flex items-center gap-2 bg-white text-gray-900 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-100 active:scale-95 transition-all"
              >
                <Zap size={15} />
                {cta}
              </a>
              <a
                href="#preview"
                className="inline-flex items-center gap-2 border border-white/20 text-white/80 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-white/5 transition-all"
              >
                Free preview
                <ArrowRight size={14} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:shrink-0">
            <div className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-white/50">Views</span>
              </div>
              {loopLoading ? (
                <Skeleton className="h-5 w-14 bg-white/10" />
              ) : (
                <p className="text-base font-bold text-white">{impressions.toLocaleString()}</p>
              )}
            </div>

            <div className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-white/50">CTR</span>
              </div>
              {loopLoading ? (
                <Skeleton className="h-5 w-14 bg-white/10" />
              ) : (
                <p className="text-base font-bold text-white">{ctr ? `${ctr}%` : '---'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
