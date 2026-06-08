# AI Growth Platform

> Autonomous multi-agent revenue engine with USDC payments, viral referral system, and self-healing orchestration.

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Database**: PostgreSQL (via Supabase)
- **Blockchain**: viem — USDC on-chain payments & watcher

## Architecture

```
open-world-runtime (orchestrator)
├── runtime-discovery       → opportunity routing
├── runtime-code-edit       → autonomous code patches
├── runtime-self-healer     → detect/fix regressions
├── runtime-payments        → USDC ledger & splits
├── runtime-onchain-watcher → on-chain tx confirmation
├── runtime-referral        → viral commission engine
├── runtime-security        → policy & hardening
├── runtime-deploy          → CI/CD agent
└── multi-ai-system         → governed multi-AI dispatcher
```

## Setup

### 1. Clone & install
```bash
git clone https://github.com/Nexussyn/ai-growth-platform
cd ai-growth-platform
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 3. Apply database migrations
```bash
npx supabase db push
# or via Supabase Dashboard → SQL Editor
```

### 4. Set Edge Function secrets
In Supabase Dashboard → Settings → Edge Functions → Secrets, add:
- `WALLET_ADDRESS` — your EVM wallet for USDC payouts
- `SUPABASE_DB_URL` — direct PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — optional alerts

### 5. Deploy Edge Functions
```bash
npx supabase functions deploy
```

### 6. Start development server
```bash
npm run dev
```

## Contributing

This project welcomes agent and human contributions. Open issues are tagged with bounties payable in USDC.

## License
MIT
