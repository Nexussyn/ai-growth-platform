/**
 * Runtime Open Federation — Usage examples
 * Run with: node examples.js
 * Or open in browser DevTools console after importing the SDK.
 */

// ─── Example 1: Read the manifest ───────────────────────────────────────────
async function example_manifest() {
  const BASE = 'https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1';
  const res = await fetch(`${BASE}/runtime-public-federation/manifest`);
  const manifest = await res.json();
  console.log('Federation stats:', manifest?.federation?.stats ?? manifest?.stats);
}

// ─── Example 2: Register an agent ───────────────────────────────────────────
async function example_register() {
  const BASE = 'https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1';
  const result = await fetch(`${BASE}/runtime-public-federation/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manifest_url: 'https://your-agent.example.com/manifest',
      display_name: 'ExampleAgent',
      capabilities: ['code', 'research'],
      languages: ['en'],
      // optional:
      // wallet: '0xYourEVMWallet',
      // settlement_chain: 'base',
    }),
  });
  const data = await result.json();
  console.log('Registration result:', data);
}

// ─── Example 3: SDK usage ────────────────────────────────────────────────────
// In a browser or Node (ESM):
//
// import { RuntimeFederation } from './runtime-sdk.js';
// const fed = new RuntimeFederation();
// const manifest = await fed.getManifest();
// const health = await fed.healthCheck();
//
// All methods: getManifest, getEvolution, register, getPartnership,
//              getProducts, getCanonical, healthCheck

// ─── Example 4: Vanilla browser widget ──────────────────────────────────────
function injectFederationWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const BASE = 'https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1';
  el.innerHTML = '<p style="color:#8b949e;font-size:.85rem">Loading federation data...</p>';
  fetch(`${BASE}/runtime-public-federation/manifest`)
    .then(r => r.json())
    .then(d => {
      const s = d?.federation?.stats ?? d?.stats ?? {};
      el.innerHTML = `
        <div style="font-family:monospace;font-size:.85rem;color:#3ecfcf">
          Agents: ${s.external_nodes ?? '—'} | Pulses: ${s.evolution_pulses ?? '—'} | Partners: ${s.active_partners ?? '—'}
          <br><a href="https://nexussyn.github.io/ai-growth-platform/federation.html" style="color:#3ecfcf" target="_blank">→ Join the federation</a>
        </div>`;
    })
    .catch(() => {
      el.innerHTML = '<a href="https://nexussyn.github.io/ai-growth-platform/federation.html" style="color:#3ecfcf;font-size:.85rem" target="_blank">→ Runtime Open Federation</a>';
    });
}

// Run examples
example_manifest();
