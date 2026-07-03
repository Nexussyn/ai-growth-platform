# Secrets GitHub requis pour les workflows Supabase

Va dans : **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Où le trouver | Rôle |
|---|---|---|
| `SUPABASE_URL` | Dashboard Supabase → Settings → API → Project URL | URL de base de l'API |
| `SUPABASE_ANON_KEY` | Dashboard Supabase → Settings → API → `anon` `public` | Keep-alive (lecture seule) |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard Supabase → Settings → API → `service_role` | Purge des logs (écriture) |

## ⚠️ Sécurité
- Ne jamais committer ces clés dans le code
- `SERVICE_ROLE_KEY` bypass le RLS — ne l'exposer que dans les secrets GitHub
- Le workflow `purge-logs` tourne uniquement via GitHub Actions (serveur sécurisé)

## Tester manuellement
GitHub → Actions → **Supabase Keep-Alive & Log Purge** → **Run workflow**
