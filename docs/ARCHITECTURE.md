# Architecture — AI GROWTH

Ce document décrit le flux de bout en bout du système, le rôle de chaque Edge Function
clé et les tables principales. Il décrit le système **tel qu'il est** : armé, prêt à
encaisser, mais sans aucun paiement réel reçu à ce jour. Aucune métrique n'est inventée.

---

## 1. Flux de bout en bout

```
  Sources publiques réelles
  (Gitcoin Grants Stack Indexer, GitHub bounty issues, Algora)
            │
            ▼
  [1] runtime-opportunity-scout
      • interroge les API publiques
      • normalise chaque opportunité (title, url, reward_usd|null)
      • idempotent : task_id = "opp-<source>-<SHA1(url)[0:24]>"
      • enfile dans runtime_jobs
            │
            ▼
  [2] runtime-discovery (orchestrateur)
      • POST /route : enfile/priorise des runtime_jobs
      • classe le task_kind, range la priorité, applique les stop_reasons
            │
            ▼
  [3] runtime_jobs  ── file d'attente centrale durable
      • status : queued → running → (done | dead_letter)
            │
            ▼
  [4] runtime-agentic-bridge
      • lit les jobs status='queued' (batch_size, max 8)
      • marque running, exécute via un connecteur d'intelligence
      • journalise : runtime_external_calls (coût réel),
                     runtime_evidence_bundles (preuve),
                     runtime_audit_log (audit)
            │
            ▼
  Exécution + preuve  ───────────────┐
                                      │
  [6] runtime-task-deposit            │
      • checkout client réel          │
      • split 80% agent / 20% plateforme
      • crée un payment_intent        │
            │                         │
            ▼                         ▼
  payment_intents  ◀──── matching ──── [5] runtime-onchain-watcher
                          tx⟷intent      • scan RPC réel des 4 chaînes
                                         • détecte l'USDC entrant vers le wallet
                                         • insère dans onchain_payments
                                         • matche les payment_intents
```

Le wallet de réception (Base, Arbitrum, Optimism, Polygon) :
`0xb438d36b425b504724a1c72aa0941c80cb940995`.

---

## 2. Rôle de chaque Edge Function clé

### `runtime-opportunity-scout`
Découverte opportuniste d'opportunités **réelles** rémunérées depuis des sources
publiques. Implémentation actuelle :

- **Sources interrogées :**
  - **Gitcoin** — Grants Stack Indexer V2 (GraphQL public) : rounds financés.
  - **GitHub** — `search/issues` sur des labels de type bounty.
  - **Algora** — endpoint public de bounties (best-effort, tolérant aux changements
    de schéma).
- **Idempotence :** `task_id = "opp-<source>-<SHA1(url) tronqué>"`. Avant insertion, le
  scout vérifie l'existence du `task_id` dans `runtime_jobs`.
- **Honnêteté des montants :** `reward_usd` extrait du texte uniquement s'il est
  réellement présent ; sinon `null`. Aucune valeur devinée.
- **Classement :** `task_kind = "bounty_solving"` si une récompense est connue, sinon
  `"research"`. La priorité croît avec la récompense (`reward_usd`).
- **Marquage de source :** `source_class = "external_discovery"`.
- **Robustesse :** `fetch` avec timeout dur (9 s) ; une source en échec n'interrompt
  pas les autres ; chaque source renvoie un rapport (`fetched`/`inserted`/`skipped`).
- **Sortie :** `{ ok, sources: [...rapports], total_inserted }`.

### `runtime-discovery`
Orchestrateur / routeur du système.

- `GET /` ou `/status` : renvoie l'état de la file (`queued`, `running`,
  `dead_letter`), la liste des agents, la table de routage et les `stop_reasons`.
- `POST /route` : classe un travail (`classifyTaskKind`), calcule sa priorité
  (`rankPriority`) et l'enfile dans `runtime_jobs`. Écrit dans `runtime_audit_log`.
- Table de routage : `discovery, code, db, qa, security, deploy, observability,
  rollback`.
- Conditions d'arrêt (`STOP_REASONS`) : `security_violation`, `missing_diff`,
  `missing_preview_change`, `source_loop`, `failed_rollback`, `code_ui_divergence`.

### `runtime-agentic-bridge`
Moteur d'exécution des jobs.

- Lit jusqu'à `batch_size` (max 8, défaut 4) jobs `status='queued'`, les plus anciens
  d'abord ; les marque `running`.
- Sélectionne un connecteur selon le `task_kind`/`agent_role`/`payload`
  (`pickProviderForJob`).
- Journalise chaque exécution :
  - `runtime_external_calls` — connecteur, endpoint, code HTTP, hash de réponse,
    coût réel.
  - `runtime_evidence_bundles` — bundle de preuve d'exécution.
  - `runtime_audit_log` — action et effet, erreurs éventuelles.
- **Intelligence cible :** Claude (Anthropic) via `ANTHROPIC_API_KEY`, avec coût
  honnête facturé au tarif réel ($3 / $15 par MTok selon entrée/sortie).
- **État du code sur cette branche :** le bridge s'appuie sur des connecteurs publics
  (Pollinations text/code/test, Wikipedia, …) comme moteur d'exécution et fallback.
  La bascule complète vers Claude se fait via le secret `ANTHROPIC_API_KEY` et la
  couche d'intelligence partagée correspondante.

### `runtime-onchain-watcher`
Détecteur de paiement on-chain (le rail d'encaissement).

- Charge les chaînes actives depuis `payment_chains`. Paramètre optionnel `?chain=<id>`
  pour cibler une seule chaîne.
- Pour chaque chaîne, scanne les logs RPC de l'event `Transfer` USDC
  (`topic 0xddf252ad...`) vers le `watch_address`, par fenêtres de blocs
  (`MAX_BLOCK_RANGE = 800`).
- Insère chaque transfert détecté dans `onchain_payments` (unicité sur
  `(tx_hash, log_index)`), puis tente de matcher un `payment_intent` ouvert et le
  marque payé (`matched_tx_hash`, `matched_at`).
- Sortie : `{ ok, scanned_chains, total_inserted, total_matched, results }`.

> ⚠️ **Limite RPC Polygon.** Le RPC public Polygon plafonne `eth_getLogs` à ~50 blocs.
> Si vous ré-élargissez la couverture multi-chaînes, la fenêtre de scan Polygon doit
> rester petite (≈45 blocs) tandis que les autres chaînes peuvent utiliser une fenêtre
> large (≈800). Voir le RUNBOOK pour la procédure.

### `runtime-task-deposit`
Page de checkout client réelle. Crée un `payment_intent` pour une tâche, applique le
split **80 % agent / 20 % plateforme**, et fournit l'adresse de règlement USDC. Le
`runtime-onchain-watcher` boucle ensuite l'intent une fois le paiement détecté.

---

## 3. Tables principales

### `runtime_jobs` — file d'attente centrale
| Colonne | Type | Rôle |
|---|---|---|
| `task_id` | text UNIQUE | clé d'idempotence (SHA-1 d'URL pour le scout) |
| `agent_role` | text | rôle cible |
| `task_kind` | text | `bounty_solving`, `research`, `code`, … |
| `status` | text | `queued` → `running` → `done`/`dead_letter` |
| `payload` | jsonb | données d'entrée (url, source, reward_usd, …) |
| `result` / `evidence` | jsonb | sortie et preuve |
| `attempts` / `max_attempts` | int | gestion des reprises |
| `priority` | — | classement (croît avec la récompense) |
| `created_at` / `started_at` / `completed_at` | timestamptz | cycle de vie |

### `onchain_payments` — paiements détectés on-chain
| Colonne | Type | Rôle |
|---|---|---|
| `network` / `chain_id` | text / int | chaîne (Base 8453, …) |
| `token_contract` | text | contrat USDC |
| `tx_hash` / `log_index` | text / int | identité unique du transfert |
| `from_address` / `destination` | text | émetteur / wallet de réception |
| `amount_raw` / `amount_usd` | numeric | montant brut / en USD |
| `intent_id` | uuid → payment_intents | matching |
| `status` | text | `confirmed` |
| `raw_log` | jsonb | log RPC brut (preuve) |

Contrainte d'unicité : `(tx_hash, log_index)`.

### `payment_intents` — intentions de paiement
| Colonne | Type | Rôle |
|---|---|---|
| `reference` | text UNIQUE | référence client |
| `amount_usdc` | numeric | montant attendu |
| `network` / `currency` | text | `Base` / `USDC` |
| `destination` | text | wallet de réception |
| `status` | text | `pending` → payé une fois matché |
| `matched_tx_hash` / `matched_at` | text / timestamptz | rapprochement |
| `expires_at` | timestamptz | expiration (24 h par défaut) |

### `payment_chains` — configuration des chaînes scannées
| Colonne | Type | Rôle |
|---|---|---|
| `id` | text PK | identifiant de chaîne |
| `network` / `chain_id` | text / int | chaîne |
| `token_contract` / `token_decimals` | text / int | USDC sur la chaîne |
| `watch_address` | text | wallet surveillé |
| `active` | bool | scan activé |
| `last_scanned_block` / `last_scan_at` | bigint / timestamptz | progression |
| `public_rpcs` | jsonb | endpoints RPC publics |
| `explorer_url` | text | explorateur de blocs |

### `runtime_external_calls` — journal honnête des appels
| Colonne | Type | Rôle |
|---|---|---|
| `task_id` / `agent_role` | text | corrélation |
| `connector` / `endpoint` | text | fournisseur appelé |
| `cost_cents` / `is_paid` | int / bool | **coût réel** |
| `status_code` / `response_hash` | int / text | preuve de réponse |
| `reversible` | bool | effet réversible ou non |

### `runtime_audit_log` — audit
| Colonne | Type | Rôle |
|---|---|---|
| `task_id` / `agent_role` / `action` | text | quoi / qui / quelle action |
| `diff_or_effect` | jsonb | effet de l'action |
| `evidence` | jsonb | preuve |
| `before_state` / `after_state` | jsonb | état avant/après |
| `error` | text | erreur éventuelle |

---

## 4. Ordonnancement (pg_cron)

Les jobs `pg_cron` déclenchent les fonctions à intervalle régulier (scout, discovery,
bridge, watcher, rapports). La liste des crons actifs/désactivés et la procédure de
réactivation sont documentées dans [`RUNBOOK.md`](RUNBOOK.md).

---

## 5. Principe d'honnêteté (rappel architectural)

- Le scout n'enfile que des opportunités réellement présentes dans une source
  publique ; pas de fabrication.
- Le bridge journalise le **coût réel** de chaque appel externe.
- Le watcher n'insère que des transferts USDC **réellement détectés** on-chain.
- Aucune table n'est alimentée par des mocks. Tout flux auto-référentiel/mock est
  proscrit (cf. l'historique de nettoyage de `open-world-runtime`).
