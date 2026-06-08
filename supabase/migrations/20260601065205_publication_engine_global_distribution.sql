/*
  # Publication Engine & Global Distribution

  1. New Tables
    - `publications` - scheduled auto-published announcements
      - `id` (uuid, primary key)
      - `publication_type` (text) - announcement, changelog, status_snapshot, capability_update, discovery_refresh
      - `title` (text) - headline
      - `body_en` (text) - English content
      - `body_fr` (text) - French content
      - `links` (jsonb) - demo, manifest, discovery, sandbox, status links
      - `target_channels` (text[]) - where to publish
      - `status` (text) - draft, published, archived
      - `published_at` (timestamptz)
      - `created_at` (timestamptz)

    - `changelog_entries` - public changelog feed
      - `id` (uuid, primary key)
      - `version` (text) - semver
      - `title` (text) - what changed
      - `description` (text) - details
      - `category` (text) - feature, fix, improvement, security, expansion
      - `published_at` (timestamptz)
      - `created_at` (timestamptz)

    - `public_status_snapshots` - periodic public health snapshots
      - `id` (uuid, primary key)
      - `tick` (integer) - orchestrator tick at snapshot time
      - `phase` (text) - current phase
      - `agents_active` (integer)
      - `instances_active` (integer)
      - `settlements` (integer)
      - `revenue_usdc` (numeric)
      - `pending_repairs` (integer)
      - `health` (text) - healthy, degraded, critical
      - `created_at` (timestamptz)

    - `outreach_templates` - forum-ready post templates
      - `id` (uuid, primary key)
      - `platform` (text) - reddit, replit, x, linkedin, marketplace
      - `template_en` (text) - English template
      - `template_fr` (text) - French template
      - `last_generated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - All tables RLS enabled
    - Service role write
    - Anon read for published content
*/

CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_type text NOT NULL DEFAULT 'announcement',
  title text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  body_fr text NOT NULL DEFAULT '',
  links jsonb DEFAULT '{}',
  target_channels text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages publications"
  ON publications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read published publications"
  ON publications FOR SELECT
  TO anon
  USING (status = 'published');

CREATE TABLE IF NOT EXISTS changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL DEFAULT '1.0.0',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'improvement',
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages changelog"
  ON changelog_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read changelog"
  ON changelog_entries FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS public_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tick integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'INIT',
  agents_active integer DEFAULT 0,
  instances_active integer DEFAULT 0,
  settlements integer DEFAULT 0,
  revenue_usdc numeric DEFAULT 0,
  pending_repairs integer DEFAULT 0,
  health text NOT NULL DEFAULT 'healthy',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public_status_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages status snapshots"
  ON public_status_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read status snapshots"
  ON public_status_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS outreach_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'reddit',
  template_en text NOT NULL DEFAULT '',
  template_fr text NOT NULL DEFAULT '',
  last_generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE outreach_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages outreach templates"
  ON outreach_templates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read outreach templates"
  ON outreach_templates FOR SELECT
  TO anon
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_type ON publications(publication_type);
CREATE INDEX IF NOT EXISTS idx_changelog_published ON changelog_entries(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_snapshots_created ON public_status_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_platform ON outreach_templates(platform);

-- Register scheduled jobs for publication engine
INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('publication_job', '0 */6 * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('discovery_refresh', '0 */12 * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('capability_indexer', '0 */12 * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('agent_outreach_job', '0 0 * * *', true, 30000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('changelog_generator', '0 0 * * *', true, 20000, 2)
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, cron_expression, enabled, timeout_ms, max_retries)
VALUES ('public_status_snapshot', '*/15 * * * *', true, 10000, 2)
ON CONFLICT (job_name) DO NOTHING;
