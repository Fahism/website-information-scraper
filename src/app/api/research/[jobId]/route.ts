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
    .select('id, status, progress, current_step, error_message, completed_at')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
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
