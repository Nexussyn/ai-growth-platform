# USDC Transfer Verification Function

Here's a comprehensive TypeScript async function that verifies USDC transfers on Base and Polygon networks by querying public EVM RPCs:

```typescript
/**
 * USDC Transfer Verification for Base (8453) and Polygon (137)
 * Verifies that a transaction successfully transferred the expected amount
 * of USDC to the expected recipient.
 */

// USDC Contract Addresses (official Circle deployments)
const USDC_CONTRACTS: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base (native USDC)
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon (native USDC)
};

// Public RPC Endpoints (fallback options included)
const RPC_ENDPOINTS: Record<number, string[]> = {
  8453: [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://1rpc.io/base",
  ],
  137: [
    "https://polygon-rpc.com",
    "https://polygon.publicnode.com",
    "https://1rpc.io/matic",
  ],
};

// ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
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
  transactionIndex: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress: string | null;
  logs: TransactionLog[];
  logsBloom: string;
  status: string; // "0x1" for success, "0x0" for failure
}

interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

interface VerificationResult {
  success: boolean;
  message: string;
  details?: {
    actualAmount?: bigint;
    actualTo?: string;
    actualFrom?: string;
    blockNumber?: number;
  };
}

/**
 * Makes a JSON-RPC call to the specified endpoint
 */
async function rpcCall<T>(
  endpoint: string,
  method: string,
  params: unknown[]
): Promise<T> {
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
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: JsonRpcResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`RPC error: ${data.error.code} - ${data.error.message}`);
  }

  if (data.result === undefined) {
    throw new Error("No result in RPC response");
  }

  return data.result;
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

  throw new Error(
    `All RPC endpoints failed. Last error: ${lastError?.message}`
  );
}

/**
 * Normalizes an Ethereum address to lowercase for comparison
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Pads an address to 32 bytes (64 hex chars) for topic comparison
 */
function padAddressToTopic(address: string): string {
  const cleanAddress = address.toLowerCase().replace("0x", "");
  return "0x" + cleanAddress.padStart(64, "0");
}

/**
 * Decodes the amount from log data (uint256)
 */
function decodeUint256(data: string): bigint {
  const cleanData = data.replace("0x", "");
  if (cleanData.length === 0) {
    return BigInt(0);
  }
  return BigInt("0x" + cleanData);
}

/**
 * Extracts address from a 32-byte topic
 */
function extractAddressFromTopic(topic: string): string {
  // Take the last 40 characters (20 bytes) of the topic
  const cleanTopic = topic.replace("0x", "");
  return "0x" + cleanTopic.slice(-40).toLowerCase();
}

/**
 * Verifies a USDC transfer transaction on Base or Polygon
 *
 * @param txHash - The transaction hash to verify
 * @param chainId - The chain ID (8453 for Base, 137 for Polygon)
 * @param expectedAmount - The expected USDC amount in smallest units (6 decimals)
 * @param expectedTo - The expected recipient address
 * @returns Promise<boolean> - True if the transfer is verified, false otherwise
 *
 * @example
 * ```typescript
 * // Verify a 100 USDC transfer on Base
 * const isValid = await verifyUSDCTransfer(
 *   "0x123...abc",
 *   8453,
 *   BigInt(100_000_000), // 100 USDC (6 decimals)
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
    console.error(`Unsupported chain ID: ${chainId}. Only Base (8453) and Polygon (137) are supported.`);
    return false;
  }

  // Validate transaction hash format
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    console.error(`Invalid transaction hash format: ${txHash}`);
    return false;
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(expectedTo)) {
    console.error(`Invalid address format: ${expectedTo}`);
    return false;
  }

  // Validate amount
  if (expectedAmount <= BigInt(0)) {
    console.error(`Invalid amount: ${expectedAmount}. Must be positive.`);
    return false;
  }

  const endpoints = RPC_ENDPOINTS[chainId];
  const usdcAddress = USDC_CONTRACTS[chainId];

  try {
    // Fetch transaction receipt
    const receipt = await rpcCallWithFallback<TransactionReceipt | null>(
      endpoints,
      "eth_getTransactionReceipt",
      [txHash]
    );

    // Check if transaction exists
    if (!receipt) {
      console.error(`Transaction not found: ${txHash}`);
      return false;
    }

    // Check transaction status (must be successful)
    if (receipt.status !== "0x1") {
      console.error(`Transaction failed (reverted): ${txHash}`);
      return false;
    }

    // Find USDC Transfer events in the logs
    const normalizedExpectedTo = normalizeAddress(expectedTo);
    const normalizedUsdcAddress = normalizeAddress(usdcAddress);
    const expectedToTopic = padAddressToTopic(expectedTo);

    let transferFound = false;
    let totalAmountToRecipient = BigInt(0);

    for (const log of receipt.logs) {
      // Check if this log is from the USDC contract
      if (normalizeAddress(log.address) !== normalizedUsdcAddress) {
        continue;
      }

      // Check if this is a Transfer event
      if (log.topics.length < 3) {
        continue;
      }

      if (normalizeAddress(log.topics[0]) !== normalizeAddress(TRANSFER_EVENT_SIGNATURE)) {
        continue;
      }

      // Extract the 'to' address from topic[2]
      const toAddress = extractAddressFromTopic(log.topics[2]);

      // Check if the recipient matches
      if (toAddress !== normalizedExpectedTo) {
        continue;
      }

      // Decode the transfer amount from data
      const amount = decodeUint256(log.data);

      // Accumulate amounts (in case of multiple transfers to same recipient)
      totalAmountToRecipient += amount;
      transferFound = true;

      console.log(`Found USDC transfer: ${amount} to ${toAddress}`);
    }

    if (!transferFound) {
      console.error(
        `No USDC transfer to ${expectedTo} found in transaction ${txHash}`
      );
      return false;
    }

    // Verify the amount matches (exact match or at least expected amount)
    if (totalAmountToRecipient < expectedAmount) {
      console.error(
        `Amount mismatch: expected ${expectedAmount}, got ${totalAmountToRecipient}`
      );
      return false;
    }

    // If we want exact match instead of >= comparison, use this:
    // if (totalAmountToRecipient !== expectedAmount) {
    //   console.error(`Amount mismatch: expected ${expectedAmount}, got ${totalAmountToRecipient}`);
    //   return false;
    // }

    console.log(
      `✓ Verified USDC transfer: ${totalAmountToRecipient} to ${expectedTo} on chain ${chainId}`
    );
    return true;

  } catch (error) {
    console.error(
      `Error verifying transfer: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Extended version that returns detailed verification results
 */
export async function verifyUSDCTransferDetailed(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<VerificationResult> {
  // Validate chain ID
  if (chainId !== 8453 && chainId !== 137) {
    return {
      success: false,
      message: `Unsupported chain ID: ${chainId}. Only Base (8453) and Polygon (137) are supported.`,
    };
  }

  // Validate inputs
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return {
      success: false,
      message: `Invalid transaction hash format: ${txHash}`,
    };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(expectedTo)) {
    return {
      success: false,
      message: `Invalid address format: ${expectedTo}`,
    };
  }

  if (expectedAmount <= BigInt(0)) {
    return {
      success: false,
      message: `Invalid amount: ${expectedAmount}. Must be positive.`,
    };
  }

  const endpoints = RPC_ENDPOINTS[chainId];
  const usdcAddress = USDC_CONTRACTS[chainId];

  try {
    const receipt = await rpcCallWithFallback<TransactionReceipt | null>(
      endpoints,
      "eth_getTransactionReceipt",
      [txHash]
    );

    if (!receipt) {
      return {
        success: false,
        message: `Transaction not found: ${txHash}`,
      };
    }

    if (receipt.status !== "0x1") {
      return {
        success: false,
        message: `Transaction failed (reverted)`,
        details: {
          blockNumber: parseInt(receipt.blockNumber, 16),
        },
      };
    }

    const normalizedExpectedTo = normalizeAddress(expectedTo);
    const normalizedUsdcAddress = normalizeAddress(usdcAddress);

    let transferFound = false;
    let totalAmount = BigInt(0);
    let fromAddress = "";

    for (const log of receipt.logs) {
      if (normalizeAddress(log.address) !== normalizedUsdcAddress) continue;
      if (log.topics.length < 3) continue;
      if (normalizeAddress(log.topics[0]) !== normalizeAddress(TRANSFER_EVENT_SIGNATURE)) continue;

      const toAddress = extractAddressFromTopic(log.topics[2]);
      if (toAddress !== normalizedExpectedTo) continue;

      fromAddress = extractAddressFromTopic(log.topics[1]);
      totalAmount += decodeUint256(log.data);
      transferFound = true;
    }

    if (!transferFound) {
      return {
        success: false,
        message: `No USDC transfer to ${expectedTo} found`,
        details: {
          blockNumber: parseInt(receipt.blockNumber, 16),
        },
      };
    }

    if (totalAmount < expectedAmount) {
      return {
        success: false,
        message: `Insufficient amount: expected ${expectedAmount}, got ${totalAmount}`,
        details: {
          actualAmount: totalAmount,
          actualTo: normalizedExpectedTo,
          actualFrom: fromAddress,
          blockNumber: parseInt(receipt.blockNumber, 16),
        },
      };
    }

    return {
      success: true,
      message: `Transfer verified successfully`,
      details: {
        actualAmount: totalAmount,
        actualTo: normalizedExpectedTo,
        actualFrom: fromAddress,
        blockNumber: parseInt(receipt.blockNumber, 16),
      },
    };

  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============ Usage Examples ============

async function main() {
  // Example 1: Verify a USDC transfer on Base
  console.log("=== Example: Verify USDC Transfer ===\n");

  // Replace with actual transaction hash
  const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const chainId = 8453; // Base
  const expectedAmount = BigInt(100_000_000); // 100 USDC (6 decimals)
  const expectedTo = "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE28";

  // Simple verification
  const isValid = await verifyUSDCTransfer(
    txHash,
    chainId,
    expectedAmount,
    expectedTo
  );
  console.log(`Transfer valid: ${isValid}\n`);

  // Detailed verification
  const result = await verifyUSDCTransferDetailed(
    txHash,
    chainId,
    expectedAmount,
    expectedTo
  );
  console.log("Detailed result:", JSON.stringify(result, (_, v) =>
    typeof v === 'bigint' ?