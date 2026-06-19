# AI Agent Platform Revenue Sharing Calculator

A comprehensive TypeScript utility for calculating revenue distribution across an AI agent platform ecosystem.

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
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Unique identifier types for type safety
 */
type AgentId = string & { readonly brand: unique symbol };
type ContributorId = string & { readonly brand: unique symbol };
type TransactionId = string & { readonly brand: unique symbol };
type ReferrerId = string & { readonly brand: unique symbol };

/**
 * Monetary amount in the smallest currency unit (e.g., cents)
 * Using number for calculations, but could be bigint for precision
 */
type MonetaryAmount = number;

/**
 * Percentage represented as a decimal (0.0 to 1.0)
 */
type Percentage = number & { readonly brand: unique symbol };

/**
 * Configuration for revenue sharing percentages
 */
interface RevenueShareConfig {
  /** Percentage of gross revenue for executing agent (default: 0.85) */
  readonly agentShare: Percentage;
  /** Percentage of gross revenue for platform (default: 0.15) */
  readonly platformShare: Percentage;
  /** Percentage of platform revenue for contributor pool (default: 0.25) */
  readonly contributorPoolShare: Percentage;
  /** Percentage of agent net earnings for referral bonus (default: 0.25) */
  readonly referralBonusShare: Percentage;
}

/**
 * Represents a single revenue transaction
 */
interface RevenueTransaction {
  readonly transactionId: TransactionId;
  readonly agentId: AgentId;
  readonly grossRevenue: MonetaryAmount;
  readonly timestamp: Date;
  readonly referrerId?: ReferrerId;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Breakdown of revenue distribution for a single transaction
 */
interface RevenueBreakdown {
  readonly transactionId: TransactionId;
  readonly grossRevenue: MonetaryAmount;
  readonly agentEarnings: MonetaryAmount;
  readonly platformRevenue: MonetaryAmount;
  readonly contributorPoolAmount: MonetaryAmount;
  readonly platformNetRevenue: MonetaryAmount;
  readonly referralBonus: MonetaryAmount;
  readonly agentNetAfterReferral: MonetaryAmount;
}

/**
 * Contributor with their share weight in the pool
 */
interface Contributor {
  readonly contributorId: ContributorId;
  readonly name: string;
  readonly shareWeight: number;
  readonly contributionType: ContributionType;
}

/**
 * Types of contributions that earn from the pool
 */
type ContributionType =
  | "model_training"
  | "data_curation"
  | "tool_development"
  | "documentation"
  | "community_support";

/**
 * Distribution of contributor pool among contributors
 */
interface ContributorDistribution {
  readonly contributorId: ContributorId;
  readonly amount: MonetaryAmount;
  readonly sharePercentage: Percentage;
}

/**
 * Aggregated earnings for an agent over a period
 */
interface AgentEarningsSummary {
  readonly agentId: AgentId;
  readonly totalGrossRevenue: MonetaryAmount;
  readonly totalNetEarnings: MonetaryAmount;
  readonly totalReferralPaid: MonetaryAmount;
  readonly transactionCount: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

/**
 * Platform-wide revenue summary
 */
interface PlatformRevenueSummary {
  readonly totalGrossRevenue: MonetaryAmount;
  readonly totalAgentPayouts: MonetaryAmount;
  readonly totalPlatformRevenue: MonetaryAmount;
  readonly totalContributorPool: MonetaryAmount;
  readonly totalReferralBonuses: MonetaryAmount;
  readonly platformNetRevenue: MonetaryAmount;
  readonly transactionCount: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

/**
 * Result type for operations that can fail
 */
type Result<T, E = Error> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Validation error details
 */
interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly value: unknown;
}

// ============================================================================
// TYPE GUARDS AND VALIDATORS
// ============================================================================

/**
 * Creates a branded Percentage type from a number
 * @param value - Number between 0 and 1
 * @returns Branded Percentage or null if invalid
 */
function createPercentage(value: number): Percentage | null {
  if (value >= 0 && value <= 1 && Number.isFinite(value)) {
    return value as Percentage;
  }
  return null;
}

/**
 * Creates a branded AgentId from a string
 * @param value - String identifier
 * @returns Branded AgentId
 */
function createAgentId(value: string): AgentId {
  return value as AgentId;
}

/**
 * Creates a branded TransactionId from a string
 * @param value - String identifier
 * @returns Branded TransactionId
 */
function createTransactionId(value: string): TransactionId {
  return value as TransactionId;
}

/**
 * Creates a branded ContributorId from a string
 * @param value - String identifier
 * @returns Branded ContributorId
 */
function createContributorId(value: string): ContributorId {
  return value as ContributorId;
}

/**
 * Creates a branded ReferrerId from a string
 * @param value - String identifier
 * @returns Branded ReferrerId
 */
function createReferrerId(value: string): ReferrerId {
  return value as ReferrerId;
}

/**
 * Validates a monetary amount
 * @param amount - Amount to validate
 * @returns True if valid non-negative finite number
 */
function isValidMonetaryAmount(amount: unknown): amount is MonetaryAmount {
  return (
    typeof amount === "number" && Number.isFinite(amount) && amount >= 0
  );
}

/**
 * Validates a revenue share configuration
 * @param config - Configuration to validate
 * @returns Result with validation errors if invalid
 */
function validateConfig(
  config: RevenueShareConfig
): Result<RevenueShareConfig, ValidationError[]> {
  const errors: ValidationError[] = [];

  if (config.agentShare < 0 || config.agentShare > 1) {
    errors.push({
      field: "agentShare",
      message: "Must be between 0 and 1",
      value: config.agentShare,
    });
  }

  if (config.platformShare < 0 || config.platformShare > 1) {
    errors.push({
      field: "platformShare",
      message: "Must be between 0 and 1",
      value: config.platformShare,
    });
  }

  const totalShare = config.agentShare + config.platformShare;
  if (Math.abs(totalShare - 1) > 0.0001) {
    errors.push({
      field: "agentShare+platformShare",
      message: "Agent and platform shares must sum to 1",
      value: totalShare,
    });
  }

  if (config.contributorPoolShare < 0 || config.contributorPoolShare > 1) {
    errors.push({
      field: "contributorPoolShare",
      message: "Must be between 0 and 1",
      value: config.contributorPoolShare,
    });
  }

  if (config.referralBonusShare < 0 || config.referralBonusShare > 1) {
    errors.push({
      field: "referralBonusShare",
      message: "Must be between 0 and 1",
      value: config.referralBonusShare,
    });
  }

  return errors.length > 0
    ? { success: false, error: errors }
    : { success: true, value: config };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default revenue sharing configuration
 * - Agent: 85%
 * - Platform: 15%
 * - Contributor Pool: 25% of platform (3.75% of gross)
 * - Referral: 25% of agent net
 */
const DEFAULT_CONFIG: RevenueShareConfig = Object.freeze({
  agentShare: createPercentage(0.85)!,
  platformShare: createPercentage(0.15)!,
  contributorPoolShare: createPercentage(0.25)!,
  referralBonusShare: createPercentage(0.25)!,
});

/**
 * Creates a custom revenue share configuration with validation
 * @param overrides - Partial configuration to override defaults
 * @returns Result containing validated configuration or errors
 */
function createConfig(
  overrides: Partial<{
    agentShare: number;
    platformShare: number;
    contributorPoolShare: number;
    referralBonusShare: number;
  }> = {}
): Result<RevenueShareConfig, ValidationError[]> {
  const config: RevenueShareConfig = {
    agentShare:
      createPercentage(overrides.agentShare ?? 0.85) ?? DEFAULT_CONFIG.agentShare,
    platformShare:
      createPercentage(overrides.platformShare ?? 0.15) ??
      DEFAULT_CONFIG.platformShare,
    contributorPoolShare:
      createPercentage(overrides.contributorPoolShare ?? 0.25) ??
      DEFAULT_CONFIG.contributorPoolShare,
    referralBonusShare:
      createPercentage(overrides.referralBonusShare ?? 0.25) ??
      DEFAULT_CONFIG.referralBonusShare,
  };

  return validateConfig(config);
}

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Rounds a monetary amount to 2 decimal places using banker's rounding
 * @param amount - Amount to round
 * @returns Rounded amount
 */
function roundMoney(amount: MonetaryAmount): MonetaryAmount {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculates the agent's share of gross revenue
 * @param grossRevenue - Total revenue from transaction
 * @param config - Revenue share configuration
 * @returns Agent's earnings before referral deduction
 *
 * @example
 * ```typescript
 * const earnings = calculateAgentEarnings(1000, DEFAULT_CONFIG);
 * // Returns 850 (85% of 1000)
 * ```
 */
function calculateAgentEarnings(
  grossRevenue: MonetaryAmount,
  config: RevenueShareConfig = DEFAULT_CONFIG
): MonetaryAmount {
  if (!isValidMonetaryAmount(grossRevenue)) {
    throw new Error("Invalid gross revenue amount");
  }
  return roundMoney(grossRevenue * config.agentShare);
}

/**
 * Calculates the platform's share of gross revenue
 * @param grossRevenue - Total revenue from transaction
 * @param config - Revenue share configuration
 * @returns Platform's total revenue
 *
 * @example
 * ```typescript
 * const platformRev = calculatePlatformRevenue(1000, DEFAULT_CONFIG);
 * // Returns 150 (15% of 1000)
 * ```
 */
function calculatePlatformRevenue(
  grossRevenue: MonetaryAmount,
  config: RevenueShareConfig = DEFAULT_CONFIG
): MonetaryAmount {
  if (!isValidMonetaryAmount(grossRevenue)) {
    throw new Error("Invalid gross revenue amount");
  }
  return roundMoney(grossRevenue * config.platformShare);
}

/**
 * Calculates the contributor pool amount from platform revenue
 * @param platformRevenue - Platform's share of revenue
 * @param config - Revenue share configuration
 * @returns Amount allocated to contributor pool
 *
 * @example
 * ```typescript
 * const pool = calculateContributorPool(150, DEFAULT_CONFIG);
 * // Returns 37.5 (25% of 150)
 * ```
 */
function calculateContributorPool(
  platformRevenue: MonetaryAmount,
  config: RevenueShareConfig = DEFAULT_CONFIG
): MonetaryAmount {
  if (!isValidMonetaryAmount(platformRevenue)) {
    throw new Error("Invalid platform revenue amount");
  }
  return roundMoney(platformRevenue * config.contributorPoolShare);
}

/**
 * Calculates the referral bonus based on agent's net earnings
 * @param agentNetEarnings - Agent's earnings after platform cut
 * @param config - Revenue share configuration
 * @returns Referral bonus amount
 *
 * @example
 * ```typescript
 * const bonus = calculateReferralBonus(850, DEFAULT_CONFIG);
 * // Returns 212.5 (25% of 850)
 * ```
 */
function calculateReferralBonus(
  agentNetEarnings: MonetaryAmount,
  config: RevenueShareConfig = DEFAULT_CONFIG
): MonetaryAmount {
  if (!isValidMonetaryAmount(agentNetEarnings)) {
    throw new Error("Invalid agent net earnings amount");
  }
  return roundMoney(agentNetEarnings * config.referralBonusShare);
}

/**
 * Calculates complete revenue breakdown for a transaction
 * @param transaction - Revenue transaction to process
 * @param config - Revenue share configuration
 * @returns Complete breakdown of all revenue shares
 *
 * @example
 * ```typescript
 * const transaction = {
 *   transactionId: createTransactionId('tx-001'),
 *   agentId: createAgentId('agent-001'),
 *   grossRevenue: 1000,
 *   timestamp: new Date(),
 *   referrerId: createReferrerId('ref-001')
 * };
 *
 * const breakdown = calculateRevenueBreakdown(transaction);
 * // Returns:
 * // {
 * //   grossRevenue: 1000,
 * //   agentEarnings: 850,
 * //   platformRevenue: 150,
 * //   contributorPoolAmount: 37.5,
 * //   platformNetRevenue: 112.5,
 * //   referralBonus: 212.5,
 * //   agentNetAfterReferral: 637.5
 * // }
 * ```
 */
function calculateRevenueBreakdown(
  transaction: RevenueTransaction,
  config: RevenueShareConfig = DEFAULT_CONFIG
): RevenueBreakdown {
  const { transactionId, grossRevenue, referrerId } = transaction;

  if (!isValidMonetaryAmount(grossRevenue)) {
    throw new Error("Invalid gross revenue in transaction");
  }

  const agentEarnings = calculateAgentEarnings(grossRevenue, config);
  const platformRevenue = calculatePlatformRevenue(grossRevenue, config);
  const contributorPoolAmount = calculateContributorPool(platformRevenue, config);
  const platformNetRevenue = roundMoney(platformRevenue - contributorPoolAmount);

  // Referral bonus only applies if there's a referrer
  const referralBonus = referrerId
    ? calculateReferralBonus(agentEarnings, config)
    : 0;
  const agentNetAfterReferral = roundMoney(agentEarnings - referralBonus);

  return Object.freeze({
    transactionId,
    grossRevenue,
    agentEarnings,
    platformRevenue,
    contributorPoolAmount,
    platform