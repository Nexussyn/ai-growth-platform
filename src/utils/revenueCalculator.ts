# AI Agent Platform Revenue Sharing Calculator

A comprehensive TypeScript utility for calculating revenue distribution in an AI agent platform ecosystem.

```typescript
/**
 * AI Agent Platform Revenue Sharing Calculator
 * 
 * Revenue Distribution Model:
 * - Executing Agent: 85% of gross revenue
 * - Platform: 15% of gross revenue
 *   - Contributor Pool: 25% of platform revenue (3.75% of gross)
 *   - Platform Net: 75% of platform revenue (11.25% of gross)
 * - Referral Bonus: 25% of referred agent's net earnings
 * 
 * @module RevenueSharing
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Percentage value between 0 and 100
 */
type Percentage = number;

/**
 * Monetary amount (non-negative)
 */
type Currency = number;

/**
 * Unique identifier for entities
 */
type EntityId = string;

/**
 * Timestamp in ISO 8601 format
 */
type ISOTimestamp = string;

/**
 * Configuration for revenue sharing percentages
 */
interface RevenueShareConfig {
  /** Percentage of gross revenue for executing agent (default: 85) */
  readonly agentSharePercent: Percentage;
  /** Percentage of gross revenue for platform (default: 15) */
  readonly platformSharePercent: Percentage;
  /** Percentage of platform revenue for contributor pool (default: 25) */
  readonly contributorPoolPercent: Percentage;
  /** Percentage of referred agent earnings for referrer (default: 25) */
  readonly referralBonusPercent: Percentage;
}

/**
 * Breakdown of platform's revenue allocation
 */
interface PlatformRevenueBreakdown {
  /** Total platform revenue before internal distribution */
  readonly grossPlatformRevenue: Currency;
  /** Amount allocated to contributor pool */
  readonly contributorPoolAmount: Currency;
  /** Net platform revenue after contributor pool */
  readonly netPlatformRevenue: Currency;
  /** Percentage breakdowns for transparency */
  readonly percentages: {
    readonly contributorPoolOfGross: Percentage;
    readonly netPlatformOfGross: Percentage;
  };
}

/**
 * Complete revenue distribution for a single transaction
 */
interface RevenueDistribution {
  /** Original transaction amount */
  readonly grossRevenue: Currency;
  /** Amount for the executing agent */
  readonly agentEarnings: Currency;
  /** Detailed platform revenue breakdown */
  readonly platformBreakdown: PlatformRevenueBreakdown;
  /** Timestamp of calculation */
  readonly calculatedAt: ISOTimestamp;
  /** Configuration used for calculation */
  readonly configUsed: RevenueShareConfig;
}

/**
 * Referral relationship between agents
 */
interface ReferralRelationship {
  /** ID of the agent who made the referral */
  readonly referrerId: EntityId;
  /** ID of the referred agent */
  readonly referredAgentId: EntityId;
  /** When the referral relationship was established */
  readonly establishedAt: ISOTimestamp;
  /** Whether the referral is still active */
  readonly isActive: boolean;
}

/**
 * Referral bonus calculation result
 */
interface ReferralBonus {
  /** ID of the referrer receiving the bonus */
  readonly referrerId: EntityId;
  /** ID of the referred agent whose earnings triggered the bonus */
  readonly referredAgentId: EntityId;
  /** The referred agent's net earnings this bonus is based on */
  readonly referredAgentEarnings: Currency;
  /** The calculated referral bonus amount */
  readonly bonusAmount: Currency;
  /** Percentage used for calculation */
  readonly bonusPercentage: Percentage;
}

/**
 * Agent earnings with potential referral deductions
 */
interface AgentNetEarnings {
  /** Agent's ID */
  readonly agentId: EntityId;
  /** Gross earnings before any deductions */
  readonly grossEarnings: Currency;
  /** Referral bonus paid to referrer (if applicable) */
  readonly referralDeduction: Currency;
  /** Final net earnings after all deductions */
  readonly netEarnings: Currency;
  /** Referrer information if applicable */
  readonly referrerInfo: ReferralBonus | null;
}

/**
 * Contributor in the pool
 */
interface Contributor {
  /** Unique contributor ID */
  readonly id: EntityId;
  /** Contributor's name or identifier */
  readonly name: string;
  /** Contribution weight/score for pool distribution */
  readonly contributionWeight: number;
  /** Type of contribution */
  readonly contributionType: ContributionType;
}

/**
 * Types of contributions eligible for pool sharing
 */
type ContributionType = 
  | 'model_training'
  | 'data_provision'
  | 'infrastructure'
  | 'tooling'
  | 'documentation'
  | 'community_support';

/**
 * Individual contributor's share from the pool
 */
interface ContributorShare {
  /** Contributor details */
  readonly contributor: Contributor;
  /** Share amount from the pool */
  readonly shareAmount: Currency;
  /** Percentage of pool received */
  readonly poolPercentage: Percentage;
}

/**
 * Complete contributor pool distribution
 */
interface ContributorPoolDistribution {
  /** Total pool amount being distributed */
  readonly totalPoolAmount: Currency;
  /** Individual contributor shares */
  readonly shares: readonly ContributorShare[];
  /** Sum of all weights for reference */
  readonly totalWeight: number;
  /** Distribution timestamp */
  readonly distributedAt: ISOTimestamp;
}

/**
 * Complete transaction with all revenue calculations
 */
interface TransactionRevenue {
  /** Unique transaction ID */
  readonly transactionId: EntityId;
  /** Executing agent ID */
  readonly agentId: EntityId;
  /** Base revenue distribution */
  readonly distribution: RevenueDistribution;
  /** Agent's net earnings after referral deductions */
  readonly agentNetEarnings: AgentNetEarnings;
  /** Transaction metadata */
  readonly metadata: {
    readonly description: string;
    readonly timestamp: ISOTimestamp;
  };
}

/**
 * Aggregated earnings report for an agent
 */
interface AgentEarningsReport {
  /** Agent ID */
  readonly agentId: EntityId;
  /** Reporting period start */
  readonly periodStart: ISOTimestamp;
  /** Reporting period end */
  readonly periodEnd: ISOTimestamp;
  /** Total gross revenue generated */
  readonly totalGrossRevenue: Currency;
  /** Total earnings before referral deductions */
  readonly totalGrossEarnings: Currency;
  /** Total referral deductions */
  readonly totalReferralDeductions: Currency;
  /** Total net earnings */
  readonly totalNetEarnings: Currency;
  /** Number of transactions */
  readonly transactionCount: number;
  /** Referral bonuses earned (as a referrer) */
  readonly referralBonusesEarned: Currency;
  /** Final total earnings (net + referral bonuses) */
  readonly finalTotalEarnings: Currency;
}

/**
 * Platform-wide revenue report
 */
interface PlatformRevenueReport {
  /** Reporting period start */
  readonly periodStart: ISOTimestamp;
  /** Reporting period end */
  readonly periodEnd: ISOTimestamp;
  /** Total gross revenue across all transactions */
  readonly totalGrossRevenue: Currency;
  /** Total platform revenue */
  readonly totalPlatformRevenue: Currency;
  /** Total contributor pool amount */
  readonly totalContributorPool: Currency;
  /** Total net platform revenue */
  readonly totalNetPlatformRevenue: Currency;
  /** Total paid to agents */
  readonly totalAgentPayouts: Currency;
  /** Total referral bonuses paid */
  readonly totalReferralBonuses: Currency;
  /** Transaction count */
  readonly transactionCount: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default revenue sharing configuration
 * @constant
 */
const DEFAULT_CONFIG: RevenueShareConfig = {
  agentSharePercent: 85,
  platformSharePercent: 15,
  contributorPoolPercent: 25,
  referralBonusPercent: 25,
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a validated revenue share configuration
 * 
 * @param partial - Partial configuration to merge with defaults
 * @returns Complete validated configuration
 * @throws Error if percentages are invalid
 * 
 * @example
 * ```typescript
 * const config = createConfig({ agentSharePercent: 80 });
 * // Returns: { agentSharePercent: 80, platformSharePercent: 15, ... }
 * ```
 */
const createConfig = (
  partial: Partial<RevenueShareConfig> = {}
): RevenueShareConfig => {
  const config: RevenueShareConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
  };

  // Validate percentages
  if (config.agentSharePercent + config.platformSharePercent !== 100) {
    throw new Error(
      `Agent share (${config.agentSharePercent}%) and platform share ` +
      `(${config.platformSharePercent}%) must sum to 100%`
    );
  }

  const percentages = [
    config.agentSharePercent,
    config.platformSharePercent,
    config.contributorPoolPercent,
    config.referralBonusPercent,
  ];

  if (percentages.some(p => p < 0 || p > 100)) {
    throw new Error('All percentages must be between 0 and 100');
  }

  return config;
};

/**
 * Calculates percentage of an amount
 * 
 * @param amount - Base amount
 * @param percentage - Percentage to calculate
 * @returns Calculated amount rounded to 2 decimal places
 * 
 * @example
 * ```typescript
 * calculatePercentage(1000, 15); // Returns: 150
 * ```
 */
const calculatePercentage = (
  amount: Currency,
  percentage: Percentage
): Currency => {
  if (amount < 0) {
    throw new Error('Amount cannot be negative');
  }
  return Math.round((amount * percentage / 100) * 100) / 100;
};

/**
 * Gets current ISO timestamp
 * 
 * @returns Current timestamp in ISO 8601 format
 */
const getCurrentTimestamp = (): ISOTimestamp => new Date().toISOString();

// ============================================================================
// Core Revenue Calculation Functions
// ============================================================================

/**
 * Calculates the complete revenue distribution for a transaction
 * 
 * @param grossRevenue - Total transaction revenue
 * @param config - Revenue sharing configuration (optional, uses defaults)
 * @returns Complete revenue distribution breakdown
 * 
 * @example
 * ```typescript
 * const distribution = calculateRevenueDistribution(1000);
 * // Returns:
 * // {
 * //   grossRevenue: 1000,
 * //   agentEarnings: 850,
 * //   platformBreakdown: {
 * //     grossPlatformRevenue: 150,
 * //     contributorPoolAmount: 37.5,
 * //     netPlatformRevenue: 112.5,
 * //     ...
 * //   },
 * //   ...
 * // }
 * ```
 */
const calculateRevenueDistribution = (
  grossRevenue: Currency,
  config: RevenueShareConfig = DEFAULT_CONFIG
): RevenueDistribution => {
  if (grossRevenue < 0) {
    throw new Error('Gross revenue cannot be negative');
  }

  const agentEarnings = calculatePercentage(grossRevenue, config.agentSharePercent);
  const grossPlatformRevenue = calculatePercentage(grossRevenue, config.platformSharePercent);
  const contributorPoolAmount = calculatePercentage(
    grossPlatformRevenue,
    config.contributorPoolPercent
  );
  const netPlatformRevenue = grossPlatformRevenue - contributorPoolAmount;

  const platformBreakdown: PlatformRevenueBreakdown = {
    grossPlatformRevenue,
    contributorPoolAmount,
    netPlatformRevenue,
    percentages: {
      contributorPoolOfGross: (contributorPoolAmount / grossRevenue) * 100,
      netPlatformOfGross: (netPlatformRevenue / grossRevenue) * 100,
    },
  };

  return {
    grossRevenue,
    agentEarnings,
    platformBreakdown,
    calculatedAt: getCurrentTimestamp(),
    configUsed: config,
  };
};

/**
 * Calculates referral bonus based on referred agent's earnings
 * 
 * @param referredAgentEarnings - Net earnings of the referred agent
 * @param referralRelationship - The referral relationship details
 * @param config - Revenue sharing configuration
 * @returns Referral bonus calculation result
 * 
 * @example
 * ```typescript
 * const relationship: ReferralRelationship = {
 *   referrerId: 'agent-001',
 *   referredAgentId: 'agent-002',
 *   establishedAt: '2024-01-01T00:00:00Z',
 *   isActive: true,
 * };
 * const bonus = calculateReferralBonus(850, relationship);
 * // Returns: { bonusAmount: 212.5, ... }
 * ```
 */
const calculateReferralBonus = (
  referredAgentEarnings: Currency,
  referralRelationship: ReferralRelationship,
  config: RevenueShareConfig = DEFAULT_CONFIG
): ReferralBonus => {
  if (!referralRelationship.isActive) {
    return {
      referrerId: referralRelationship.referrerId,
      referredAgentId: referralRelationship.referredAgentId,
      referredAgentEarnings,
      bonusAmount: 0,
      bonusPercentage: 0,
    };
  }

  const bonusAmount = calculatePercentage(
    referredAgentEarnings,
    config.referralBonusPercent
  );

  return {
    referrerId: referralRelationship.referrerId,
    referredAgentId: referralRelationship.referredAgentId,
    referredAgentEarnings,
    bonusAmount,
    bonusPercentage: config.referralBonusPercent,
  };
};

/**
 * Calculates agent's net earnings including referral deductions
 * 
 * @param agentId - The agent's unique identifier
 * @param grossEarnings - Agent's gross earnings from revenue share
 * @param referralRelationship - Optional referral relationship (if agent was referred)
 * @param config - Revenue sharing configuration
 * @returns Agent's complete net earnings breakdown
 * 
 * @example
 * ```typescript
 * const netEarnings = calculateAgentNetEarnings('agent-002', 850, referralRelationship);
 * // Returns net earnings after referral deduction to referrer
 * ```
 */
const calculateAgentNetEarnings = (
  agentId: EntityId,
  grossEarnings: Currency,
  referralRelationship: ReferralRelationship | null = null,
  config: RevenueShareConfig = DEFAULT_CONFIG
): AgentNetEarnings => {
  if (referralRelationship === null || !referralRelationship.isActive) {
    return {
      agentId,
      grossEarnings,
      referralDeduction: 0,
      netEarnings: grossEarnings,
      referrerInfo: null,
    };
  }

  const referralBonus = calculateReferralBonus(
    grossEarnings,
    referralRelationship,
    config
  );

  return {
    agentId,
    grossEarnings,
    referralDeduction: referralBonus.bonusAmount,
    netEarnings: grossEarnings - referralBonus.bonusAmount,
    referrer