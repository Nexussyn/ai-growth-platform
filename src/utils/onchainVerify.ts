# USDC Transfer Verification Function

Here's a comprehensive TypeScript async function that verifies USDC transfers on Base and Polygon networks by querying public EVM RPCs:

```typescript
import { keccak256, toUtf8Bytes } from "ethers";

// USDC contract addresses per chain
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base (native USDC)
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon (native USDC)
};

// Public RPC endpoints per chain
const RPC_ENDPOINTS: Record<number, string[]> = {
  8453: [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base.publicnode.com",
  ],
  137: [
    "https://polygon-rpc.com",
    "https://polygon.llamarpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
};

// USDC has 6 decimals on both chains
const USDC_DECIMALS = 6;

// ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE = keccak256(
  toUtf8Bytes("Transfer(address,address,uint256)")
);

/**
 * Interface for transaction receipt from RPC
 */
interface TransactionReceipt {
  transactionHash: string;
  status: string;
  blockNumber: string;
  blockHash: string;
  from: string;
  to: string | null;
  contractAddress: string | null;
  logs: TransactionLog[];
  gasUsed: string;
  effectiveGasPrice: string;
}

/**
 * Interface for transaction logs
 */
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

/**
 * Interface for parsed USDC transfer details
 */
interface USDCTransferDetails {
  from: string;
  to: string;
  amount: bigint;
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
}

/**
 * Custom error class for verification failures
 */
class VerificationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

/**
 * Makes an RPC call with retry logic across multiple endpoints
 */
async function rpcCall<T>(
  chainId: number,
  method: string,
  params: unknown[]
): Promise<T> {
  const endpoints = RPC_ENDPOINTS[chainId];

  if (!endpoints || endpoints.length === 0) {
    throw new VerificationError(
      `No RPC endpoints configured for chain ${chainId}`,
      "UNSUPPORTED_CHAIN",
      { chainId }
    );
  }

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
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
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return data.result as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`RPC call failed for ${endpoint}: ${lastError.message}`);
      // Continue to next endpoint
    }
  }

  throw new VerificationError(
    `All RPC endpoints failed for chain ${chainId}`,
    "RPC_FAILURE",
    { chainId, lastError: lastError?.message }
  );
}

/**
 * Fetches transaction receipt from the blockchain
 */
async function getTransactionReceipt(
  txHash: string,
  chainId: number
): Promise<TransactionReceipt | null> {
  return rpcCall<TransactionReceipt | null>(
    chainId,
    "eth_getTransactionReceipt",
    [txHash]
  );
}

/**
 * Validates the transaction hash format
 */
function isValidTxHash(txHash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

/**
 * Validates the Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Normalizes an Ethereum address to lowercase with checksum-independent comparison
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Pads an address to 32 bytes for topic comparison
 */
function addressToTopic(address: string): string {
  return "0x" + normalizeAddress(address).slice(2).padStart(64, "0");
}

/**
 * Parses a 32-byte topic back to an address
 */
function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

/**
 * Parses the amount from log data (uint256)
 */
function parseAmountFromData(data: string): bigint {
  // Remove 0x prefix and parse as hex
  const cleanData = data.startsWith("0x") ? data.slice(2) : data;
  return BigInt("0x" + cleanData);
}

/**
 * Parses USDC transfer events from transaction logs
 */
function parseUSDCTransfers(
  logs: TransactionLog[],
  usdcAddress: string,
  txHash: string
): USDCTransferDetails[] {
  const transfers: USDCTransferDetails[] = [];
  const normalizedUsdcAddress = normalizeAddress(usdcAddress);

  for (const log of logs) {
    // Check if this log is from the USDC contract
    if (normalizeAddress(log.address) !== normalizedUsdcAddress) {
      continue;
    }

    // Check if this is a Transfer event (first topic is event signature)
    if (
      log.topics.length < 3 ||
      log.topics[0].toLowerCase() !== TRANSFER_EVENT_SIGNATURE.toLowerCase()
    ) {
      continue;
    }

    // Parse the transfer details
    // topics[1] = from address (indexed)
    // topics[2] = to address (indexed)
    // data = amount (not indexed)
    const from = topicToAddress(log.topics[1]);
    const to = topicToAddress(log.topics[2]);
    const amount = parseAmountFromData(log.data);

    transfers.push({
      from,
      to,
      amount,
      contractAddress: log.address,
      blockNumber: parseInt(log.blockNumber, 16),
      transactionHash: txHash,
    });
  }

  return transfers;
}

/**
 * Verifies a USDC transfer on Base (8453) or Polygon (137) networks.
 *
 * @param txHash - The transaction hash to verify
 * @param chainId - The chain ID (8453 for Base, 137 for Polygon)
 * @param expectedAmount - The expected transfer amount in USDC base units (6 decimals)
 * @param expectedTo - The expected recipient address
 * @returns Promise<boolean> - True if the transfer is verified, false otherwise
 *
 * @example
 * ```typescript
 * // Verify a 100 USDC transfer on Base
 * const amount = BigInt(100 * 10 ** 6); // 100 USDC in base units
 * const verified = await verifyUSDCTransfer(
 *   "0x1234...abcd",
 *   8453,
 *   amount,
 *   "0xRecipient..."
 * );
 * ```
 */
async function verifyUSDCTransfer(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<boolean> {
  // Input validation
  if (!isValidTxHash(txHash)) {
    throw new VerificationError(
      "Invalid transaction hash format",
      "INVALID_TX_HASH",
      { txHash }
    );
  }

  if (!isValidAddress(expectedTo)) {
    throw new VerificationError(
      "Invalid recipient address format",
      "INVALID_ADDRESS",
      { expectedTo }
    );
  }

  if (expectedAmount <= 0n) {
    throw new VerificationError(
      "Expected amount must be positive",
      "INVALID_AMOUNT",
      { expectedAmount: expectedAmount.toString() }
    );
  }

  // Check if chain is supported
  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) {
    throw new VerificationError(
      `Unsupported chain ID: ${chainId}. Supported chains: Base (8453), Polygon (137)`,
      "UNSUPPORTED_CHAIN",
      { chainId, supportedChains: Object.keys(USDC_ADDRESSES) }
    );
  }

  // Fetch the transaction receipt
  const receipt = await getTransactionReceipt(txHash, chainId);

  // Check if transaction exists
  if (!receipt) {
    console.log(`Transaction ${txHash} not found on chain ${chainId}`);
    return false;
  }

  // Check if transaction was successful (status = 0x1)
  if (receipt.status !== "0x1") {
    console.log(`Transaction ${txHash} failed (status: ${receipt.status})`);
    return false;
  }

  // Parse USDC transfer events from the logs
  const transfers = parseUSDCTransfers(receipt.logs, usdcAddress, txHash);

  if (transfers.length === 0) {
    console.log(`No USDC transfers found in transaction ${txHash}`);
    return false;
  }

  // Normalize the expected recipient address for comparison
  const normalizedExpectedTo = normalizeAddress(expectedTo);

  // Check if any transfer matches the expected criteria
  for (const transfer of transfers) {
    const toMatches = normalizeAddress(transfer.to) === normalizedExpectedTo;
    const amountMatches = transfer.amount === expectedAmount;

    if (toMatches && amountMatches) {
      console.log(`USDC transfer verified successfully:`, {
        txHash,
        chainId,
        from: transfer.from,
        to: transfer.to,
        amount: transfer.amount.toString(),
        amountFormatted: `${Number(transfer.amount) / 10 ** USDC_DECIMALS} USDC`,
        blockNumber: transfer.blockNumber,
      });
      return true;
    }
  }

  // Log why verification failed
  console.log(`USDC transfer verification failed:`, {
    txHash,
    chainId,
    expectedTo: normalizedExpectedTo,
    expectedAmount: expectedAmount.toString(),
    foundTransfers: transfers.map((t) => ({
      to: t.to,
      amount: t.amount.toString(),
      toMatches: normalizeAddress(t.to) === normalizedExpectedTo,
      amountMatches: t.amount === expectedAmount,
    })),
  });

  return false;
}

/**
 * Extended verification function that returns detailed transfer information
 */
async function verifyUSDCTransferDetailed(
  txHash: string,
  chainId: number,
  expectedAmount: bigint,
  expectedTo: string
): Promise<{
  verified: boolean;
  transfer?: USDCTransferDetails;
  receipt?: TransactionReceipt;
  allTransfers?: USDCTransferDetails[];
  error?: string;
}> {
  try {
    // Input validation
    if (!isValidTxHash(txHash)) {
      return { verified: false, error: "Invalid transaction hash format" };
    }

    if (!isValidAddress(expectedTo)) {
      return { verified: false, error: "Invalid recipient address format" };
    }

    const usdcAddress = USDC_ADDRESSES[chainId];
    if (!usdcAddress) {
      return { verified: false, error: `Unsupported chain ID: ${chainId}` };
    }

    const receipt = await getTransactionReceipt(txHash, chainId);

    if (!receipt) {
      return { verified: false, error: "Transaction not found" };
    }

    if (receipt.status !== "0x1") {
      return {
        verified: false,
        receipt,
        error: "Transaction failed",
      };
    }

    const transfers = parseUSDCTransfers(receipt.logs, usdcAddress, txHash);
    const normalizedExpectedTo = normalizeAddress(expectedTo);

    const matchingTransfer = transfers.find(
      (t) =>
        normalizeAddress(t.to) === normalizedExpectedTo &&
        t.amount === expectedAmount
    );

    return {
      verified: !!matchingTransfer,
      transfer: matchingTransfer,
      receipt,
      allTransfers: transfers,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Export functions and types
export {
  verifyUSDCTransfer,
  verifyUSDCTransferDetailed,
  VerificationError,
  USDC_ADDRESSES,
  RPC_ENDPOINTS,
  USDC_DECIMALS,
  USDCTransferDetails,
  TransactionReceipt,
  TransactionLog,
};

// Example usage and tests
async function main() {
  console.log("USDC Transfer Verification Examples\n");
  console.log("====================================\n");

  // Example 1: Verify a transfer on Base
  console.log("Example 1: Verifying a USDC transfer on Base");
  const baseExample = {
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    chainId: 8453,
    amount: BigInt(100 * 10 ** 6), // 100 USDC
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  };

  try {
    const baseResult = await verifyUSDCTransfer(
      baseExample.txHash,
      baseExample.chainId,
      baseExample.amount,
      baseExample.to
    );
    console.log(`Base verification result: ${baseResult}\n`);
  } catch (error) {
    console.log(`Base verification error: ${error}\n`);
  }

  // Example 2: Verify a transfer on Polygon
  console.log("Example 2: Verifying a USDC transfer on Polygon");
  const polygonExample = {
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    chainId: 137,
    amount: BigInt(50 * 10 ** 6), // 50 USDC
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595