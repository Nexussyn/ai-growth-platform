# x402 Payment Intent Module for USDC on Base

This TypeScript module provides a complete implementation for creating and verifying x402 payment intents for USDC payments on the Base network.

```typescript
// x402-payment-intent.ts
// A comprehensive module for x402 payment intents with USDC on Base

import { createPublicClient, http, parseUnits, formatUnits, Address, Hash } from 'viem';
import { base } from 'viem/chains';
import { randomBytes, createHash } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Status of a payment intent
 */
export enum PaymentStatusCode {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

/**
 * Payment verification result with detailed status information
 */
export interface PaymentStatus {
  intentId: string;
  status: PaymentStatusCode;
  confirmed: boolean;
  transactionHash?: Hash;
  blockNumber?: bigint;
  confirmations?: number;
  paidAmount?: string;
  paidAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * x402 Payment Intent structure
 */
export interface PaymentIntent {
  id: string;
  version: string;
  scheme: 'exact' | 'range' | 'subscription';
  network: {
    chainId: number;
    name: string;
  };
  payment: {
    currency: string;
    amount: string;
    amountWei: string;
    decimals: number;
    tokenAddress: Address;
    recipient: Address;
  };
  product: {
    slug: string;
    description?: string;
    metadata?: Record<string, unknown>;
  };
  expiration: {
    expiresAt: Date;
    ttlSeconds: number;
  };
  x402: {
    header: string;
    paymentUri: string;
    callbackUrl?: string;
  };
  createdAt: Date;
  signature?: string;
}

/**
 * Configuration for the payment module
 */
export interface X402Config {
  recipientAddress: Address;
  rpcUrl?: string;
  callbackBaseUrl?: string;
  defaultTtlSeconds?: number;
  minConfirmations?: number;
}

/**
 * Transaction details from on-chain verification
 */
interface TransactionDetails {
  hash: Hash;
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  status: 'success' | 'reverted';
}

// ============================================================================
// Constants
// ============================================================================

const BASE_CHAIN_ID = 8453;
const USDC_ADDRESS_BASE: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;
const X402_VERSION = '1.0';
const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const MIN_CONFIRMATIONS = 1;

// USDC Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ============================================================================
// Storage (In-memory for demo - use database in production)
// ============================================================================

const paymentIntentStore = new Map<string, PaymentIntent>();
const paymentStatusStore = new Map<string, PaymentStatus>();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique payment intent ID
 */
function generateIntentId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(12).toString('hex');
  return `x402_${timestamp}_${randomPart}`;
}

/**
 * Generates a cryptographic signature for the payment intent
 */
function generateSignature(intent: Partial<PaymentIntent>): string {
  const data = JSON.stringify({
    id: intent.id,
    amount: intent.payment?.amountWei,
    recipient: intent.payment?.recipient,
    product: intent.product?.slug,
    expiresAt: intent.expiration?.expiresAt?.toISOString()
  });
  
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Formats amount to human-readable string
 */
function formatUSDC(amountWei: bigint): string {
  return formatUnits(amountWei, USDC_DECIMALS);
}

/**
 * Parses amount to Wei (smallest unit)
 */
function parseUSDC(amount: number): bigint {
  return parseUnits(amount.toString(), USDC_DECIMALS);
}

/**
 * Generates x402 header value
 */
function generateX402Header(intent: PaymentIntent): string {
  const headerData = {
    version: intent.version,
    network: intent.network.chainId,
    token: intent.payment.tokenAddress,
    amount: intent.payment.amountWei,
    recipient: intent.payment.recipient,
    intentId: intent.id,
    expires: Math.floor(intent.expiration.expiresAt.getTime() / 1000)
  };
  
  return Buffer.from(JSON.stringify(headerData)).toString('base64');
}

/**
 * Generates payment URI for wallet integration
 */
function generatePaymentUri(intent: PaymentIntent): string {
  const params = new URLSearchParams({
    chainId: intent.network.chainId.toString(),
    token: intent.payment.tokenAddress,
    amount: intent.payment.amountWei,
    recipient: intent.payment.recipient,
    intentId: intent.id,
    ref: intent.product.slug
  });
  
  return `ethereum:${intent.payment.tokenAddress}@${intent.network.chainId}/transfer?${params.toString()}`;
}

// ============================================================================
// Main Module Class
// ============================================================================

export class X402PaymentModule {
  private config: Required<X402Config>;
  private publicClient;

  constructor(config: X402Config) {
    this.config = {
      recipientAddress: config.recipientAddress,
      rpcUrl: config.rpcUrl || 'https://mainnet.base.org',
      callbackBaseUrl: config.callbackBaseUrl || '',
      defaultTtlSeconds: config.defaultTtlSeconds || DEFAULT_TTL_SECONDS,
      minConfirmations: config.minConfirmations || MIN_CONFIRMATIONS
    };

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(this.config.rpcUrl)
    });
  }

  /**
   * Creates a new payment intent for USDC on Base
   */
  createIntent(
    amount: number,
    productSlug: string,
    options?: {
      description?: string;
      ttlSeconds?: number;
      metadata?: Record<string, unknown>;
    }
  ): PaymentIntent {
    // Validate inputs
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    if (!productSlug || productSlug.trim() === '') {
      throw new Error('Product slug is required');
    }

    const amountWei = parseUSDC(amount);
    const ttlSeconds = options?.ttlSeconds || this.config.defaultTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const intentId = generateIntentId();

    const intent: PaymentIntent = {
      id: intentId,
      version: X402_VERSION,
      scheme: 'exact',
      network: {
        chainId: BASE_CHAIN_ID,
        name: 'Base'
      },
      payment: {
        currency: 'USDC',
        amount: formatUSDC(amountWei),
        amountWei: amountWei.toString(),
        decimals: USDC_DECIMALS,
        tokenAddress: USDC_ADDRESS_BASE,
        recipient: this.config.recipientAddress
      },
      product: {
        slug: productSlug,
        description: options?.description,
        metadata: options?.metadata
      },
      expiration: {
        expiresAt,
        ttlSeconds
      },
      x402: {
        header: '', // Will be set below
        paymentUri: '', // Will be set below
        callbackUrl: this.config.callbackBaseUrl 
          ? `${this.config.callbackBaseUrl}/x402/callback/${intentId}`
          : undefined
      },
      createdAt: new Date()
    };

    // Generate x402 specific fields
    intent.x402.header = generateX402Header(intent);
    intent.x402.paymentUri = generatePaymentUri(intent);
    intent.signature = generateSignature(intent);

    // Store the intent
    paymentIntentStore.set(intentId, intent);
    
    // Initialize status as pending
    paymentStatusStore.set(intentId, {
      intentId,
      status: PaymentStatusCode.PENDING,
      confirmed: false
    });

    return intent;
  }

  /**
   * Verifies a payment by checking on-chain transactions
   */
  async verifyPayment(intentId: string): Promise<PaymentStatus> {
    const intent = paymentIntentStore.get(intentId);
    
    if (!intent) {
      return {
        intentId,
        status: PaymentStatusCode.FAILED,
        confirmed: false,
        error: 'Payment intent not found'
      };
    }

    // Check if already completed
    const existingStatus = paymentStatusStore.get(intentId);
    if (existingStatus?.status === PaymentStatusCode.COMPLETED) {
      return existingStatus;
    }

    // Check expiration
    if (new Date() > intent.expiration.expiresAt) {
      const expiredStatus: PaymentStatus = {
        intentId,
        status: PaymentStatusCode.EXPIRED,
        confirmed: false,
        error: 'Payment intent has expired'
      };
      paymentStatusStore.set(intentId, expiredStatus);
      return expiredStatus;
    }

    try {
      // Update status to processing
      const processingStatus: PaymentStatus = {
        intentId,
        status: PaymentStatusCode.PROCESSING,
        confirmed: false
      };
      paymentStatusStore.set(intentId, processingStatus);

      // Query for USDC transfer events to our recipient
      const transferEvents = await this.queryTransferEvents(intent);

      if (transferEvents.length === 0) {
        return {
          intentId,
          status: PaymentStatusCode.PENDING,
          confirmed: false,
          metadata: {
            message: 'No matching transactions found yet'
          }
        };
      }

      // Find a matching payment
      const matchingPayment = await this.findMatchingPayment(intent, transferEvents);

      if (matchingPayment) {
        const currentBlock = await this.publicClient.getBlockNumber();
        const confirmations = Number(currentBlock - matchingPayment.blockNumber);

        const completedStatus: PaymentStatus = {
          intentId,
          status: confirmations >= this.config.minConfirmations 
            ? PaymentStatusCode.COMPLETED 
            : PaymentStatusCode.PROCESSING,
          confirmed: confirmations >= this.config.minConfirmations,
          transactionHash: matchingPayment.hash,
          blockNumber: matchingPayment.blockNumber,
          confirmations,
          paidAmount: formatUSDC(matchingPayment.value),
          paidAt: new Date(),
          metadata: {
            from: matchingPayment.from,
            requiredConfirmations: this.config.minConfirmations
          }
        };

        paymentStatusStore.set(intentId, completedStatus);
        return completedStatus;
      }

      return {
        intentId,
        status: PaymentStatusCode.PENDING,
        confirmed: false,
        metadata: {
          message: 'No exact amount match found'
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failedStatus: PaymentStatus = {
        intentId,
        status: PaymentStatusCode.FAILED,
        confirmed: false,
        error: `Verification failed: ${errorMessage}`
      };
      paymentStatusStore.set(intentId, failedStatus);
      return failedStatus;
    }
  }

  /**
   * Queries USDC transfer events from the blockchain
   */
  private async queryTransferEvents(intent: PaymentIntent): Promise<TransactionDetails[]> {
    const fromBlock = await this.getBlockFromTimestamp(intent.createdAt);
    
    const logs = await this.publicClient.getLogs({
      address: USDC_ADDRESS_BASE,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { type: 'address', name: 'from', indexed: true },
          { type: 'address', name: 'to', indexed: true },
          { type: 'uint256', name: 'value', indexed: false }
        ]
      },
      args: {
        to: intent.payment.recipient
      },
      fromBlock,
      toBlock: 'latest'
    });

    const transactions: TransactionDetails[] = [];

    for (const log of logs) {
      if (log.transactionHash && log.blockNumber) {
        const receipt = await this.publicClient.getTransactionReceipt({
          hash: log.transactionHash
        });

        transactions.push({
          hash: log.transactionHash,
          from: log.args.from as Address,
          to: log.args.to as Address,
          value: log.args.value as bigint,
          blockNumber: log.blockNumber,
          status: receipt.status === 'success' ? 'success' : 'reverted'
        });
      }
    }

    return transactions;
  }

  /**
   * Finds a payment matching the intent amount
   */
  private async findMatchingPayment(
    intent: PaymentIntent,
    transactions: TransactionDetails[]
  ): Promise<TransactionDetails | null> {
    const requiredAmount = BigInt(intent.payment.amountWei);

    for (const tx of transactions) {
      if (tx.status === 'success' && tx.value === requiredAmount) {
        return tx;
      }
    }

    return null;
  }

  /**
   * Gets approximate block number from timestamp
   */
  private async getBlockFromTimestamp(date: Date): Promise<bigint> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const currentTime = Math.floor(Date.now() / 1000);
    const targetTime = Math.floor(date.getTime() / 1000);
    
    // Base has ~2 second block time
    const blockDiff = BigInt(Math.floor((currentTime - targetTime) / 2));
    const estimatedBlock = currentBlock - blockDiff;
    
    return estimatedBlock > 0n ? estimatedBlock : 0n;
  }

  /**
   * Gets a payment intent by ID
   */
  getIntent(intentId: string): PaymentIntent | undefined {
    return paymentIntentStore.get(intentId);
  }

  /**
   * Gets the current status of a payment intent
   */
  getStatus(intentId: string): PaymentStatus | undefined {
    return paymentStatusStore.get(intentId);
  }

  /**
   * Cancels a pending payment intent
   */
  cancelIntent(intentId: string): PaymentStatus {
    const intent = paymentIntentStore.get(intentId);
    const currentStatus = paymentStatusStore.get(intentId);

    if (!intent) {
      return {
        intentId,
        status: PaymentStatusCode.FAILED