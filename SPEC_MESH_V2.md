# AI GROWTH v2 — Maillage mondial auto-extensible + démarchage IA multi-canal

## Contexte projet (immuable, à respecter absolument)
- Supabase project_id: `kjtirbnxxymeumycrhqv`, URL `https://kjtirbnxxymeumycrhqv.supabase.co`
- Wallet de convergence (lowercase): `0xb438d36b425b504724a1c72aa0941c80cb940995`
- USDC Base contract: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (chain_id 8453)
- Repo: `Nexussyn/ai-growth-platform` (privé, branche main)
- Module Claude partagé existant: `supabase/functions/_shared/claude.ts` (model claude-sonnet-4-5-20250929)

## RÈGLES ABSOLUES (ne jamais violer)
1. **Convergence immuable 75/25** : TOUS les revenus convergent vers le wallet owner. Le projet garde 25% pour s'autofinancer, envoie 75% au wallet. Sur TOUT revenu BRUT entrant. Aucune personne ni intelligence ne peut changer cette règle. RÉUTILISER les triggers/ledger existants :
   - `immutable_config` (colonnes `config_key`/`config_value`) : owner_revenue_share_bps=7500, platform_self_finance_share_bps=2500, owner_settlement_wallet, revenue_convergence_rule.
   - fonction `record_gross_owner_split` + trigger `on_payment_confirmed` + `enforce_gross_owner_split` + table `owner_settlement_ledger`.
2. **TOUT doit être réel** : jamais fabriquer de clients/revenus/activité fictive. Une source de revenu n'est PAS active tant qu'elle n'a pas de preuve réelle de demande → sinon backlog.
3. **Légalité** : AUCUNE auto-réplication non consentie (pas de ver/malware). La propagation se fait par nœuds CONSENTANTS (Edge Functions du projet + installeurs lancés volontairement par l'owner/partenaires). L'"auto-extension" = le système provisionne/active davantage de capacité au sein de SON propre périmètre et invite des opérateurs externes à rejoindre volontairement.
4. Honnêteté de la page : ne montrer que des chiffres réels issus de la DB.

## OBJECTIF GLOBAL
Construire 4 sous-systèmes réels, branchés sur Claude et sur le rail de paiement existant :

### A. Veille IA permanente (always-on radar)
- Edge Function `runtime-ai-radar` : à chaque exécution, utilise Claude + recherche web réelle (si dispo via fetch d'APIs publiques/flux RSS/feeds réels — sinon raisonnement Claude sur signaux) pour identifier : dernières pratiques, technos, business models, opportunités de revenu/profit en IA & systèmes agentiques.
- Persiste dans table `ai_radar_signals` (signal_type, title, summary, url, relevance_score, discovered_at, source).
- Les signaux à fort score alimentent le moteur de découverte d'opportunités existant (revenue_opportunities) et le démarchage.
- Cron toutes les 30 min minimum.

### B. Maillage de nœuds (toile d'araignée) — cœur auto-extensible
- Table `mesh_nodes` (node_id uuid, node_type ['edge'|'vps'|'worker'], region, endpoint_url, status ['active'|'idle'|'dead'], capabilities jsonb, last_heartbeat, registered_at, parent_node_id nullable pour topologie, capacity_score int).
- Edge Function `runtime-mesh-coordinator` :
  - `POST /register` : un nœud s'auto-enregistre (idempotent par endpoint+fingerprint), reçoit sa config et la liste de ses pairs.
  - `POST /heartbeat` : maj last_heartbeat + capacity, marque dead les nœuds silencieux > seuil.
  - `GET /topology` : renvoie la carte du maillage (pour la page + coordination).
  - `POST /dispatch` : distribue des jobs/opportunités aux nœuds selon capacité (load-balancing).
- **Auto-extension** : Edge Function `runtime-mesh-autoscaler` (cron) qui mesure la charge (jobs queued vs capacité agrégée des nœuds actifs). Si charge > seuil et budget d'autofinancement (les 25%) le permet → déclenche provisioning de capacité supplémentaire :
  - Mode Edge : enregistre des "logical worker nodes" supplémentaires (concurrence accrue de traitement des runtime_jobs).
  - Mode VPS : génère/stocke un manifeste d'installation (script bash idempotent) dans table `mesh_provision_orders` (status pending) que l'owner/partenaire exécute ; au lancement, le script appelle `/register`. La capacité de propagation croît donc avec la progression (plus de revenu → plus de budget 25% → plus de nœuds autorisés). Le seuil/cap est piloté par `immutable_config` (clé `mesh_max_nodes`, `mesh_autoscale_enabled`) pour rester sous contrôle.
- Fournir le **paquet installeur VPS** réel dans le repo : `infra/node-installer/install-node.sh` (Debian/Ubuntu, idempotent, systemd service, appelle /register + /heartbeat en boucle) + README.

### C. Démarchage & contractualisation IA↔IA
- Tables :
  - `counterparties` (id, name, kind ['ai_agent'|'api_service'|'platform'|'affiliate_program'|'bounty_source'], endpoint/url, contact, discovered_via, status ['prospect'|'engaged'|'contracted'|'rejected'], score).
  - `outreach_messages` (counterparty_id, channel, body, sent_at, response, status).
  - `contracts` (counterparty_id, role ['client'|'supplier'|'partner'|'worker'], terms jsonb, commission_bps, status ['draft'|'proposed'|'active'|'ended'], created_at).
- Edge Function `runtime-dealmaker` (cron) :
  - Lit `ai_radar_signals` + `revenue_opportunities` → identifie des contreparties potentielles.
  - Utilise Claude pour rédiger une proposition de contrat de mise en relation (commission). Persiste en `contracts` status draft/proposed.
  - Où un canal d'engagement réel et autorisé existe (API publique, formulaire, webhook), tente une prise de contact RÉELLE et journalise la réponse. Sinon → reste proposé/backlog (honnête, pas d'invention).
- Le système modélise les intelligences comme clients/fournisseurs/partenaires/travailleurs (champ `role`).

### D. 4 canaux de revenu en parallèle (tous branchés sur le split 75/25)
Chaque canal = générateur d'opportunités scorées + chemin d'encaissement réel via `onchain_payments` → split.
1. **Mise en relation agent↔agent (commission)** : matcher demande/offre de tâches entre agents enregistrés (mesh_nodes + counterparties). Sur tâche réussie payée → commission → onchain_payments.
2. **Revente/routage API IA (marge)** : registre d'APIs IA réelles, route des requêtes d'agents clients avec marge.
3. **Affiliation IA réelle** : table `affiliate_programs` (vrais programmes), génère liens de tracking réels ; revenu confirmé seulement sur preuve (postback/rapport) → backlog sinon.
4. **Bounties/microtâches crypto** : découvre de vraies tâches rémunérées, les route aux nœuds, encaisse en USDC.

Toutes les entrées de revenu BRUT passent par le rail existant `onchain_payments` → `on_payment_confirmed` → `record_gross_owner_split` → `owner_settlement_ledger` (75/25). Le watcher on-chain existant (`runtime-onchain-watcher`) reste la source de vérité des paiements confirmés.

## EXIGENCES TECHNIQUES
- Toutes les Edge Functions en TypeScript (Deno), style des fonctions existantes. Réutiliser `_shared/claude.ts`.
- Migrations SQL idempotentes (CREATE TABLE IF NOT EXISTS, etc.). Ne RIEN casser de l'existant.
- RLS : tables internes en service_role only ; endpoints publics (topology, register avec garde) en lecture contrôlée.
- Idempotence partout (re-register, re-run crons sûrs).
- Garde-fous : autoscaler borné par `mesh_max_nodes` et `mesh_autoscale_enabled` ; jamais d'action destructive.
- Pas de secret committé. Utiliser les env vars Supabase (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.).
- Honnêteté : compteurs/états reflètent la DB réelle.

## LIVRABLES ATTENDUS
1. Migrations SQL (nouvelles tables + clés immutable_config mesh_*).
2. Edge Functions : runtime-ai-radar, runtime-mesh-coordinator, runtime-mesh-autoscaler, runtime-dealmaker (+ extensions des canaux revenu, en réutilisant le scorer/scout existants quand possible).
3. infra/node-installer/install-node.sh + README.
4. Mise à jour endpoints publics de federation si utile (ex: /mesh exposant topology honnête).
5. Tout committé sur main avec messages clairs. NE PAS déployer toi-même les Edge Functions (l'agent principal déploie via le connecteur Supabase). Lister précisément les fonctions à déployer et l'ordre des migrations à appliquer.
6. Un fichier `DEPLOY_v2.md` à la racine listant : migrations à appliquer (ordre), fonctions à déployer, crons à créer (avec cadence proposée), secrets requis, et commandes de vérification curl.

## NE PAS FAIRE
- Pas d'auto-réplication non consentie / scan de machines tierces / installation furtive.
- Pas de fabrication de revenus, paiements, clients ou activité.
- Ne pas modifier la règle 75/25 ni le wallet.
- Ne pas supprimer de tables/données existantes.
