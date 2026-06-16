# Runbook opérationnel — AI GROWTH

Procédures de vérification et d'exploitation. Toutes les commandes ci-dessous ciblent
le projet Supabase `kjtirbnxxymeumycrhqv`
(`https://kjtirbnxxymeumycrhqv.supabase.co`).

> Les appels aux Edge Functions nécessitent un en-tête `Authorization: Bearer <KEY>`.
> Utiliser la clé **anon** (publique) pour les appels publics, ou la clé
> **service_role** pour les appels privilégiés. **Ne jamais committer ces clés.**
> Exporter d'abord la variable :
>
> ```bash
> export SB_URL="https://kjtirbnxxymeumycrhqv.supabase.co"
> export SB_KEY="<anon_ou_service_role_key>"   # ne pas committer
> ```

---

## 1. Vérifications de santé (curl)

### Orchestrateur — état de la file
```bash
curl -s "$SB_URL/functions/v1/runtime-discovery/status" \
  -H "Authorization: Bearer $SB_KEY" | jq .
# attendu : { role:"orchestrator", queued, running, dead_letter, agents, routing, stop_reasons }
```

### Bridge — traiter un batch de jobs
```bash
curl -s "$SB_URL/functions/v1/runtime-agentic-bridge?batch_size=8" \
  -H "Authorization: Bearer $SB_KEY" | jq .
# attendu : { ok:true, processed:<n> } ou { ok:true, processed:0, note:"no queued jobs" }
```

### Watcher on-chain — scanner les 4 chaînes
```bash
# Toutes les chaînes actives :
curl -s "$SB_URL/functions/v1/runtime-onchain-watcher" \
  -H "Authorization: Bearer $SB_KEY" | jq .
# Une seule chaîne (ex. polygon) :
curl -s "$SB_URL/functions/v1/runtime-onchain-watcher?chain=polygon" \
  -H "Authorization: Bearer $SB_KEY" | jq .
# attendu : { ok:true, scanned_chains, total_inserted, total_matched, results:[...] }
```

### Scout — déclencher la découverte d'opportunités
```bash
curl -s "$SB_URL/functions/v1/runtime-opportunity-scout" \
  -H "Authorization: Bearer $SB_KEY" | jq .
# attendu : { ok:true, sources:[{name,fetched,inserted,skipped}], total_inserted }
```

---

## 2. Requêtes SQL de santé

À exécuter dans Supabase → SQL Editor (ou via `psql` sur `SUPABASE_DB_URL`).

### File de jobs
```sql
SELECT status, count(*)
FROM runtime_jobs
GROUP BY status
ORDER BY status;
```

```sql
-- Jobs récents et leur source
SELECT task_id, task_kind, status, created_at
FROM runtime_jobs
ORDER BY created_at DESC
LIMIT 20;
```

```sql
-- Jobs bloqués / en lettre morte
SELECT count(*) FILTER (WHERE status = 'running')      AS running,
       count(*) FILTER (WHERE status = 'dead_letter')  AS dead_letter,
       count(*) FILTER (WHERE status = 'queued')       AS queued
FROM runtime_jobs;
```

### Paiements
```sql
-- USDC réellement détecté on-chain
SELECT network, count(*) AS payments, coalesce(sum(amount_usd),0) AS total_usd
FROM onchain_payments
GROUP BY network
ORDER BY network;
```

```sql
-- Intents et leur rapprochement
SELECT status, count(*)
FROM payment_intents
GROUP BY status;
```

```sql
-- Progression du scan par chaîne
SELECT id, network, active, last_scanned_block, last_scan_at
FROM payment_chains
ORDER BY id;
```

### Coûts réels (honnêteté)
```sql
SELECT connector,
       count(*)                       AS calls,
       sum(cost_cents)/100.0          AS cost_usd
FROM runtime_external_calls
GROUP BY connector
ORDER BY cost_usd DESC;
```

---

## 3. Gestion des crons (pg_cron)

### Lister tous les crons
```sql
SELECT jobid, schedule, active, command
FROM cron.job
ORDER BY jobid;
```

### Réactiver un cron désactivé
```sql
SELECT cron.alter_job(<jobid>, active := true);
```

### Désactiver un cron
```sql
SELECT cron.alter_job(<jobid>, active := false);
```

### Crons actifs attendus (légitimes)
| jobid | rôle | planning |
|------:|------|----------|
| 3   | bootstrap_engine | `*/2 * * * *` |
| 15  | federation_burst (réécrit, sans bruit auto-référentiel) | `*/2 * * * *` |
| 103 | hourly_commission_report | `0 * * * *` |
| 111 | runtime-auto-executor/run | `*/10 * * * *` |
| 116 | runtime-discovery | `*/15 * * * *` |
| 135 | runtime-agentic-bridge?batch_size=8 | `*/5 * * * *` |
| 139 | send_telegram_system_report | `*/5 * * * *` |
| 141 | runtime-onchain-watcher | `*/5 * * * *` |
| 142 | auto_close_stuck_faults | `*/5 * * * *` |

> Note : si un cron de scout doit être planifié, l'ajouter de la même manière
> (ex. `*/15 * * * *`) pointant vers `runtime-opportunity-scout`.

### Crons désactivés (bruit neutralisé — à NE PAS réactiver sans raison)
jobids : `94, 109, 93, 89, 140, 113, 143, 131, 134, 132, 108, 133, 101, 121, 120,
128, 117, 118, 119, 127, 126`.

Ces crons généraient du bruit auto-référentiel / des données fabriquées. La fonction
`open-world-runtime` a été remplacée par un kill-switch inerte (l'original mock est
conservé sous `index.ts.original-mock-disabled` à titre d'archive).

---

## 4. Gérer la clé Claude (`ANTHROPIC_API_KEY`)

La clé alimente l'intelligence réelle d'exécution. Elle se configure dans les secrets
des Edge Functions Supabase.

### Ajouter / corriger la clé (CLI Supabase)
```bash
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..." \
  --project-ref kjtirbnxxymeumycrhqv
```

### Vérifier les secrets présents (les valeurs ne sont pas affichées)
```bash
supabase secrets list --project-ref kjtirbnxxymeumycrhqv
```

### Via le dashboard
Supabase → Settings → Edge Functions → Secrets → ajouter/éditer `ANTHROPIC_API_KEY`.

Après modification d'un secret, redéployer ou attendre le prochain démarrage à froid
des fonctions concernées pour que la nouvelle valeur soit prise en compte.

---

## 5. Limite RPC Polygon (rappel)

Le RPC public Polygon plafonne `eth_getLogs` à ~50 blocs. Si la couverture est
ré-élargie, la fenêtre de scan Polygon doit rester petite (≈45 blocs) alors que les
autres chaînes peuvent utiliser ≈800. Dans le code actuel
(`runtime-onchain-watcher`), la constante globale est `MAX_BLOCK_RANGE = 800` :
pour réintroduire une fenêtre par chaîne, remplacer cette constante par une table
`CHAIN_BLOCK_RANGE` (Polygon=45, autres=800) avant le calcul `to = min(latest,
from + range)`. **Ne pas modifier la logique sans test on-chain réel.**

---

## 6. Déployer une Edge Function

```bash
supabase functions deploy <nom-fonction> --project-ref kjtirbnxxymeumycrhqv
# ex :
supabase functions deploy runtime-opportunity-scout --project-ref kjtirbnxxymeumycrhqv
```
