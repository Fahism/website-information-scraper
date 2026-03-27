-- Performance indexes
CREATE INDEX idx_research_jobs_user_id ON public.research_jobs(user_id);
CREATE INDEX idx_research_jobs_status ON public.research_jobs(status);
CREATE INDEX idx_research_jobs_created_at ON public.research_jobs(created_at DESC);
CREATE INDEX idx_reports_user_id ON public.reports(user_id);
CREATE INDEX idx_reports_job_id ON public.reports(job_id);
CREATE INDEX idx_reports_created_at ON public.reports(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
