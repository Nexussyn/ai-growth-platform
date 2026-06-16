# AI GROWTH — Intermédiaire IA opportuniste

> Un système opportuniste qui met des intelligences artificielles en relation avec
> de vraies opportunités rémunérées, et capte une commission d'intermédiaire,
> avec règlement en USDC on-chain.

---

## ADN du projet

**AI GROWTH** est un système **opportuniste**. Son but unique : trouver, partout dans
le monde, des générateurs de revenu réels (bounties, tâches payées, programmes de
commission) et y participer en mettant des systèmes agentiques / IA en relation avec
ces opportunités, afin d'en extraire un **profit d'intermédiaire**.

Le système est un **courtier IA** : il découvre l'opportunité, la qualifie et l'exécute
avec une intelligence réelle, fournit une preuve d'exécution, puis encaisse le paiement
on-chain en USDC.

### Principe d'honnêteté absolu

C'est la règle qui prime sur tout le reste :

- **Aucune donnée simulée.** Pas de fausse activité, pas de client fictif, pas de
  métrique inventée.
- **Aucun montant inventé.** Si une récompense n'est pas réellement extractible d'une
  source, elle est enregistrée comme `null` — jamais devinée.
- **Coûts réels uniquement.** Chaque appel externe est journalisé avec son coût réel.
- **Preuves vérifiables.** Chaque exécution produit un bundle de preuve et une entrée
  d'audit.

> **État actuel, dit honnêtement :** le système est **armé et prêt à encaisser**.
> Les rails de découverte, d'exécution et de détection de paiement on-chain sont en
> place. **Aucun paiement réel n'a encore été reçu.** Ce README ne contient donc
> volontairement aucune métrique de revenu ni de trafic.

---

## Vue d'ensemble de l'architecture

Le cœur du système est une **file d'attente centrale** (`runtime_jobs`) alimentée par
de la découverte d'opportunités réelles, traitée par une intelligence d'exécution
réelle, et bouclée par un détecteur de paiement on-chain.

```
                 ┌──────────────────────────┐
   APIs publiques│  runtime-opportunity-scout│  découverte d'opportunités RÉELLES
   (Gitcoin,     │  (idempotent, SHA-1 d'URL)│  (Gitcoin Grants, GitHub bounties,
    GitHub,      └────────────┬─────────────┘   Algora) → reward_usd=null si inconnu
    Algora)                   │
                              ▼
                    ┌───────────────────┐
                    │   runtime_jobs    │  ◀── file d'attente centrale
                    │   (queue durable) │      (status: queued/running/...)
                    └─────────┬─────────┘
              ▲               │
   /route     │               ▼
 ┌────────────┴─────┐  ┌──────────────────────┐
 │ runtime-discovery│  │ runtime-agentic-bridge│ intelligence d'exécution
 │ (orchestrateur)  │  │ (traite les jobs)     │ → runtime_external_calls
 └──────────────────┘  └──────────┬───────────┘ → runtime_evidence_bundles
                                  │              → runtime_audit_log (coût réel)
                                  ▼
                      preuve d'exécution + audit
                                  │
                                  ▼
   ┌───────────────────────┐   ┌──────────────────────────┐
   │ runtime-task-deposit  │   │ runtime-onchain-watcher   │  scan RPC réel des
   │ checkout client réel  │──▶│ (4 chaînes USDC)          │  4 chaînes → détecte
   │ (split 80/20)         │   │ onchain_payments          │  l'USDC entrant
   └───────────┬───────────┘   └──────────┬───────────────┘
               │                          │
               ▼                          ▼
        payment_intents  ◀────── matching tx ⟷ intent
```

### La boucle de revenu réelle, étape par étape

1. **Scout** (`runtime-opportunity-scout`) interroge de vraies API publiques
   (Gitcoin Grants Stack Indexer, issues GitHub à label bounty, bounties Algora) et
   enfile chaque opportunité réelle dans `runtime_jobs`. Idempotent : le `task_id` est
   un hash SHA-1 de l'URL. Jamais de montant inventé (`reward_usd = null` si non
   extractible).
2. **Discovery** (`runtime-discovery`) — orchestrateur/routeur. Sur `POST /route`, il
   enfile et priorise des `runtime_jobs`, et applique les conditions d'arrêt.
3. **File** (`runtime_jobs`) — file d'attente durable centrale.
4. **Bridge** (`runtime-agentic-bridge`) — traite les jobs `queued` avec une
   intelligence réelle (qualification/exécution). Journalise chaque appel dans
   `runtime_external_calls`, le bundle de preuve dans `runtime_evidence_bundles` et
   l'audit dans `runtime_audit_log`, avec coût honnête.
5. **Watcher** (`runtime-onchain-watcher`) — scan RPC réel des 4 chaînes pour détecter
   l'USDC entrant vers le wallet de réception → insère dans `onchain_payments` → matche
   les `payment_intents`.
6. **Deposit** (`runtime-task-deposit`) — page de checkout client réelle, avec un split
   80 % agent / 20 % plateforme.

> ℹ️ **Note de fidélité au code.** Ce README décrit l'intention du système. Le code
> de `runtime-agentic-bridge` présent sur cette branche utilise des connecteurs
> publics (Pollinations, Wikipedia, etc.) comme moteur d'exécution ; la couche
> d'intelligence Claude (`ANTHROPIC_API_KEY`) est le moteur cible. Voir
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour le détail réel par fonction.

---

## Stack technique

| Couche                | Technologie |
|-----------------------|-------------|
| Base de données       | Supabase / PostgreSQL (`project_id` `kjtirbnxxymeumycrhqv`) |
| Logique serveur       | Supabase Edge Functions (Deno / TypeScript) |
| Ordonnancement        | `pg_cron` |
| Intelligence          | Claude (Anthropic) via le secret `ANTHROPIC_API_KEY` |
| Rail de paiement      | USDC on-chain — Base, Arbitrum, Optimism, Polygon |
| Front statique        | `nexussyn.github.io/ai-growth-platform` (dossier `docs/`) |
| Dépôt                 | `Nexussyn/ai-growth-platform` (privé) |

Wallet de réception (public, sur les 4 chaînes) :
`0xb438d36b425b504724a1c72aa0941c80cb940995`

---

## Secrets requis

À configurer dans **Supabase → Settings → Edge Functions → Secrets**. Voir
[`.env.example`](.env.example) pour le détail et les descriptions. **Aucune valeur
réelle ne doit jamais être commitée.**

| Secret | Obligatoire | Rôle |
|--------|-------------|------|
| `ANTHROPIC_API_KEY` | Oui (intelligence réelle) | Clé Claude (`sk-ant-...`) |
| `SUPABASE_URL` | Auto | Injecté par Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Injecté par Supabase |
| `TELEGRAM_BOT_TOKEN` | Non (optionnel) | Notifications Telegram |

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — flux détaillé de bout en bout, rôle
  de chaque Edge Function clé, tables principales.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — commandes de vérification (curl, SQL de santé),
  gestion des crons, gestion de la clé Claude.

---

## Déploiement (résumé)

```bash
# Déployer une Edge Function
supabase functions deploy runtime-opportunity-scout --project-ref kjtirbnxxymeumycrhqv

# Configurer un secret
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref kjtirbnxxymeumycrhqv
```

Les détails opérationnels (vérification, crons, santé) sont dans le
[RUNBOOK](docs/RUNBOOK.md).
