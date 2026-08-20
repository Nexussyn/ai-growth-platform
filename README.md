# Algora Bounty Discovery for runtime-opportunity-scout ($3 USDC Bounty Solution)

Adds seamless Algora bounty integration to `runtime-opportunity-scout`.

## Features
- 🌐 **Algora API Integration**: Scrapes and parses open bounties from `https://algora.io/api/bounties?status=open&limit=50`.
- 🔒 **Deterministic Idempotency**: Employs SHA-1 hashing over canonical URLs for primary keys in `runtime_jobs`. Duplicate runs produce 0 duplicate records.
- 💰 **Zero Invention Rule**: Strictly extracts real numerical reward floats or assigns `null` if unpriced.
- 📦 **Proof Included**: Includes `sample_algora_api_response.json` with 10 real sample bounties.

## Usage
```bash
python3 algora_scout.py
```

## Running Tests
```bash
python3 test_algora_scout.py
```
All tests pass with 100% verification.
