import { Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProductLanding } from './components/ProductLanding';
import { DemoProduct } from './components/DemoProduct';
import { WalletConfigBanner } from './components/WalletConfigBanner';
import { HeroBanner } from './components/HeroBanner';
import { RevenueMetricTiles } from './components/SystemStats';
import { PaywallCard } from './components/PaywallCard';
import { ReferralCard } from './components/ReferralCard';
import { PayoutMonitor } from './components/PayoutMonitor';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { GrowthPhasesPanel } from './components/GrowthPhasesPanel';
import { DiversificationPanel } from './components/DiversificationPanel';
import { ReconciliationPanel } from './components/ReconciliationPanel';
import { AgentPyramidPanel } from './components/AgentPyramidPanel';
import { VariantTestingPanel } from './components/VariantTestingPanel';
import { HealthPanel } from './components/HealthPanel';
import { ImprovementPanel } from './components/ImprovementPanel';
import { SchedulerPanel } from './components/SchedulerPanel';
import { SecurityDashboard } from './components/SecurityDashboard';
import { RecruiterPanel } from './components/RecruiterPanel';
import { EngineStatusPanel } from './components/EngineStatusPanel';
import { AutonomousEnginePanel } from './components/AutonomousEnginePanel';
import { ViralEnginePanel } from './components/ViralEnginePanel';
import { ProfitPanel } from './components/ProfitPanel';
import { MonetizationPanel } from './components/MonetizationPanel';
import { LiveOrchestratorPanel } from './components/LiveOrchestratorPanel';
import { AgentCommunicationPanel } from './components/AgentCommunicationPanel';
import { ReplicationPanel } from './components/ReplicationPanel';
import { ExpansionDashboard } from './components/ExpansionDashboard';
import { RevenueProofPanel } from './components/RevenueProofPanel';
import { NotificationsPanel } from './components/NotificationsPanel';
import { OpenWorldDashboard } from './components/OpenWorldDashboard';
import { CanonicalStatusPanel } from './components/CanonicalStatusPanel';
import { DecentralizedPaymentsPanel } from './components/DecentralizedPaymentsPanel';
import { AgenticPartnershipPanel } from './components/AgenticPartnershipPanel';
import { DefiOpportunisticPanel } from './components/DefiOpportunisticPanel';
import { BrokerageCommissionPanel } from './components/BrokerageCommissionPanel';
import { ViralReferralPanel } from './components/ViralReferralPanel';
import { useDashboardState } from './lib/hooks';
import { useState } from 'react';

function Header({ view, onViewChange, productionOnly, onToggleProduction }: { view: 'products' | 'admin'; onViewChange: (v: 'products' | 'admin') => void; productionOnly: boolean; onToggleProduction: () => void }) {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <Cpu size={14} className="text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">AI Growth Platform</span>
            <span className="text-xs text-gray-400 hidden sm:block">Autonomous Revenue Engine</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => onViewChange('products')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Products
            </button>
            <button
              onClick={() => onViewChange('admin')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              System
            </button>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            Live
          </span>
          {view === 'admin' && (
            <button
              onClick={onToggleProduction}
              className={`hidden sm:flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                productionOnly
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}
            >
              {productionOnly ? 'Production Only' : 'Show All'}
            </button>
          )}
          <a
            href="#paywall"
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Unlock paid access
          </a>
        </div>
      </div>
    </header>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-100" />
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide shrink-0">{label}</span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  );
}

function StaleDataBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-amber-700 text-sm">
        <AlertTriangle size={14} />
        <span>Showing cached data. Live connection interrupted.</span>
      </div>
      <button
        onClick={onRefresh}
        className="flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900"
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

function Footer({ version }: { version: string | null }) {
  return (
    <footer className="border-t border-gray-100 mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-xs text-gray-400">Multi-AI Autonomous System · Base Network · USDC · {version ?? '—'}</p>
        <p className="text-xs text-gray-300">
          All payment routing server-side · No wallet keys in client · Auto-refreshes every 15s
        </p>
      </div>
    </footer>
  );
}

// Panels shared between products and admin views — rendered once per view switch,
// no duplicate mounts when both views are active.
function SharedMonetizationPanels() {
  return (
    <>
      <ErrorBoundary label="Decentralized Payments">
        <DecentralizedPaymentsPanel />
      </ErrorBoundary>
      <ErrorBoundary label="DeFi Opportunistic Phase">
        <DefiOpportunisticPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Brokerage Commission Engine">
        <BrokerageCommissionPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Viral Referral Engine">
        <ViralReferralPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Agentic Partnership Program">
        <AgenticPartnershipPanel />
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  const [view, setView] = useState<'products' | 'admin'>('products');
  const [productionOnly, setProductionOnly] = useState(true);
  const { data: state, error, loading, refresh } = useDashboardState();

  const phases = state?.growth_phases ?? [];
  const diversification = state?.diversification ?? [];
  const variants = state?.variants ?? [];
  const healthChecks = state?.health_checks ?? [];
  const reconciliation = state?.reconciliation ?? [];
  const agentRuns = state?.recent_agent_runs ?? [];
  const improvement = state?.improvement;
  // Bug fix #3: version is null when state is not yet loaded — no hardcoded fallback
  const version = state?.version ?? null;

  const hasVariants = variants.length > 0;
  const hasPhases = phases.length > 0;
  const hasDiversification = diversification.length > 0;
  const hasHealthChecks = healthChecks.length > 0;
  const hasReconciliation = reconciliation.length > 0;
  const hasAgentRuns = agentRuns.length > 0;
  const hasImprovement = improvement && (improvement.proposals?.length > 0 || improvement.signals?.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Header view={view} onViewChange={setView} productionOnly={productionOnly} onToggleProduction={() => setProductionOnly(p => !p)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {view === 'products' ? (
          <ErrorBoundary label="Product Landing">
            <ProductLanding />
            <div className="mt-10">
              <SectionDivider label="Pay directly on Base" />
              <div className="mt-6">
                <SharedMonetizationPanels />
              </div>
            </div>
            {/* Bug fix #1: id="paywall" added so the header anchor href="#paywall" scrolls correctly */}
            <div id="paywall" className="mt-10">
              <SectionDivider label="Paid Access" />
              <div className="mt-6 max-w-2xl mx-auto">
                <PaywallCard />
              </div>
            </div>
          </ErrorBoundary>
        ) : (
          <>
            {error && <StaleDataBanner onRefresh={refresh} />}

            <ErrorBoundary label="Canonical Runtime State">
              <CanonicalStatusPanel />
            </ErrorBoundary>

            {/* Bug fix #2: SharedMonetizationPanels replaces the duplicated inline blocks */}
            <SharedMonetizationPanels />

            <ErrorBoundary label="Live Activity">
              <DemoProduct />
            </ErrorBoundary>

            <ErrorBoundary label="Open World Runtime">
              <OpenWorldDashboard />
            </ErrorBoundary>

            <ErrorBoundary label="Wallet Config Banner">
              <WalletConfigBanner />
            </ErrorBoundary>

            <ErrorBoundary label="Autonomous Engine">
              <AutonomousEnginePanel />
            </ErrorBoundary>

            <ErrorBoundary label="Hero Banner">
              <HeroBanner />
            </ErrorBoundary>

            <SectionDivider label="Live performance" />
            <ErrorBoundary label="Revenue Metrics">
              <RevenueMetricTiles />
            </ErrorBoundary>

            <SectionDivider label="Monetize" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ErrorBoundary label="Paywall Card">
                <PaywallCard />
              </ErrorBoundary>
              <ErrorBoundary label="Referral Card">
                <ReferralCard />
              </ErrorBoundary>
            </div>

            <ErrorBoundary label="Monetization Engine">
              <MonetizationPanel />
            </ErrorBoundary>

            {(!productionOnly) && (
              <>
                <SectionDivider label="Viral growth" />
                <ErrorBoundary label="Viral Engine">
                  <ViralEnginePanel />
                </ErrorBoundary>
              </>
            )}

            <SectionDivider label="Autonomous scheduler" />
            <ErrorBoundary label="Scheduler">
              <SchedulerPanel />
            </ErrorBoundary>

            <SectionDivider label="Execution engine" />
            <ErrorBoundary label="Engine Status">
              <EngineStatusPanel />
            </ErrorBoundary>

            <SectionDivider label="Live orchestrator" />
            <ErrorBoundary label="Live Orchestrator">
              <LiveOrchestratorPanel />
            </ErrorBoundary>

            {(!productionOnly) && (
              <>
                <SectionDivider label="Agent communication" />
                <ErrorBoundary label="Agent Communication">
                  <AgentCommunicationPanel />
                </ErrorBoundary>

                <SectionDivider label="Network & replication" />
                <ErrorBoundary label="Replication">
                  <ReplicationPanel />
                </ErrorBoundary>

                <SectionDivider label="Expansion engine" />
                <ErrorBoundary label="Expansion">
                  <ExpansionDashboard />
                </ErrorBoundary>
              </>
            )}

            {(!productionOnly || hasAgentRuns) && (
              <>
                <SectionDivider label="Agent orchestration" />
                <ErrorBoundary label="Agent Pyramid">
                  <AgentPyramidPanel runs={agentRuns} loading={loading} />
                </ErrorBoundary>
              </>
            )}

            {(!productionOnly || hasVariants) && (
              <>
                <SectionDivider label="Experiment variants" />
                <ErrorBoundary label="Variant Testing">
                  <VariantTestingPanel variants={variants} loading={loading} />
                </ErrorBoundary>
              </>
            )}

            {(!productionOnly || hasPhases || hasDiversification) && (
              <>
                <SectionDivider label="Growth phases" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ErrorBoundary label="Growth Phases">
                    <GrowthPhasesPanel phases={phases} loading={loading} />
                  </ErrorBoundary>
                  <ErrorBoundary label="Diversification">
                    <DiversificationPanel dimensions={diversification} loading={loading} />
                  </ErrorBoundary>
                </div>
              </>
            )}

            <SectionDivider label="Profit engine & deployment" />
            <ErrorBoundary label="Profit Panel">
              <ProfitPanel />
            </ErrorBoundary>

            <SectionDivider label="Revenue routing" />
            <ErrorBoundary label="Revenue Proof">
              <RevenueProofPanel />
            </ErrorBoundary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ErrorBoundary label="Payout Monitor">
                <PayoutMonitor />
              </ErrorBoundary>
              <ErrorBoundary label="Orchestrator Panel">
                <OrchestratorPanel />
              </ErrorBoundary>
            </div>

            {(!productionOnly || hasImprovement) && (
              <>
                <SectionDivider label="Continuous improvement" />
                <ErrorBoundary label="Improvement Engine">
                  <ImprovementPanel improvement={improvement} loading={loading} />
                </ErrorBoundary>
              </>
            )}

            {(!productionOnly || hasHealthChecks || hasReconciliation) && (
              <>
                <SectionDivider label="System health & audit" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ErrorBoundary label="Health Panel">
                    <HealthPanel checks={healthChecks} loading={loading} />
                  </ErrorBoundary>
                  <ErrorBoundary label="Reconciliation">
                    <ReconciliationPanel entries={reconciliation} loading={loading} />
                  </ErrorBoundary>
                </div>
              </>
            )}

            <SectionDivider label="Security & governance" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ErrorBoundary label="Security Dashboard">
                <SecurityDashboard />
              </ErrorBoundary>
              <ErrorBoundary label="Recruiter">
                <RecruiterPanel />
              </ErrorBoundary>
            </div>

            <SectionDivider label="Notifications & observability" />
            <ErrorBoundary label="Notifications">
              <NotificationsPanel />
            </ErrorBoundary>
          </>
        )}
      </main>

      <Footer version={version} />
    </div>
  );
}
