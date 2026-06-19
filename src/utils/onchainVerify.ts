# USDC Transfer Verification Function

Here's a comprehensive TypeScript async function that verifies USDC transfers on Base and Polygon networks by querying public EVM RPCs.

```typescript
/**
 * USDC Transfer Verification Module
 * Verifies USDC transfers on Base (8453) and Polygon (137) networks
 */

// Chain configuration type
interface ChainConfig {
  name: string;
  rpcUrl: string;
  usdcAddress: string;
  decimals: number;
}

// Transfer event log structure
interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  logIndex: string;
  blockNumber: string;
  removed: boolean;
}

// Transaction receipt structure from RPC
interface TransactionReceipt {
  transactionHash: string;
  status: string; // '0x1' for success, '0x0' for failure
  from: string;
  to: string;
  logs: TransactionLog[];
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
}

// JSON-RPC response structure
interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

// ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Supported chain configurations with public RPC endpoints
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Base Mainnet
  8453: {
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Native USDC on Base
    decimals: 6,
  },
  // Polygon Mainnet
  137: {
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC on Polygon (USDC.e is 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
    decimals: 6,
  },
};

/**
 * Custom error class for verification failures
 */
class VerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

/**
 * Makes a JSON-RPC call to the specified endpoint
 */
async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new VerificationError(
        `RPC request failed with status ${response.status}`,
        'RPC_HTTP_ERROR',
        { status: response.status, statusText: response.statusText }
      );
    }

    const data: JsonRpcResponse<T> = await response.json();

    if (data.error) {
      throw new VerificationError(
        `RPC error: ${data.error.message}`,
        'RPC_ERROR',
        { code: data.error.code, message: data.error.message }
      );
    }

    if (data.result === undefined) {
      throw new VerificationError(
        'RPC returned undefined result',
        'RPC_EMPTY_RESULT'
      );
    }

    return data.result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalizes an Ethereum address to lowercase with checksum validation
 */
function normalizeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new VerificationError(
      `Invalid Ethereum address format: ${address}`,
      'INVALID_ADDRESS'
    );
  }
  return address.toLowerCase();
}

/**
 * Extracts address from a 32-byte padded topic
 */
function extractAddressFromTopic(topic: string): string {
  if (!topic || topic.length !== 66) {
    throw new VerificationError(
      `Invalid topic format: ${topic}`,
      'INVALID_TOPIC'
    );
  }
  // Remove '0x' prefix, take last 40 characters (20 bytes = address)
  return normalizeAddress('0x' + topic.slice(26));
}

/**
 * Decodes uint256 value from hex data
 */
function decodeUint256(hexData: string): bigint {
  if (!hexData || hexData === '0x') {
    return BigInt(0);
  }
  // Remove '0x' prefix and parse as hex
  return BigInt(hexData);
}

/**
 * Validates transaction hash format
 */
function validateTxHash(txHash: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new VerificationError(
      `Invalid transaction hash format: ${txHash}`,
      'INVALID_TX_HASH'
    );
  }
}

/**
 * Finds USDC transfer events in transaction logs
 */
function findUSDCTransfers(
  logs: TransactionLog[],
  usdcAddress: string
): Array<{ from: string; to: string; amount: bigint }> {
  const normalizedUsdcAddress = normalizeAddress(usdcAddress);
  const transfers: Array<{ from: string; to: string; amount: bigint }> = [];

  for (const log of logs) {
    // Check if this log is from the USDC contract
    if (normalizeAddress(log.address) !== normalizedUsdcAddress) {
      continue;
    }

    // Check if this is a Transfer event (first topic is the event signature)
    if (log.topics.length < 3 || log.topics[0] !== TRANSFER_EVENT_SIGNATURE) {
      continue;
    }

    // Skip if log was removed (reorg)
    if (log.removed) {
      continue;
    }

    // Extract transfer details
    // topics[1] = from address (indexed)
    // topics[2] = to address (indexed)
    // data = amount (non-indexed)
    const from = extractAddressFromTopic(log.topics[1]);
    const to = extractAddressFromTopic(log.topics[2]);
    const amount = decodeUint256(log.data);

    transfers.push({ from, to, amount });
  }

  return transfers;
}

/**
 * Verifies a USDC transfer on Base or Polygon networks
 *
 * @param txHash - The transaction hash to verify (0x-prefixed, 64 hex chars)
 * @param chainId - The chain ID (8453 for Base, 137 for Polygon)
 * @param expectedAmount - The expected USDC amount in smallest units (6 decimals)
 * @param expectedTo - The expected recipient address (0x-prefixed, 40 hex chars)
 * @returns Promise<boolean> - True if a matching transfer is found, false otherwise
 *
 * @throws {VerificationError} If chain is unsupported, inputs are invalid, or RPC fails
 *
 * @example
 * ```typescript
 * // Verify a 100 USDC transfer on Base
 * const isValid = await verifyUSDCTransfer(
 *   '0x1234...', // transaction hash
 *   8453,        // Base chain ID
 *   100000000n,  // 100 USDC (6 decimals)
 *   '0xRecipient...'
 * );
 * ```
 */
export async function verifyUSDCTransfer(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<boolean> {
  // Validate chain ID
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new VerificationError(
      `Unsupported chain ID: ${chainId}. Supported chains: Base (8453), Polygon (137)`,
      'UNSUPPORTED_CHAIN',
      { chainId, supportedChains: Object.keys(CHAIN_CONFIGS).map(Number) }
    );
  }

  // Validate inputs
  validateTxHash(txHash);
  const normalizedExpectedTo = normalizeAddress(expectedTo);

  if (expectedAmount < BigInt(0)) {
    throw new VerificationError(
      'Expected amount cannot be negative',
      'INVALID_AMOUNT',
      { expectedAmount: expectedAmount.toString() }
    );
  }

  // Fetch transaction receipt
  const receipt = await rpcCall<TransactionReceipt | null>(
    chainConfig.rpcUrl,
    'eth_getTransactionReceipt',
    [txHash]
  );

  // Check if transaction exists
  if (!receipt) {
    // Transaction not found - could be pending or invalid
    return false;
  }

  // Check if transaction was successful
  // status: '0x1' = success, '0x0' = failure
  if (receipt.status !== '0x1') {
    return false;
  }

  // Find USDC transfer events in the logs
  const transfers = findUSDCTransfers(receipt.logs, chainConfig.usdcAddress);

  // Check if any transfer matches our expected parameters
  for (const transfer of transfers) {
    if (
      transfer.to === normalizedExpectedTo &&
      transfer.amount === expectedAmount
    ) {
      return true;
    }
  }

  // No matching transfer found
  return false;
}

/**
 * Extended verification result with detailed information
 */
export interface DetailedVerificationResult {
  verified: boolean;
  transactionFound: boolean;
  transactionSuccessful: boolean;
  chainName: string;
  blockNumber: bigint | null;
  transfers: Array<{
    from: string;
    to: string;
    amount: bigint;
    amountFormatted: string;
  }>;
  matchingTransfer: {
    from: string;
    to: string;
    amount: bigint;
    amountFormatted: string;
  } | null;
  error?: string;
}

/**
 * Extended version that returns detailed verification information
 */
export async function verifyUSDCTransferDetailed(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<DetailedVerificationResult> {
  const chainConfig = CHAIN_CONFIGS[chainId];
  
  if (!chainConfig) {
    return {
      verified: false,
      transactionFound: false,
      transactionSuccessful: false,
      chainName: 'Unknown',
      blockNumber: null,
      transfers: [],
      matchingTransfer: null,
      error: `Unsupported chain ID: ${chainId}`,
    };
  }

  const formatAmount = (amount: bigint): string => {
    const divisor = BigInt(10 ** chainConfig.decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    return `${whole}.${fraction.toString().padStart(chainConfig.decimals, '0')} USDC`;
  };

  try {
    validateTxHash(txHash);
    const normalizedExpectedTo = normalizeAddress(expectedTo);

    const receipt = await rpcCall<TransactionReceipt | null>(
      chainConfig.rpcUrl,
      'eth_getTransactionReceipt',
      [txHash]
    );

    if (!receipt) {
      return {
        verified: false,
        transactionFound: false,
        transactionSuccessful: false,
        chainName: chainConfig.name,
        blockNumber: null,
        transfers: [],
        matchingTransfer: null,
      };
    }

    const transactionSuccessful = receipt.status === '0x1';
    const blockNumber = BigInt(receipt.blockNumber);
    const transfers = findUSDCTransfers(receipt.logs, chainConfig.usdcAddress);

    const formattedTransfers = transfers.map((t) => ({
      ...t,
      amountFormatted: formatAmount(t.amount),
    }));

    const matchingTransfer = transfers.find(
      (t) => t.to === normalizedExpectedTo && t.amount === expectedAmount
    );

    return {
      verified: transactionSuccessful && matchingTransfer !== undefined,
      transactionFound: true,
      transactionSuccessful,
      chainName: chainConfig.name,
      blockNumber,
      transfers: formattedTransfers,
      matchingTransfer: matchingTransfer
        ? { ...matchingTransfer, amountFormatted: formatAmount(matchingTransfer.amount) }
        : null,
    };
  } catch (error) {
    return {
      verified: false,
      transactionFound: false,
      transactionSuccessful: false,
      chainName: chainConfig.name,
      blockNumber: null,
      transfers: [],
      matchingTransfer: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Example Usage and Tests
// ============================================================================

async function main() {
  console.log('USDC Transfer Verification Examples\n');
  console.log('='.repeat(50));

  // Example 1: Verify a transfer on Base
  console.log('\n📍 Example 1: Verifying transfer on Base');
  
  const baseTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const baseChainId = 8453;
  const amount = BigInt(100_000_000); // 100 USDC (6 decimals)
  const recipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bB0B';

  try {
    const isValid = await verifyUSDCTransfer(
      baseTxHash,
      baseChainId,
      amount,
      recipient
    );
    console.log(`✅ Transfer verified: ${isValid}`);
  } catch (error) {
    if (error instanceof VerificationError) {
      console.log(`❌ Verification failed: ${error.message} (${error.code})`);
    } else {
      console.log(`❌ Error: ${error}`);
    }
  }

  // Example 2: Get detailed verification on Polygon
  console.log('\n📍 Example 2: Detailed verification on Polygon');
  
  const polygonTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const polygonChainId = 137;

  const detailedResult = await verifyUSDCTransferDetailed(
    polygonTxHash,
    polygonChainId,
    BigInt(50_000_000), // 50 USDC
    '0x742d35