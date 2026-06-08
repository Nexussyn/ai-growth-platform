import { useState } from 'react';
import { Share2, Copy, CheckCircle, Users } from 'lucide-react';
import { useReferralData, useViralData } from '../lib/hooks';
import { Skeleton } from './Skeleton';
import { ErrorState } from './States';

export function ReferralCard() {
  const { data: referral, loading: refLoading, error: refError } = useReferralData();
  const { data: viral } = useViralData();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const shareTexts = referral?.share_texts ?? viral?.share_texts ?? [
    'AI agents earning USDC on Base — free preview, 0.03 USDC paid access.',
    'Earn 20% affiliate commission on every referral. No code needed.',
  ];

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const commission = referral?.commission_pct ?? 20;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 shrink-0">
            <Users size={15} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Referral Program</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Earn {commission}% on every paid call you refer
            </p>
          </div>
        </div>
        {!refLoading && !refError && (
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
            {commission}% commission · {referral?.currency ?? 'USDC'}
          </span>
        )}
      </div>

      <div className="px-6 pb-6 space-y-4">
        {refError && (
          <ErrorState message="Referral data unavailable — showing default share copy" />
        )}

        {refLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Share text cards */}
            <div className="space-y-2">
              {shareTexts.slice(0, 3).map((text, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3"
                >
                  <p className="text-sm text-gray-700 leading-relaxed flex-1">{text}</p>
                  <button
                    onClick={() => copyText(text, i)}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                    title="Copy"
                  >
                    {copiedIdx === i ? (
                      <CheckCircle size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Hashtags */}
            {(referral?.hashtags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(referral?.hashtags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Share CTA */}
            <button
              onClick={() =>
                copyText(
                  `${shareTexts[0]} ${(referral?.hashtags ?? []).join(' ')}`,
                  99
                )
              }
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
            >
              <Share2 size={14} />
              {copiedIdx === 99 ? 'Copied to clipboard!' : 'Copy full share message'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
