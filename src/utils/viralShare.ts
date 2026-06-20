# TypeScript Viral Share Link Utility

A comprehensive utility for generating viral share links with referral codes, featuring base58 encoding, multi-channel support, and impression tracking.

## Implementation

```typescript
/**
 * Viral Share Link Generator with Referral Codes
 * 
 * Features:
 * - Base58 encoded referral codes (no confusing characters)
 * - Multi-channel share URL building
 * - Impression tracking with analytics
 * - Rate limiting and validation
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ShareChannel {
  name: string;
  paramName: string;
  urlTemplate?: string;
  additionalParams?: Record<string, string>;
}

interface ImpressionData {
  code: string;
  timestamp: number;
  channel?: string;
  userAgent?: string;
  referrer?: string;
  ipHash?: string;
}

interface ImpressionStats {
  totalImpressions: number;
  uniqueVisitors: number;
  impressionsByChannel: Record<string, number>;
  impressionsByHour: Record<string, number>;
  firstImpression: number;
  lastImpression: number;
}

interface ReferralCodeMetadata {
  agentSlug: string;
  createdAt: number;
  version: number;
  checksum: string;
}

type ImpressionCallback = (data: ImpressionData) => void | Promise<void>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Base58 alphabet - excludes confusing characters (0, O, I, l)
 * This makes codes easier to read and share
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Predefined share channels with their configurations
 */
const SHARE_CHANNELS: Record<string, ShareChannel> = {
  twitter: {
    name: 'Twitter/X',
    paramName: 'ref',
    urlTemplate: 'https://twitter.com/intent/tweet?url={url}&text={text}',
    additionalParams: { utm_source: 'twitter', utm_medium: 'social' }
  },
  facebook: {
    name: 'Facebook',
    paramName: 'ref',
    urlTemplate: 'https://www.facebook.com/sharer/sharer.php?u={url}',
    additionalParams: { utm_source: 'facebook', utm_medium: 'social' }
  },
  linkedin: {
    name: 'LinkedIn',
    paramName: 'ref',
    urlTemplate: 'https://www.linkedin.com/sharing/share-offsite/?url={url}',
    additionalParams: { utm_source: 'linkedin', utm_medium: 'social' }
  },
  whatsapp: {
    name: 'WhatsApp',
    paramName: 'ref',
    urlTemplate: 'https://wa.me/?text={text}%20{url}',
    additionalParams: { utm_source: 'whatsapp', utm_medium: 'messaging' }
  },
  telegram: {
    name: 'Telegram',
    paramName: 'ref',
    urlTemplate: 'https://t.me/share/url?url={url}&text={text}',
    additionalParams: { utm_source: 'telegram', utm_medium: 'messaging' }
  },
  email: {
    name: 'Email',
    paramName: 'ref',
    urlTemplate: 'mailto:?subject={subject}&body={text}%20{url}',
    additionalParams: { utm_source: 'email', utm_medium: 'email' }
  },
  sms: {
    name: 'SMS',
    paramName: 'ref',
    urlTemplate: 'sms:?body={text}%20{url}',
    additionalParams: { utm_source: 'sms', utm_medium: 'messaging' }
  },
  direct: {
    name: 'Direct Link',
    paramName: 'ref',
    additionalParams: { utm_source: 'direct', utm_medium: 'link' }
  },
  qrcode: {
    name: 'QR Code',
    paramName: 'ref',
    additionalParams: { utm_source: 'qrcode', utm_medium: 'offline' }
  }
};

// ============================================================================
// Base58 Encoding Utilities
// ============================================================================

/**
 * Encodes a byte array to base58 string
 */
function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  
  // Count leading zeros
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) leadingZeros++;
    else break;
  }
  
  // Convert to base58
  const digits: number[] = [0];
  
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
  let result = '1'.repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  
  return result;
}

/**
 * Decodes a base58 string to byte array
 */
function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  
  // Count leading '1's (zeros in base58)
  let leadingOnes = 0;
  for (const char of str) {
    if (char === '1') leadingOnes++;
    else break;
  }
  
  // Convert from base58
  const bytes: number[] = [0];
  
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
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
  
  // Add leading zeros and reverse
  const result = new Uint8Array(leadingOnes + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[leadingOnes + bytes.length - 1 - i] = bytes[i];
  }
  
  return result;
}

// ============================================================================
// Hashing and Checksum Utilities
// ============================================================================

/**
 * Simple hash function for generating deterministic codes
 * Uses FNV-1a algorithm for good distribution
 */
function fnv1aHash(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
    hash = hash >>> 0; // Convert to unsigned
  }
  return hash;
}

/**
 * Generates a checksum for validation
 */
function generateChecksum(data: string): string {
  const hash = fnv1aHash(data);
  const bytes = new Uint8Array([
    (hash >> 24) & 0xff,
    (hash >> 16) & 0xff,
    (hash >> 8) & 0xff,
    hash & 0xff
  ]);
  return encodeBase58(bytes).slice(0, 4);
}

/**
 * Validates a checksum
 */
function validateChecksum(data: string, checksum: string): boolean {
  return generateChecksum(data) === checksum;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generates a unique referral code for an agent using base58 encoding
 * 
 * The code structure:
 * - Version byte (1 byte)
 * - Timestamp (4 bytes, seconds since epoch)
 * - Agent hash (4 bytes)
 * - Random component (2 bytes)
 * - Checksum (derived from above)
 * 
 * @param agentSlug - Unique identifier for the agent/user
 * @returns Base58 encoded referral code
 * 
 * @example
 * ```typescript
 * const code = generateReferralCode('john-doe');
 * console.log(code); // e.g., "7Xj9KmN2pQrS"
 * ```
 */
export function generateReferralCode(agentSlug: string): string {
  if (!agentSlug || typeof agentSlug !== 'string') {
    throw new Error('Agent slug must be a non-empty string');
  }
  
  // Normalize the slug
  const normalizedSlug = agentSlug.toLowerCase().trim();
  
  // Version byte (allows for future format changes)
  const version = 1;
  
  // Timestamp (seconds since epoch, 4 bytes)
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Agent hash (deterministic based on slug)
  const agentHash = fnv1aHash(normalizedSlug);
  
  // Random component for uniqueness
  const random = Math.floor(Math.random() * 65536);
  
  // Build the byte array
  const bytes = new Uint8Array(11);
  
  // Version (1 byte)
  bytes[0] = version;
  
  // Timestamp (4 bytes, big-endian)
  bytes[1] = (timestamp >> 24) & 0xff;
  bytes[2] = (timestamp >> 16) & 0xff;
  bytes[3] = (timestamp >> 8) & 0xff;
  bytes[4] = timestamp & 0xff;
  
  // Agent hash (4 bytes, big-endian)
  bytes[5] = (agentHash >> 24) & 0xff;
  bytes[6] = (agentHash >> 16) & 0xff;
  bytes[7] = (agentHash >> 8) & 0xff;
  bytes[8] = agentHash & 0xff;
  
  // Random (2 bytes, big-endian)
  bytes[9] = (random >> 8) & 0xff;
  bytes[10] = random & 0xff;
  
  // Encode to base58
  const encoded = encodeBase58(bytes);
  
  // Add checksum suffix
  const checksum = generateChecksum(encoded);
  
  return `${encoded}${checksum}`;
}

/**
 * Validates a referral code format and checksum
 * 
 * @param code - The referral code to validate
 * @returns Whether the code is valid
 */
export function validateReferralCode(code: string): boolean {
  if (!code || code.length < 8) return false;
  
  try {
    const checksum = code.slice(-4);
    const encoded = code.slice(0, -4);
    
    if (!validateChecksum(encoded, checksum)) {
      return false;
    }
    
    const bytes = decodeBase58(encoded);
    
    // Check version
    if (bytes[0] !== 1) return false;
    
    // Check minimum length
    if (bytes.length < 11) return false;
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts metadata from a referral code
 * 
 * @param code - The referral code to decode
 * @returns Metadata about the referral code
 */
export function decodeReferralCode(code: string): ReferralCodeMetadata | null {
  if (!validateReferralCode(code)) return null;
  
  try {
    const checksum = code.slice(-4);
    const encoded = code.slice(0, -4);
    const bytes = decodeBase58(encoded);
    
    const version = bytes[0];
    const timestamp = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
    
    return {
      agentSlug: 'unknown', // Cannot reverse the hash
      createdAt: timestamp * 1000,
      version,
      checksum
    };
  } catch {
    return null;
  }
}

/**
 * Builds a share URL with referral code and channel tracking
 * 
 * @param baseUrl - The base URL to share
 * @param code - The referral code
 * @param channel - The sharing channel (twitter, facebook, etc.)
 * @param options - Additional options for URL building
 * @returns Complete share URL with tracking parameters
 * 
 * @example
 * ```typescript
 * const url = buildShareUrl(
 *   'https://example.com/product',
 *   '7Xj9KmN2pQrS',
 *   'twitter',
 *   { text: 'Check this out!' }
 * );
 * ```
 */
export function buildShareUrl(
  baseUrl: string,
  code: string,
  channel: string,
  options: {
    text?: string;
    subject?: string;
    hashtags?: string[];
    via?: string;
    customParams?: Record<string, string>;
    includeUtm?: boolean;
  } = {}
): string {
  const {
    text = '',
    subject = '',
    hashtags = [],
    via = '',
    customParams = {},
    includeUtm = true
  } = options;
  
  // Validate inputs
  if (!baseUrl) throw new Error('Base URL is required');
  if (!code) throw new Error('Referral code is required');
  
  // Normalize channel
  const normalizedChannel = channel.toLowerCase().trim();
  const channelConfig = SHARE_CHANNELS[normalizedChannel] || SHARE_CHANNELS.direct;
  
  // Build the target URL with referral code
  const targetUrl = new URL(baseUrl);
  targetUrl.searchParams.set(channelConfig.paramName, code);
  targetUrl.searchParams.set('ch', normalizedChannel);
  
  // Add UTM parameters if enabled
  if (includeUtm && channelConfig.additionalParams) {
    for (const [key, value] of Object.entries(channelConfig.additionalParams)) {
      targetUrl.searchParams.set(key, value);
    }
    targetUrl.searchParams.set('utm_campaign', 'referral');
  }
  
  // Add custom parameters
  for (const [key, value] of Object.entries(customParams)) {
    targetUrl.searchParams.set(key, value);
  }
  
  const encodedUrl = encodeURIComponent(targetUrl.toString());
  const encodedText = encodeURIComponent(text);
  const encodedSubject = encodeURIComponent(subject);
  
  // If channel has a URL template, use it
  if (channelConfig.urlTemplate) {
    let shareUrl = channelConfig.urlTemplate
      .replace('{url}', encodedUrl)
      .replace('{text}', encodedText)
      .replace('{subject}', encodedSubject);
    
    // Handle Twitter-specific parameters
    if (normalizedChannel === 'twitter') {
      if (hashtags.length > 0) {
        shareUrl += `&hashtags=${hashtags.join(