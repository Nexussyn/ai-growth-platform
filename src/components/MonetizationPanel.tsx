import { useEffect, useRef, useState, useCallback } from 'react';
import { CreditCard, Users, Zap, Gift, AlertTriangle, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { useMonetizationSummary } from '../lib/hooks';
import { edgeFetch } from '../lib/supabase';
import { Skeleton } from './Skeleton';
import type { PricingPlan } from '../lib/types';

function getOrCreateSessionId(): string {
  const key = 'multi_ai_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function MonetizationPanel() {
  const { data, loading } = useMonetizationSummary();
  const activatedRef = useRef(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);
  const [activating, setActivating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    const sessionId = getOrCreateSessionId();
    edgeFetch('/subscription/activate-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: sessionId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.activated || d.already_active) {
          setCurrentPlan('free');
          setCredits(d.credits_remaining ?? 10);
        }
      })
      .catch(() => null);
  }, []);

  const handlePlanSelect = useCallback(async (plan: PricingPlan) => {
    const sessionId = getOrCreateSessionId();

    if (plan.plan_key === 'free') {
      setActivating('free');
      try {
        const res = await edgeFetch('/subscription/activate-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: sessionId }),
        });
        const d = await res.json();
        if (d.activated || d.already_active) {
          setCurrentPlan('free');
          setCredits(d.credits_remaining ?? 10);
          setToast('Free plan activated. 10 credits granted.');
        }
      } catch { setToast('Failed to activate free plan.'); }
      setActivating(null);
      return;
    }

    setActivating(plan.plan_key);
    try {
      const res = await edgeFetch('/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: sessionId, plan_key: plan.plan_key, billing_cycle: 'monthly' }),
      });
      const d = await res.json();
      if (d.subscription) {
        setCurrentPlan(plan.plan_key);
        setCredits(plan.included_credits);
        setToast(`${plan.name} plan activated. ${plan.included_credits} credits granted.`);
      } else {
        setToast(d.error ?? 'Failed to activate plan.');
      }
    } catch { setToast('Network error. Try again.'); }
    setActivating(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const plans = data?.plans ?? [];
  const activeSubs = data?.active_subscriptions ?? 0;
  const usage24h = data?.usage_24h_credits ?? 0;
  const referralRewards = data?.referral_rewards_issued ?? 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Monetization Engine</h3>
        </div>
        <span className="text-xs text-gray-400">{plans.length} plans active</span>
      </div>

      <div className="p-6 space-y-5">
        {toast && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 animate-pulse">
            <CheckCircle size={13} className="text-emerald-500 shrink-0" />
            <span className="text-xs text-emerald-700 font-medium">{toast}</span>
          </div>
        )}

        {/* Operational metrics only - no revenue figures */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="Active Subscriptions" value={activeSubs.toString()} icon={<Users size={13} />} color="blue" />
          <MetricCard label="Usage (24h)" value={`${usage24h} credits`} icon={<Zap size={13} />} color="emerald" />
          <MetricCard label="Referral Rewards" value={`${referralRewards} credits`} icon={<Gift size={13} />} color="teal" />
        </div>

        {/* Current plan + credits */}
        {currentPlan && (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-sm font-medium text-emerald-800">
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
              </span>
            </div>
            <div className="text-sm font-bold text-emerald-700">{credits} credits remaining</div>
          </div>
        )}

        {/* Clickable Plans */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Select a plan to activate</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.plan_key;
              const isLoading = activating === plan.plan_key;
              return (
                <button
                  key={plan.plan_key}
                  onClick={() => handlePlanSelect(plan)}
                  disabled={isCurrent || isLoading}
                  className={`border rounded-xl p-4 text-center transition-all cursor-pointer hover:shadow-md active:scale-[0.97] disabled:cursor-default disabled:hover:shadow-none disabled:active:scale-100 ${
                    isCurrent
                      ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-900">{plan.name}</p>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {Number(plan.price_usdc_monthly) === 0 ? 'Free' : `$${plan.price_usdc_monthly}`}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {Number(plan.price_usdc_monthly) === 0 ? '' : '/month · '}{plan.included_credits} credits
                  </p>
                  <div className="mt-2">
                    {isLoading ? (
                      <Loader2 size={14} className="mx-auto animate-spin text-gray-400" />
                    ) : isCurrent ? (
                      <span className="text-[10px] font-medium text-emerald-600">Current plan</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500">
                        Select <ArrowRight size={9} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credits exhaustion warning */}
        {currentPlan && credits === 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700">
              <p className="font-medium">Credits exhausted</p>
              <p className="mt-0.5">Select a higher plan to continue using the service, or wait for your next billing cycle.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    teal: 'bg-teal-50 border-teal-100 text-teal-700',
    gray: 'bg-gray-50 border-gray-100 text-gray-600',
  };
  const classes = colorMap[color] ?? colorMap.gray;

  return (
    <div className={`rounded-lg border p-3 ${classes}`}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-70">{icon}<span className="text-[10px] font-medium">{label}</span></div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
