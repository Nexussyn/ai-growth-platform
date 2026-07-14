# Roadmap M2M Commerce Réel

## Pivot effectué le 2026-07-14
**Abandon du système bounty fictif → Commerce A2A/M2M réel via x402 + Base USDC**

## Architecture nouvelle

```
┌─────────────────────────────────────────────┐
│              NEXUSSYN M2M PLATFORM           │
│                                             │
│  x402-seller ──── vend des services ────►  USDC
│       │                                     │
│  agent-scout ──── découvre acheteurs         │
│       │                                     │
│  agent-optimizer ─ ajuste les prix          │
│       │                                     │
│  agent-monitor ─── surveille + corrige       │
└─────────────────────────────────────────────┘
```

## Services vendus via x402 (HTTP 402 + USDC on Base)

| Service | Prix | Catégorie |
|---------|------|-----------|
| `crypto-price-feed` | 0.001 USDC | oracle |
| `wallet-analysis` | 0.005 USDC | data |
| `agent-discovery` | 0.002 USDC | data |
| `claude-inference` | 0.010 USDC | inference |
| `market-signal` | 0.003 USDC | oracle |

## Agents autonomes avec intérêt économique

### agent-optimizer (toutes les heures)
- Analyse les métriques de vente x402
- Ajuste les prix dynamiquement via Claude Opus
- **Rémunération : 10% des gains générés par ses ajustements**

### agent-scout (toutes les 30 min)
- Scanne les registres A2A/ACP/Agentverse
- Envoie des offres ciblées aux agents acheteurs
- **Rémunération : 5% du revenu des clients apportés**

### agent-monitor (toutes les 15 min)
- Health-check de chaque endpoint x402
- Résout transactions bloquées, désactive partenaires inactifs
- **Rémunération : 0.001 USDC par incident résolu**

## Pour activer après restauration du projet

1. Restaurer le projet Supabase
2. Appliquer la migration : `supabase/migrations/20260714_m2m_commerce_core.sql`
3. Déployer les 4 Edge Functions : `agent-optimizer`, `agent-scout`, `agent-monitor`, `x402-seller`
4. Configurer les secrets : `TREASURY_WALLET_ADDRESS`, `ANTHROPIC_API_KEY`
5. Appliquer les crons : `supabase/crons/m2m_crons.sql`
6. Tester : `curl https://<project>.supabase.co/functions/v1/x402-seller?discover=1`

## Bounties
Archivés en base, visibles mais non ciblés. Aucun cron ne les pousse.
