import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { toMarkdown } from '@/report/markdown-exporter';
import { toJson } from '@/report/json-exporter';
import type { ReportData, LoomScript } from '@/scrapers/types';

function parseLoomScript(raw: string | null): LoomScript {
  const empty: LoomScript = {
    wordCount: 0,
    estimatedDuration: 0,
    subjectLine: '',
    sections: { hook: '', observation: '', insight: '', pitch: '', cta: '' },
    fullScript: '',
  };

  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as LoomScript;
    if (parsed.sections && parsed.fullScript) return parsed;
  } catch {
    // Legacy plain text
  }

  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  return {
    wordCount,
    estimatedDuration: wordCount / 2.5,
    subjectLine: '',
    sections: { hook: '', observation: '', insight: '', pitch: '', cta: '' },
    fullScript: raw,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const supabase = createServiceRoleClient();
  const { reportId } = params;
  const format = request.nextUrl.searchParams.get('format') ?? 'json';

  if (format !== 'json' && format !== 'markdown') {
    return NextResponse.json({ error: 'Invalid format. Use json or markdown.' }, { status: 400 });
  }

  const { data: report, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const reportData: ReportData = {
    id: report.id,
    jobId: report.job_id,
    businessName: report.business_name,
    websiteUrl: report.website_url,
    createdAt: report.created_at,
    businessInfo: report.business_info ?? { businessName: null, phone: null, email: null, address: null, city: null, state: null, hasContactForm: false, hasBookingSystem: false, bookingPlatform: null, googleMapsUrl: null, description: null, industry: null, errors: [] },
    socialMedia: report.social_media ?? { profiles: [], errors: [] },
    techStack: report.tech_stack ?? { technologies: [], hasWordpress: false, hasShopify: false, hasWebflow: false, hasCRM: false, crmName: null, hasEmailTool: false, emailToolName: null, hasPixel: false, pixelTypes: [], errors: [] },
    adsIntelligence: report.ads_intelligence ?? { metaAds: [], tiktokAds: [], googleAds: [], totalActiveAds: 0, oldestAdStartDate: null, errors: [] },
    adMetrics: report.ad_metrics ?? { metrics: [], summary: { provenAdCount: 0, avgLongevityDays: 0, topPlatform: null }, errors: [] },
    funnelData: report.funnel_data ?? { funnelScore: 0, elements: [], crawledPages: 0, hasLandingPage: false, hasLeadMagnet: false, hasEmailCapture: false, hasBooking: false, errors: [] },
    seoTraffic: report.seo_traffic ?? { indexedPageCount: null, hasBlog: false, blogUrl: null, metaTitle: null, metaDescription: null, h1: null, topKeywords: [], isRunningPaidSearch: false, errors: [] },
    opportunities: report.opportunities ?? { businessSummary: '', overallScore: 0, opportunities: [], strengths: [], gaps: [] },
    loomScript: parseLoomScript(report.loom_script),
  };

  if (format === 'markdown') {
    const md = toMarkdown(reportData);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="report-${reportId}.md"`,
      },
    });
  }

  const json = toJson(reportData);
  return new NextResponse(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="report-${reportId}.json"`,
    },
  });
}
