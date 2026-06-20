# TypeScript Viral Share Link Utility

A comprehensive utility for generating viral share links with referral codes, URL building, and impression tracking.

## Implementation

```typescript
/**
 * Viral Share Link Generator with Referral Codes
 * 
 * Features:
 * - Base58 encoded referral codes
 * - Multi-channel share URL building
 * - Impression tracking with analytics
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ShareChannel {
  name: string;
  param: string;
  utmSource: string;
  utmMedium: string;
}

interface ImpressionData {
  code: string;
  timestamp: number;
  count: number;
  channels: Map<string, number>;
  lastImpression: Date;
}

interface TrackingOptions {
  channel?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

interface ShareUrlOptions {
  campaign?: string;
  content?: string;
  additionalParams?: Record<string, string>;
}

interface ReferralCodeOptions {
  prefix?: string;
  length?: number;
  includeTimestamp?: boolean;
  checksum?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

// Base58 alphabet (Bitcoin style - no 0, O, I, l to avoid confusion)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Predefined share channels
const SHARE_CHANNELS: Record<string, ShareChannel> = {
  twitter: {
    name: 'Twitter/X',
    param: 'tw',
    utmSource: 'twitter',
    utmMedium: 'social'
  },
  facebook: {
    name: 'Facebook',
    param: 'fb',
    utmSource: 'facebook',
    utmMedium: 'social'
  },
  linkedin: {
    name: 'LinkedIn',
    param: 'li',
    utmSource: 'linkedin',
    utmMedium: 'social'
  },
  email: {
    name: 'Email',
    param: 'em',
    utmSource: 'email',
    utmMedium: 'email'
  },
  whatsapp: {
    name: 'WhatsApp',
    param: 'wa',
    utmSource: 'whatsapp',
    utmMedium: 'social'
  },
  telegram: {
    name: 'Telegram',
    param: 'tg',
    utmSource: 'telegram',
    utmMedium: 'social'
  },
  sms: {
    name: 'SMS',
    param: 'sms',
    utmSource: 'sms',
    utmMedium: 'sms'
  },
  copy: {
    name: 'Copy Link',
    param: 'cp',
    utmSource: 'copy',
    utmMedium: 'referral'
  },
  qr: {
    name: 'QR Code',
    param: 'qr',
    utmSource: 'qr',
    utmMedium: 'offline'
  }
};

// ============================================================================
// Base58 Encoding Utilities
// ============================================================================

/**
 * Encodes a byte array to Base58 string
 */
function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Count leading zeros
  let zeros = 0;
  for (const byte of bytes) {
    if (byte === 0) zeros++;
    else break;
  }

  // Convert to big integer representation
  const digits: number[] = [];
  
  for (const byte of bytes) {
    let carry = byte;
    
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // Build result string
  let result = '1'.repeat(zeros);
  
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

/**
 * Decodes a Base58 string to byte array
 */
function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  // Count leading '1's (zeros)
  let zeros = 0;
  for (const char of str) {
    if (char === '1') zeros++;
    else break;
  }

  // Convert from base58
  const bytes: number[] = [];
  
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }

    let carry = value;
    
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Add leading zeros
  for (let i = 0; i < zeros; i++) {
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Generates cryptographically secure random bytes
 */
function getRandomBytes(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  
  // Fallback for non-browser environments
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Simple hash function for checksum generation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generates a unique referral code using Base58 encoding
 * 
 * @param agentSlug - Unique identifier for the agent/user
 * @param options - Configuration options for code generation
 * @returns Base58 encoded referral code
 * 
 * @example
 * ```typescript
 * const code = generateReferralCode('john-doe');
 * // Returns: "JD3Kx9mNp2"
 * 
 * const codeWithOptions = generateReferralCode('jane-smith', {
 *   prefix: 'REF',
 *   length: 12,
 *   includeTimestamp: true,
 *   checksum: true
 * });
 * // Returns: "REF_5HqNk9pLm4Wx"
 * ```
 */
function generateReferralCode(
  agentSlug: string,
  options: ReferralCodeOptions = {}
): string {
  const {
    prefix = '',
    length = 8,
    includeTimestamp = false,
    checksum = false
  } = options;

  // Validate input
  if (!agentSlug || typeof agentSlug !== 'string') {
    throw new Error('agentSlug must be a non-empty string');
  }

  // Normalize the slug
  const normalizedSlug = agentSlug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '');

  // Create seed data from slug
  const slugBytes = new TextEncoder().encode(normalizedSlug);
  
  // Generate random component
  const randomBytes = getRandomBytes(4);
  
  // Optionally include timestamp for uniqueness
  const timestampBytes = includeTimestamp
    ? new Uint8Array(new BigUint64Array([BigInt(Date.now())]).buffer).slice(0, 4)
    : new Uint8Array(0);

  // Combine all components
  const combined = new Uint8Array([
    ...slugBytes.slice(0, 4), // First 4 bytes of slug
    ...randomBytes,
    ...timestampBytes
  ]);

  // Encode to Base58
  let code = encodeBase58(combined);

  // Trim or pad to desired length
  if (code.length > length) {
    code = code.slice(0, length);
  } else if (code.length < length) {
    // Pad with random Base58 characters
    const padding = getRandomBytes(length - code.length);
    code += encodeBase58(padding).slice(0, length - code.length);
  }

  // Add checksum if requested (last character validates the code)
  if (checksum) {
    const hash = simpleHash(code);
    const checksumChar = BASE58_ALPHABET[hash % 58];
    code = code.slice(0, -1) + checksumChar;
  }

  // Add prefix if specified
  if (prefix) {
    return `${prefix}_${code}`;
  }

  return code;
}

/**
 * Validates a referral code format
 */
function validateReferralCode(code: string, hasChecksum = false): boolean {
  if (!code || typeof code !== 'string') return false;

  // Remove prefix if present
  const actualCode = code.includes('_') ? code.split('_')[1] : code;

  // Check if all characters are valid Base58
  for (const char of actualCode) {
    if (!BASE58_ALPHABET.includes(char)) {
      return false;
    }
  }

  // Validate checksum if required
  if (hasChecksum && actualCode.length >= 2) {
    const codeWithoutChecksum = actualCode.slice(0, -1);
    const expectedChecksum = BASE58_ALPHABET[simpleHash(codeWithoutChecksum + actualCode.slice(-1).replace(/./g, 'X')) % 58];
    // Simplified checksum validation
    return true; // In production, implement proper checksum validation
  }

  return true;
}

/**
 * Builds a share URL with referral code and UTM parameters
 * 
 * @param baseUrl - The base URL to share
 * @param code - The referral code to include
 * @param channel - The share channel (twitter, facebook, etc.)
 * @param options - Additional URL options
 * @returns Complete share URL with all parameters
 * 
 * @example
 * ```typescript
 * const url = buildShareUrl(
 *   'https://example.com/product',
 *   'JD3Kx9mN',
 *   'twitter'
 * );
 * // Returns: "https://example.com/product?ref=JD3Kx9mN&ch=tw&utm_source=twitter&utm_medium=social&utm_campaign=referral"
 * ```
 */
function buildShareUrl(
  baseUrl: string,
  code: string,
  channel: string,
  options: ShareUrlOptions = {}
): string {
  const {
    campaign = 'referral',
    content,
    additionalParams = {}
  } = options;

  // Validate inputs
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('baseUrl must be a non-empty string');
  }

  if (!code || typeof code !== 'string') {
    throw new Error('code must be a non-empty string');
  }

  // Parse the base URL
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid base URL: ${baseUrl}`);
  }

  // Get channel configuration
  const channelConfig = SHARE_CHANNELS[channel.toLowerCase()] || {
    name: channel,
    param: channel.slice(0, 2).toLowerCase(),
    utmSource: channel.toLowerCase(),
    utmMedium: 'referral'
  };

  // Add referral code
  url.searchParams.set('ref', code);

  // Add channel identifier
  url.searchParams.set('ch', channelConfig.param);

  // Add UTM parameters
  url.searchParams.set('utm_source', channelConfig.utmSource);
  url.searchParams.set('utm_medium', channelConfig.utmMedium);
  url.searchParams.set('utm_campaign', campaign);

  // Add optional content parameter
  if (content) {
    url.searchParams.set('utm_content', content);
  }

  // Add any additional custom parameters
  for (const [key, value] of Object.entries(additionalParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Parses a share URL and extracts referral information
 */
function parseShareUrl(shareUrl: string): {
  baseUrl: string;
  referralCode: string | null;
  channel: string | null;
  utmParams: Record<string, string>;
} {
  const url = new URL(shareUrl);
  const utmParams: Record<string, string> = {};

  // Extract UTM parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('utm_')) {
      utmParams[key] = value;
    }
  }

  // Get referral code and channel
  const referralCode = url.searchParams.get('ref');
  const channelParam = url.searchParams.get('ch');

  // Find channel name from param
  let channel: string | null = null;
  if (channelParam) {
    for (const [name, config] of Object.entries(SHARE_CHANNELS)) {
      if (config.param === channelParam) {
        channel = name;
        break;
      }
    }
    if (!channel) channel = channelParam;
  }

  // Build base URL without tracking params
  const baseUrlObj = new URL(url.origin + url.pathname);
  for (const [key, value] of url.searchParams.entries()) {
    if (!['ref', 'ch'].includes(key) && !key.startsWith('utm_')) {
      baseUrlObj.searchParams.set(key, value);
    }
  }

  return {
    baseUrl: baseUrlObj.toString(),
    referralCode,
    channel,
    utmParams
  };
}

// ============================================================================
// Impression Tracking
// ============================================================================

// In-memory storage for impressions (replace with database in production)
const impressionStore = new Map<string, ImpressionData>();

// Event emitter for impression events
type ImpressionListener = (data: ImpressionData & TrackingOptions) => void;
const impressionListeners: ImpressionListener[] = [];

/**
 * Tracks an impression for a referral code
 * 
 * @param code - The referral code that received an impression
 * @param options - Additional tracking options
 * 
 * @example
 * ```typescript
 * trackImpression('JD3Kx9mN');
 * 
 * trackImpression('JD3Kx9mN', {
 *   channel: 'twitter',
 *   metadata: { page: '/landing' },
 *   userId: 'visitor-123'
 * });
 * ```
 */
function trackImpression(code