#!/usr/bin/env python3
"""
test_algora_scout.py - Unit and Integration Tests for Algora Scout Integration
"""
import json
import os
import sqlite3
import tempfile
import unittest
from algora_scout import init_db, compute_task_id, extract_reward_usd, scout_algora_jobs

class TestAlgoraScout(unittest.TestCase):
    def setUp(self):
        self.conn = init_db(":memory:")
        self.fixture_path = os.path.join(os.path.dirname(__file__), "sample_algora_api_response.json")
        with open(self.fixture_path, "r", encoding="utf-8") as f:
            self.raw_data = json.load(f)

    def tearDown(self):
        self.conn.close()

    def test_task_id_deterministic(self):
        url = "https://github.com/Nexussyn/ai-growth-platform/issues/4"
        id1 = compute_task_id(url)
        id2 = compute_task_id(url + " ")
        self.assertEqual(id1, id2)
        self.assertEqual(len(id1), 40) # SHA-1 hex digest length

    def test_reward_extraction(self):
        # Float amount
        self.assertEqual(extract_reward_usd({"reward_amount": 50.0}), 50.0)
        # Formatted string
        self.assertEqual(extract_reward_usd({"reward_formatted": "$250"}), 250.0)
        self.assertEqual(extract_reward_usd({"reward": "150 USDC"}), 150.0)
        # Null/invalid
        self.assertIsNone(extract_reward_usd({}))
        self.assertIsNone(extract_reward_usd({"reward": "TBD / unpriced"}))

    def test_idempotency_and_insertion(self):
        # First run: should insert all 10 items
        inserted1, total1 = scout_algora_jobs(self.conn, self.raw_data)
        self.assertEqual(total1, 10)
        self.assertEqual(inserted1, 10)

        # Check records in SQLite
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(*) FROM runtime_jobs WHERE source = 'algora'")
        count = cur.fetchone()[0]
        self.assertEqual(count, 10)

        # Second run: duplicate data must insert 0 new records (idempotent)
        inserted2, total2 = scout_algora_jobs(self.conn, self.raw_data)
        self.assertEqual(total2, 10)
        self.assertEqual(inserted2, 0, "Idempotency violated: duplicate rows inserted!")

        # Final count must remain 10
        cur.execute("SELECT COUNT(*) FROM runtime_jobs WHERE source = 'algora'")
        self.assertEqual(cur.fetchone()[0], 10)

if __name__ == "__main__":
    unittest.main()
