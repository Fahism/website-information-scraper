CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  agency_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE job_status AS ENUM ('queued', 'running', 'completed', 'failed');

CREATE TABLE public.research_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_type    TEXT NOT NULL CHECK (input_type IN ('url', 'name_location')),
  raw_input     TEXT NOT NULL,
  resolved_url  TEXT,
  status        job_status NOT NULL DEFAULT 'queued',
  progress      SMALLINT DEFAULT 0,
  current_step  TEXT,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name    TEXT,
  website_url      TEXT,
  business_info    JSONB,
  social_media     JSONB,
  tech_stack       JSONB,
  ads_intelligence JSONB,
  funnel_data      JSONB,
  seo_traffic      JSONB,
  ad_metrics       JSONB,
  opportunities    JSONB,
  loom_script      TEXT,
  markdown_export  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
