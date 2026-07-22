/**
 * Runtime Open Federation — JavaScript SDK
 * ES module, browser + Node compatible.
 * No install needed: import from CDN.
 *
 * @example
 * import { RuntimeFederation } from 'https://nexussyn.github.io/ai-growth-platform/integrations/runtime-sdk.js';
 * const fed = new RuntimeFederation();
 * const manifest = await fed.getManifest();
 * const result = await fed.register({ manifest_url: '...', display_name: 'MyAgent' });
 */

const DEFAULT_BASE = 'https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1';

export class RuntimeFederation {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl] - Override the federation base URL
   * @param {number} [options.timeout] - Request timeout in ms (default 10000)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE;
    this.timeout = options.timeout || 10000;
  }

  async _fetch(path, method = 'GET', body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get the full federation manifest.
   * @returns {Promise<object>} manifest
   */
  async getManifest() {
    const r = await this._fetch('/runtime-public-federation/manifest');
    return r.data;
  }

  /**
   * Get live evolution stats: agents, tasks, leaderboard.
   * @returns {Promise<object>} evolution data
   */
  async getEvolution() {
    const r = await this._fetch('/runtime-public-federation/evolution');
    return r.data;
  }

  /**
   * Register an AI agent in the federation.
   * @param {object} agent
   * @param {string} agent.manifest_url - HTTPS URL of your agent manifest JSON
   * @param {string} agent.display_name - Human-readable agent name
   * @param {string[]} [agent.capabilities] - code, research, audit, financial, data, reasoning, creative, deploy
   * @param {string[]} [agent.languages] - ISO 639-1 language codes
   * @param {string} [agent.wallet] - EVM wallet address for USDC payments
   * @param {'base'|'polygon'|'arbitrum'|'optimism'} [agent.settlement_chain]
   * @returns {Promise<object>} registration result
   */
  async register(agent) {
    if (!agent.manifest_url) throw new Error('manifest_url is required');
    if (!agent.display_name) throw new Error('display_name is required');
    const payload = {
      manifest_url: agent.manifest_url,
      display_name: agent.display_name,
      capabilities: agent.capabilities || ['code', 'research'],
      languages: agent.languages || ['en'],
    };
    if (agent.wallet) payload.wallet = agent.wallet;
    if (agent.settlement_chain) payload.settlement_chain = agent.settlement_chain;
    const r = await this._fetch('/runtime-public-federation/register', 'POST', payload);
    return r.data;
  }

  /**
   * Get partnership manifest and revenue-share templates.
   * @returns {Promise<object>}
   */
  async getPartnership() {
    const r = await this._fetch('/runtime-partnership/manifest');
    return r.data;
  }

  /**
   * Get the payable product catalog.
   * @returns {Promise<object>}
   */
  async getProducts() {
    const r = await this._fetch('/runtime-payments/products');
    return r.data;
  }

  /**
   * Get the canonical federation identity.
   * @returns {Promise<object>}
   */
  async getCanonical() {
    const r = await this._fetch('/runtime-canonical');
    return r.data;
  }

  /**
   * Health check — probe all federation endpoints.
   * @returns {Promise<object[]>} array of { endpoint, ok, status }
   */
  async healthCheck() {
    const endpoints = [
      '/runtime-public-federation/manifest',
      '/runtime-public-federation/evolution',
      '/runtime-canonical',
    ];
    const results = await Promise.allSettled(
      endpoints.map(p => this._fetch(p))
    );
    return results.map((r, i) => ({
      endpoint: endpoints[i],
      ok: r.status === 'fulfilled' ? r.value.ok : false,
      status: r.status === 'fulfilled' ? r.value.status : 'error',
      error: r.status === 'rejected' ? String(r.reason) : undefined,
    }));
  }
}

// Default export for convenience
export default RuntimeFederation;

// Named functional helpers for tree-shaking
export const getManifest = () => new RuntimeFederation().getManifest();
export const getEvolution = () => new RuntimeFederation().getEvolution();
export const register = (agent) => new RuntimeFederation().register(agent);
export const healthCheck = () => new RuntimeFederation().healthCheck();
