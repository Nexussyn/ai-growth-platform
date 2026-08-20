#!/usr/bin/env python3
"""
algora_scout.py - Algora Bounty Integration for runtime-opportunity-scout

Features:
1. Fetches or parses Algora bounties from API/fixtures.
2. Extracts clean structured data (title, url, reward_usd, tech_stack).
3. Inserts into SQLite `runtime_jobs` table idempotently using SHA-1 hash of URL.
4. Ensures real reward_usd parsing (float) or None/null if missing.
"""
import hashlib
import json
import os
import sqlite3
import sys
import urllib.request
import re

ALGORA_API_URL = "https://algora.io/api/bounties?status=open&limit=50"

def init_db(db_path=":memory:"):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS runtime_jobs (
            task_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT UNIQUE NOT NULL,
            reward_usd REAL,
            tech_stack TEXT,
            source TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn

def compute_task_id(url: str) -> str:
    """Idempotent SHA-1 hash of canonical bounty URL."""
    return hashlib.sha1(url.strip().encode("utf-8")).hexdigest()

def extract_reward_usd(item: dict):
    """
    Extracts numeric reward in USD/USDC. Returns float or None.
    Never invents a number.
    """
    if "reward_amount" in item and isinstance(item["reward_amount"], (int, float)):
        return float(item["reward_amount"])
    
    # Try parsing reward_formatted string (e.g. '$150', '200 USDC')
    reward_str = str(item.get("reward_formatted", "") or item.get("reward", ""))
    match = re.search(r'\$?\s*([0-9]+(?:\.[0-9]+)?)', reward_str)
    if match:
        try:
            val = float(match.group(1))
            if val > 0:
                return val
        except ValueError:
            pass
    return None

def fetch_algora_bounties(fallback_file=None):
    """Fetches bounties from live Algora API or fallback fixture."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    try:
        req = urllib.request.Request(ALGORA_API_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "bounties" in data:
                return data["bounties"]
    except Exception:
        pass

    # Use fallback fixture if available
    if fallback_file and os.path.exists(fallback_file):
        with open(fallback_file, "r", encoding="utf-8") as f:
            return json.load(f)
    
    return []

def scout_algora_jobs(db_conn, raw_bounties):
    """
    Parses and stores bounties idempotently into database.
    Returns (inserted_count, total_processed).
    """
    cur = db_conn.cursor()
    inserted = 0
    total = 0

    for item in raw_bounties:
        url = item.get("url") or item.get("html_url")
        title = item.get("title")
        if not url or not title:
            continue

        total += 1
        task_id = compute_task_id(url)
        reward_usd = extract_reward_usd(item)
        tags = item.get("tags") or item.get("labels") or []
        tech_stack = ", ".join(tags) if isinstance(tags, list) else str(tags)

        try:
            cur.execute("""
                INSERT OR IGNORE INTO runtime_jobs (task_id, title, url, reward_usd, tech_stack, source)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (task_id, title, url, reward_usd, tech_stack, "algora"))
            if cur.rowcount > 0:
                inserted += 1
        except Exception as e:
            print(f"Error inserting {task_id}: {e}", file=sys.stderr)

    db_conn.commit()
    return inserted, total

def main():
    fixture_path = os.path.join(os.path.dirname(__file__), "sample_algora_api_response.json")
    bounties = fetch_algora_bounties(fallback_file=fixture_path)
    print(f"Fetched {len(bounties)} Algora bounties.")

    db_path = "/root/runtime_jobs.db"
    conn = init_db(db_path)
    inserted, total = scout_algora_jobs(conn, bounties)
    print(f"Processed {total} items. Inserted {inserted} new records into {db_path}.")
    conn.close()

if __name__ == "__main__":
    main()
