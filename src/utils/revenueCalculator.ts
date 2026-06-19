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
// TYPES & INTERFACES
// ============================================================================

/**
 * Configuration constants for revenue sharing percentages
 */
interface RevenueShareConfig {
  /** Percentage of gross revenue going to executing agent (0-1) */
  readonly agentShare: number;
  /** Percentage of gross revenue going to platform (0-1) */
  readonly platformShare: number;
  /** Percentage of platform revenue going to contributor pool (0-1) */
  readonly contributorPoolShare: number;
  /** Percentage of referred agent's net earnings going to referrer (0-1) */
  readonly referralShare: number;
}

/**
 * Represents a monetary amount with currency
 */
interface Money {
  /** Amount in smallest currency unit (e.g., cents) */
  readonly amount: number;
  /** ISO 4217 currency code */
  readonly currency: string;
}

/**
 * Unique identifier types for type safety
 */
type AgentId = string & { readonly __brand: 'AgentId' };
type TransactionId = string & { readonly __brand: 'TransactionId' };
type ContributorId = string & { readonly __brand: 'ContributorId' };

/**
 * Represents a single transaction on the platform
 */
interface Transaction {
  /** Unique transaction identifier */
  readonly id: TransactionId;
  /** ID of the agent that executed the task */
  readonly executingAgentId: AgentId;
  /** Gross revenue from the transaction */
  readonly grossRevenue: Money;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Optional referrer agent ID */
  readonly referrerAgentId?: AgentId;
}

/**
 * Breakdown of revenue distribution for a single transaction
 */
interface RevenueBreakdown {
  /** Original transaction reference */
  readonly transactionId: TransactionId;
  /** Gross revenue before any splits */
  readonly grossRevenue: Money;
  /** Amount going to the executing agent */
  readonly agentEarnings: Money;
  /** Total amount going to the platform */
  readonly platformRevenue: Money;
  /** Amount allocated to contributor pool */
  readonly contributorPoolAllocation: Money;
  /** Platform's net revenue after contributor pool */
  readonly platformNetRevenue: Money;
  /** Referral bonus (if applicable) */
  readonly referralBonus: Money | null;
  /** Agent's final earnings after referral deduction */
  readonly agentNetEarnings: Money;
}

/**
 * Contributor's share of the contributor pool
 */
interface ContributorShare {
  /** Unique contributor identifier */
  readonly contributorId: ContributorId;
  /** Contributor's weight in the pool (0-1) */
  readonly weight: number;
  /** Calculated share amount */
  readonly shareAmount: Money;
}

/**
 * Distribution of contributor pool among contributors
 */
interface ContributorPoolDistribution {
  /** Total pool amount being distributed */
  readonly totalPoolAmount: Money;
  /** Individual contributor shares */
  readonly shares: readonly ContributorShare[];
  /** Timestamp of distribution calculation */
  readonly calculatedAt: string;
}

/**
 * Aggregated earnings for an agent over a period
 */
interface AgentEarningsSummary {
  /** Agent identifier */
  readonly agentId: AgentId;
  /** Total gross revenue generated */
  readonly totalGrossRevenue: Money;
  /** Total earnings from executing tasks */
  readonly totalExecutionEarnings: Money;
  /** Total referral bonuses earned */
  readonly totalReferralBonuses: Money;
  /** Total referral deductions (paid to referrers) */
  readonly totalReferralDeductions: Money;
  /** Final net earnings */
  readonly netEarnings: Money;
  /** Number of transactions */
  readonly transactionCount: number;
  /** Period start (ISO 8601) */
  readonly periodStart: string;
  /** Period end (ISO 8601) */
  readonly periodEnd: string;
}

/**
 * Platform-wide revenue summary
 */
interface PlatformRevenueSummary {
  /** Total gross revenue across all transactions */
  readonly totalGrossRevenue: Money;
  /** Total paid to agents */
  readonly totalAgentPayouts: Money;
  /** Total platform revenue */
  readonly totalPlatformRevenue: Money;
  /** Total allocated to contributor pool */
  readonly totalContributorPoolAllocation: Money;
  /** Platform's net revenue */
  readonly platformNetRevenue: Money;
  /** Total referral bonuses paid */
  readonly totalReferralBonuses: Money;
  /** Number of transactions */
  readonly transactionCount: number;
  /** Period start (ISO 8601) */
  readonly periodStart: string;
  /** Period end (ISO 8601) */
  readonly periodEnd: string;
}

/**
 * Result type for operations that can fail
 */
type Result<T, E = Error> = 
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Validation error types
 */
type ValidationError = 
  | { readonly type: 'INVALID_AMOUNT'; readonly message: string }
  | { readonly type: 'CURRENCY_MISMATCH'; readonly message: string }
  | { readonly type: 'INVALID_PERCENTAGE'; readonly message: string }
  | { readonly type: 'INVALID_WEIGHTS'; readonly message: string };

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default revenue sharing configuration
 */
const DEFAULT_CONFIG: RevenueShareConfig = {
  agentShare: 0.85,
  platformShare: 0.15,
  contributorPoolShare: 0.25,
  referralShare: 0.25,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a branded AgentId from a string
 * @param id - Raw string identifier
 * @returns Branded AgentId
 */
const createAgentId = (id: string): AgentId => id as AgentId;

/**
 * Creates a branded TransactionId from a string
 * @param id - Raw string identifier
 * @returns Branded TransactionId
 */
const createTransactionId = (id: string): TransactionId => id as TransactionId;

/**
 * Creates a branded ContributorId from a string
 * @param id - Raw string identifier
 * @returns Branded ContributorId
 */
const createContributorId = (id: string): ContributorId => id as ContributorId;

/**
 * Creates a Money object with validation
 * @param amount - Amount in smallest currency unit
 * @param currency - ISO 4217 currency code
 * @returns Result containing Money or validation error
 */
const createMoney = (
  amount: number,
  currency: string
): Result<Money, ValidationError> => {
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      success: false,
      error: {
        type: 'INVALID_AMOUNT',
        message: `Invalid amount: ${amount}. Must be a non-negative finite number.`,
      },
    };
  }

  return {
    success: true,
    value: {
      amount: Math.round(amount), // Ensure integer for currency precision
      currency: currency.toUpperCase(),
    },
  };
};

/**
 * Creates a zero Money object for a given currency
 * @param currency - ISO 4217 currency code
 * @returns Money object with zero amount
 */
const zeroMoney = (currency: string): Money => ({
  amount: 0,
  currency: currency.toUpperCase(),
});

/**
 * Adds two Money objects together
 * @param a - First money amount
 * @param b - Second money amount
 * @returns Result containing sum or currency mismatch error
 */
const addMoney = (a: Money, b: Money): Result<Money, ValidationError> => {
  if (a.currency !== b.currency) {
    return {
      success: false,
      error: {
        type: 'CURRENCY_MISMATCH',
        message: `Cannot add ${a.currency} and ${b.currency}`,
      },
    };
  }

  return {
    success: true,
    value: {
      amount: a.amount + b.amount,
      currency: a.currency,
    },
  };
};

/**
 * Subtracts one Money object from another
 * @param a - Amount to subtract from
 * @param b - Amount to subtract
 * @returns Result containing difference or error
 */
const subtractMoney = (a: Money, b: Money): Result<Money, ValidationError> => {
  if (a.currency !== b.currency) {
    return {
      success: false,
      error: {
        type: 'CURRENCY_MISMATCH',
        message: `Cannot subtract ${b.currency} from ${a.currency}`,
      },
    };
  }

  return {
    success: true,
    value: {
      amount: Math.max(0, a.amount - b.amount),
      currency: a.currency,
    },
  };
};

/**
 * Multiplies a Money amount by a percentage
 * @param money - Base money amount
 * @param percentage - Percentage as decimal (0-1)
 * @returns Result containing product or validation error
 */
const multiplyMoney = (
  money: Money,
  percentage: number
): Result<Money, ValidationError> => {
  if (percentage < 0 || percentage > 1) {
    return {
      success: false,
      error: {
        type: 'INVALID_PERCENTAGE',
        message: `Invalid percentage: ${percentage}. Must be between 0 and 1.`,
      },
    };
  }

  return {
    success: true,
    value: {
      amount: Math.round(money.amount * percentage),
      currency: money.currency,
    },
  };
};

/**
 * Formats Money for display
 * @param money - Money object to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 */
const formatMoney = (money: Money, locale: string = 'en-US'): string => {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  });
  
  // Convert from smallest unit (cents) to main unit (dollars)
  return formatter.format(money.amount / 100);
};

// ============================================================================
// CORE REVENUE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculates the complete revenue breakdown for a single transaction
 * 
 * @description
 * Splits gross revenue according to the platform's revenue sharing model:
 * - 85% to executing agent
 * - 15% to platform (of which 25% goes to contributor pool)
 * - If referred, 25% of agent's net earnings goes to referrer
 * 
 * @param transaction - The transaction to calculate revenue for
 * @param config - Revenue sharing configuration (defaults to platform standard)
 * @returns Result containing revenue breakdown or validation error
 * 
 * @example
 * ```typescript
 * const transaction: Transaction = {
 *   id: createTransactionId('txn-001'),
 *   executingAgentId: createAgentId('agent-001'),
 *   grossRevenue: { amount: 10000, currency: 'USD' }, // $100.00
 *   timestamp: new Date().toISOString(),
 *   referrerAgentId: createAgentId('agent-002'),
 * };
 * 
 * const result = calculateRevenueBreakdown(transaction);
 * if (result.success) {
 *   console.log(result.value.agentNetEarnings); // Agent's final earnings
 * }
 * ```
 */
const calculateRevenueBreakdown = (
  transaction: Transaction,
  config: RevenueShareConfig = DEFAULT_CONFIG
): Result<RevenueBreakdown, ValidationError> => {
  const { grossRevenue } = transaction;

  // Calculate agent's base earnings (85%)
  const agentEarningsResult = multiplyMoney(grossRevenue, config.agentShare);
  if (!agentEarningsResult.success) return agentEarningsResult;
  const agentEarnings = agentEarningsResult.value;

  // Calculate platform's total revenue (15%)
  const platformRevenueResult = multiplyMoney(grossRevenue, config.platformShare);
  if (!platformRevenueResult.success) return platformRevenueResult;
  const platformRevenue = platformRevenueResult.value;

  // Calculate contributor pool allocation (25% of platform revenue = 3.75% of gross)
  const contributorPoolResult = multiplyMoney(platformRevenue, config.contributorPoolShare);
  if (!contributorPoolResult.success) return contributorPoolResult;
  const contributorPoolAllocation = contributorPoolResult.value;

  // Calculate platform's net revenue (75% of platform revenue = 11.25% of gross)
  const platformNetResult = subtractMoney(platformRevenue, contributorPoolAllocation);
  if (!platformNetResult.success) return platformNetResult;
  const platformNetRevenue = platformNetResult.value;

  // Calculate referral bonus if applicable
  let referralBonus: Money | null = null;
  let agentNetEarnings = agentEarnings;

  if (transaction.referrerAgentId) {
    const referralBonusResult = multiplyMoney(agentEarnings, config.referralShare);
    if (!referralBonusResult.success) return referralBonusResult;
    referralBonus = referralBonusResult.value;

    const agentNetResult = subtractMoney(agentEarnings, referralBonus);
    if (!agentNetResult.success) return agentNetResult;
    agentNetEarnings = agentNetResult.value;
  }

  return {
    success: true,
    value: {
      transactionId: transaction.id,
      grossRevenue,
      agentEarnings,
      platformRevenue,
      contributorPoolAllocation,
      platformNetRevenue,
      referralBonus,
      agentNetEarnings,
    },
  };
};

/**
 * Calculates revenue breakdown for multiple transactions
 * 
 * @param transactions - Array of transactions to process
 * @param config - Revenue sharing configuration
 * @returns Result containing array of breakdowns or first error encountered
 */
const calculateBatchRevenueBreakdown = (
  transactions: readonly Transaction[],
  config: RevenueShareConfig = DEFAULT_CONFIG
): Result<readonly RevenueBreakdown[], ValidationError> => {
  const breakdowns: RevenueBreakdown[] = [];

  for (const transaction of transactions) {
    const result = calculateRevenueBreakdown(transaction, config);
    if (!result.success) return result;
    breakdowns.push(result.value);
  }

  return { success: true, value: breakdowns };
};

/**
 * Distributes contributor pool among contributors based on their weights
 * 
 * @description
 * Allocates the contributor pool proportionally based on each contributor's
 * weight. Weights must sum to 1.0 (100%).
 * 
 * @param poolAmount - Total amount to distribute
 * @param contributors - Array of contributor IDs and their weights
 * @returns Result containing distribution or validation error
 * 
 * @example
 * ```typescript
 * const distribution = distributeContributorPool(
 *   { amount: 3750, currency: 'USD' }, // $37.50
 *   [
 *     { contributorId: createContributor