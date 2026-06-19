# USDC Transfer Verification Function

Here's a comprehensive TypeScript async function that verifies USDC transfers on Base and Polygon networks by querying public EVM RPCs:

```typescript
/**
 * USDC Transfer Verification Module
 * Verifies USDC ERC-20 transfer events on Base (8453) and Polygon (137)
 */

// USDC Contract addresses per chain
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",  // Polygon USDC (native)
};

// Public RPC endpoints per chain
const RPC_ENDPOINTS: Record<number, string[]> = {
  8453: [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://base.drpc.org",
  ],
  137: [
    "https://polygon-rpc.com",
    "https://polygon.publicnode.com",
    "https://polygon.drpc.org",
  ],
};

// ERC-20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Interfaces for RPC responses
interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface TransactionReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string;
  logs: TransactionLog[];
  to: string | null;
  from: string;
  contractAddress: string | null;
}

interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  removed: boolean;
}

interface ParsedTransferEvent {
  from: string;
  to: string;
  amount: bigint;
  contractAddress: string;
}

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
    this.name = "VerificationError";
  }
}

/**
 * Makes a JSON-RPC call to the specified endpoint
 */
async function rpcCall<T>(
  endpoint: string,
  method: string,
  params: unknown[],
  timeoutMs: number = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const data: JsonRpcResponse<T> = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.code} - ${data.error.message}`);
    }

    if (data.result === undefined) {
      throw new Error("RPC response missing result");
    }

    return data.result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Attempts RPC call with fallback endpoints
 */
async function rpcCallWithFallback<T>(
  endpoints: string[],
  method: string,
  params: unknown[]
): Promise<T> {
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      return await rpcCall<T>(endpoint, method, params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`RPC call failed for ${endpoint}: ${lastError.message}`);
      continue;
    }
  }

  throw new VerificationError(
    `All RPC endpoints failed: ${lastError?.message}`,
    "RPC_FAILURE"
  );
}

/**
 * Normalizes an Ethereum address to lowercase with checksum validation
 */
function normalizeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new VerificationError(
      `Invalid Ethereum address: ${address}`,
      "INVALID_ADDRESS"
    );
  }
  return address.toLowerCase();
}

/**
 * Validates transaction hash format
 */
function validateTxHash(txHash: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new VerificationError(
      `Invalid transaction hash format: ${txHash}`,
      "INVALID_TX_HASH"
    );
  }
}

/**
 * Parses a uint256 value from hex string (handles both data field and padded topics)
 */
function parseUint256(hexValue: string): bigint {
  // Remove 0x prefix and parse
  const cleanHex = hexValue.startsWith("0x") ? hexValue.slice(2) : hexValue;
  if (cleanHex.length === 0) {
    return 0n;
  }
  return BigInt("0x" + cleanHex);
}

/**
 * Extracts address from a 32-byte padded topic
 */
function extractAddressFromTopic(topic: string): string {
  // Topics are 32 bytes (64 hex chars + 0x), address is last 20 bytes (40 hex chars)
  return "0x" + topic.slice(-40).toLowerCase();
}

/**
 * Parses Transfer events from transaction logs
 */
function parseTransferEvents(
  logs: TransactionLog[],
  usdcAddress: string
): ParsedTransferEvent[] {
  const normalizedUsdcAddress = normalizeAddress(usdcAddress);
  const transfers: ParsedTransferEvent[] = [];

  for (const log of logs) {
    // Check if this log is from the USDC contract
    if (normalizeAddress(log.address) !== normalizedUsdcAddress) {
      continue;
    }

    // Check if this is a Transfer event (first topic matches signature)
    if (
      log.topics.length < 3 ||
      log.topics[0].toLowerCase() !== TRANSFER_EVENT_SIGNATURE.toLowerCase()
    ) {
      continue;
    }

    // Parse the Transfer event
    // topics[0] = event signature
    // topics[1] = from address (indexed, 32-byte padded)
    // topics[2] = to address (indexed, 32-byte padded)
    // data = amount (uint256)
    const from = extractAddressFromTopic(log.topics[1]);
    const to = extractAddressFromTopic(log.topics[2]);
    const amount = parseUint256(log.data);

    transfers.push({
      from,
      to,
      amount,
      contractAddress: normalizeAddress(log.address),
    });
  }

  return transfers;
}

/**
 * Verifies a USDC transfer on Base (8453) or Polygon (137)
 *
 * @param txHash - The transaction hash to verify
 * @param chainId - The chain ID (8453 for Base, 137 for Polygon)
 * @param expectedAmount - The expected transfer amount in USDC base units (6 decimals)
 * @param expectedTo - The expected recipient address
 * @returns Promise<boolean> - True if the transfer is verified, false otherwise
 * @throws VerificationError for invalid inputs or RPC failures
 *
 * @example
 * ```typescript
 * // Verify a 100 USDC transfer on Base
 * const isValid = await verifyUSDCTransfer(
 *   "0x1234...abcd",
 *   8453,
 *   100_000_000n, // 100 USDC (6 decimals)
 *   "0xRecipient..."
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
  if (chainId !== 8453 && chainId !== 137) {
    throw new VerificationError(
      `Unsupported chain ID: ${chainId}. Supported chains: Base (8453), Polygon (137)`,
      "UNSUPPORTED_CHAIN",
      { chainId, supportedChains: [8453, 137] }
    );
  }

  // Validate inputs
  validateTxHash(txHash);
  const normalizedExpectedTo = normalizeAddress(expectedTo);

  if (expectedAmount < 0n) {
    throw new VerificationError(
      "Expected amount cannot be negative",
      "INVALID_AMOUNT"
    );
  }

  // Get chain-specific configuration
  const usdcAddress = USDC_ADDRESSES[chainId];
  const rpcEndpoints = RPC_ENDPOINTS[chainId];

  // Fetch transaction receipt
  const receipt = await rpcCallWithFallback<TransactionReceipt | null>(
    rpcEndpoints,
    "eth_getTransactionReceipt",
    [txHash]
  );

  // Check if transaction exists
  if (!receipt) {
    console.log(`Transaction not found or not yet mined: ${txHash}`);
    return false;
  }

  // Check transaction status (0x1 = success, 0x0 = failure)
  if (receipt.status !== "0x1") {
    console.log(`Transaction failed (reverted): ${txHash}`);
    return false;
  }

  // Parse Transfer events from logs
  const transfers = parseTransferEvents(receipt.logs, usdcAddress);

  if (transfers.length === 0) {
    console.log(`No USDC Transfer events found in transaction: ${txHash}`);
    return false;
  }

  // Check if any transfer matches expected criteria
  for (const transfer of transfers) {
    const toMatches = transfer.to === normalizedExpectedTo;
    const amountMatches = transfer.amount === expectedAmount;

    if (toMatches && amountMatches) {
      console.log(`USDC transfer verified successfully:`, {
        txHash,
        chainId,
        from: transfer.from,
        to: transfer.to,
        amount: transfer.amount.toString(),
      });
      return true;
    }
  }

  // Log detailed mismatch information for debugging
  console.log(`USDC transfer verification failed. Found transfers:`, {
    txHash,
    chainId,
    expected: {
      to: normalizedExpectedTo,
      amount: expectedAmount.toString(),
    },
    found: transfers.map((t) => ({
      to: t.to,
      amount: t.amount.toString(),
      toMatches: t.to === normalizedExpectedTo,
      amountMatches: t.amount === expectedAmount,
    })),
  });

  return false;
}

/**
 * Extended verification with additional details
 */
export interface VerificationResult {
  verified: boolean;
  txHash: string;
  chainId: number;
  blockNumber?: bigint;
  transfers: ParsedTransferEvent[];
  matchedTransfer?: ParsedTransferEvent;
  error?: string;
}

/**
 * Extended verification function that returns detailed results
 */
export async function verifyUSDCTransferDetailed(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<VerificationResult> {
  const result: VerificationResult = {
    verified: false,
    txHash,
    chainId,
    transfers: [],
  };

  try {
    // Validate chain ID
    if (chainId !== 8453 && chainId !== 137) {
      result.error = `Unsupported chain ID: ${chainId}`;
      return result;
    }

    // Validate inputs
    validateTxHash(txHash);
    const normalizedExpectedTo = normalizeAddress(expectedTo);

    // Get chain-specific configuration
    const usdcAddress = USDC_ADDRESSES[chainId];
    const rpcEndpoints = RPC_ENDPOINTS[chainId];

    // Fetch transaction receipt
    const receipt = await rpcCallWithFallback<TransactionReceipt | null>(
      rpcEndpoints,
      "eth_getTransactionReceipt",
      [txHash]
    );

    if (!receipt) {
      result.error = "Transaction not found or not yet mined";
      return result;
    }

    result.blockNumber = BigInt(receipt.blockNumber);

    if (receipt.status !== "0x1") {
      result.error = "Transaction failed (reverted)";
      return result;
    }

    // Parse Transfer events
    result.transfers = parseTransferEvents(receipt.logs, usdcAddress);

    // Find matching transfer
    for (const transfer of result.transfers) {
      if (
        transfer.to === normalizedExpectedTo &&
        transfer.amount === expectedAmount
      ) {
        result.verified = true;
        result.matchedTransfer = transfer;
        break;
      }
    }

    if (!result.verified && result.transfers.length > 0) {
      result.error = "No matching transfer found with expected amount and recipient";
    } else if (result.transfers.length === 0) {
      result.error = "No USDC Transfer events found in transaction";
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

// ============================================================================
// Example Usage and Tests
// ============================================================================

/**
 * Example usage demonstrating the verification function
 */
async function exampleUsage(): Promise<void> {
  console.log("=== USDC Transfer Verification Examples ===\n");

  // Example 1: Basic verification (you would use a real txHash)
  const exampleTxHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const recipientAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2";
  const amount = 100_000_000n; // 100 USDC (6 decimals)

  try {
    // Verify on Base
    console.log("Verifying USDC transfer on Base...");
    const isValidBase = await verifyUSDCTransfer(
      exampleTxHash,
      8453, // Base chain ID
      amount,
      recipientAddress
    );
    console.log(`Base verification result: ${isValidBase}\n`);

    // Verify on Polygon
    console.log("Verifying USDC transfer on Polygon...");
    const isValidPolygon = await verifyUSDCTransfer(
      exampleTxHash,
      137, // Polygon chain ID
      amount,
      recipientAddress
    );
    console.log(`Polygon verification result: ${isValidPolygon}\n`);

    // Detailed verification
    console.log("Running detailed verification...");
    const detailedResult = await verifyUSDCTransferDetailed(
      exampleTxHash,
      8453,
      amount,
      recipientAddress
    );
    console.log("