import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createServiceRoleClient();
  const { jobId } = params;

  const { data: job, error } = await supabase
    .from('research_jobs')
    .select('id, status, progress, current_step, error_message, completed_at, started_at')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Auto-recover stuck jobs: if a job has been "running" for more than 10 minutes
  // it means the server process was killed mid-job (e.g. dev server restart).
  // Mark it failed so the UI doesn't spin forever and the user can start a new job.
  if (job.status === 'running' && job.started_at) {
    const runningForMs = Date.now() - new Date(job.started_at).getTime();
    if (runningForMs > 10 * 60 * 1000) {
      await supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: 'Research timed out — the server was likely restarted mid-job. Please start a new research.',
        })
        .eq('id', jobId);
      job.status = 'failed';
      job.error_message = 'Research timed out — the server was likely restarted mid-job. Please start a new research.';
    }
  }

  // If completed, find the associated report
  let reportId: string | null = null;
  if (job.status === 'completed') {
    const { data: report } = await supabase
      .from('reports')
      .select('id')
      .eq('job_id', jobId)
      .single();
    reportId = report?.id ?? null;
  }

  return NextResponse.json({
    status: job.status,
    progress: job.progress,
    currentStep: job.current_step,
    error: job.error_message,
    reportId,
  });
}
