import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

// Tracking parameters added by ad platforms — strip these so the scraper
// always hits the clean canonical URL, not a session-specific ad redirect.
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'msclkid', 'twclid', 'ttclid', 'li_fat_id',
  'mc_cid', 'mc_eid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  '_ga', '_gl', 'ref', 'source', 'affiliate',
]);

function cleanUrl(raw: string): string | null {
  try {
    const input = raw.trim();
    // Add protocol if missing
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const parsed = new URL(withProtocol);

    // Strip tracking query params
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    // Remove fragment (#section) — not useful for scraping
    parsed.hash = '';

    // Return clean URL, preserving any legitimate query params
    return parsed.toString();
  } catch {
    return null;
  }
}

export const maxDuration = 300; // 5 minutes for Vercel Fluid Compute
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const [{ runOrchestrator }, { buildReport }] = await Promise.all([
    import('@/scrapers'),
    import('@/report/builder'),
  ]);

  const supabase = createServiceRoleClient();

  const userId = process.env.ADMIN_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.url !== 'string' || !body.url.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // Clean the URL — strip tracking params, ensure protocol, remove fragments
  const url = cleanUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Create research job
  const { data: job, error: jobError } = await supabase
    .from('research_jobs')
    .insert({
      user_id: userId,
      input_type: 'url',
      raw_input: url,
      status: 'queued',
      progress: 0,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Fire-and-forget orchestration using waitUntil if available
  const runJob = async () => {
    try {
      // Mark as running
      await supabase
        .from('research_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', job.id);

      // Create initial report record
      const { data: reportRecord } = await supabase
        .from('reports')
        .insert({ job_id: job.id, user_id: userId, website_url: url })
        .select()
        .single();

      if (!reportRecord?.id) {
        throw new Error('Failed to create report record.');
      }

      const reportId = reportRecord.id;

      // Run orchestrator with progress callbacks
      const reportData = await runOrchestrator(url, job.id, userId, {
        onProgress: async (progress, step) => {
          await supabase
            .from('research_jobs')
            .update({ progress, current_step: step })
            .eq('id', job.id);
        },
        onPartialResult: async (key, data) => {
          if (reportId) {
            await supabase
              .from('reports')
              .update({ [key]: data, updated_at: new Date().toISOString() })
              .eq('id', reportId);
          }
        },
      });

      // Run AI enrichment with progress callbacks
      const finalReport = await buildReport(reportData, async (progress, step) => {
        await supabase
          .from('research_jobs')
          .update({ progress, current_step: step })
          .eq('id', job.id);
      });

      // Save final report
      if (reportId) {
        await supabase
          .from('reports')
          .update({
            business_name: finalReport.businessName,
            website_url: finalReport.websiteUrl,
            business_info: finalReport.businessInfo,
            social_media: finalReport.socialMedia,
            tech_stack: finalReport.techStack,
            ads_intelligence: finalReport.adsIntelligence,
            funnel_data: finalReport.funnelData,
            seo_traffic: finalReport.seoTraffic,
            ad_metrics: finalReport.adMetrics,
            opportunities: finalReport.opportunities,
            loom_script: JSON.stringify(finalReport.loomScript),
            updated_at: new Date().toISOString(),
          })
          .eq('id', reportId);
      }

      // Mark job complete
      await supabase
        .from('research_jobs')
        .update({
          status: 'completed',
          progress: 100,
          current_step: 'Complete',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    } catch (err) {
      await supabase
        .from('research_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', job.id);
    }
  };

  // Use waitUntil for Vercel Fluid Compute if available
  const gThis = globalThis as unknown as Record<string, unknown>;
  if (typeof gThis.waitUntil === 'function') {
    (gThis.waitUntil as (p: Promise<unknown>) => void)(runJob());
  } else {
    // In development, run in background without blocking
    runJob().catch(() => {});
  }

  return NextResponse.json({ jobId: job.id });
}
