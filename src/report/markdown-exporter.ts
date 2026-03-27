import type { ReportData } from '@/scrapers/types';

export function toMarkdown(report: ReportData): string {
  const lines: string[] = [];

  lines.push(`# Business Intelligence Report: ${report.businessName ?? report.websiteUrl}`);
  lines.push(`\n*Generated: ${new Date(report.createdAt).toLocaleDateString()}*\n`);
  lines.push(`**Website:** ${report.websiteUrl}`);

  if (report.opportunities.businessSummary) {
    lines.push(`\n**Summary:** ${report.opportunities.businessSummary}`);
    lines.push(`\n**Marketing Score:** ${report.opportunities.overallScore}/100`);
  }

  // Business Info
  lines.push('\n## Business Information\n');
  const bi = report.businessInfo;
  if (bi.phone) lines.push(`- **Phone:** ${bi.phone}`);
  if (bi.email) lines.push(`- **Email:** ${bi.email}`);
  if (bi.address) lines.push(`- **Address:** ${bi.address}`);
  if (bi.industry) lines.push(`- **Industry:** ${bi.industry}`);
  if (bi.hasBookingSystem) lines.push(`- **Booking System:** ${bi.bookingPlatform ?? 'yes'}`);
  lines.push(`- **Contact Form:** ${bi.hasContactForm ? 'yes' : 'no'}`);

  // Social Media
  lines.push('\n## Social Media\n');
  if (report.socialMedia.profiles.length === 0) {
    lines.push('No social profiles found.\n');
  } else {
    for (const p of report.socialMedia.profiles) {
      lines.push(`### ${p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}`);
      lines.push(`- **URL:** ${p.url}`);
      if (p.followers !== null) lines.push(`- **Followers:** ${p.followers.toLocaleString()}`);
      if (p.bio) lines.push(`- **Bio:** ${p.bio.slice(0, 200)}`);
      lines.push('');
    }
  }

  // Tech Stack
  lines.push('\n## Tech Stack\n');
  const techs = report.techStack.technologies;
  if (techs.length === 0) {
    lines.push('No technologies detected.\n');
  } else {
    const byCategory: Record<string, string[]> = {};
    for (const t of techs) {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(t.name);
    }
    for (const [cat, names] of Object.entries(byCategory)) {
      lines.push(`**${cat.replace('_', ' ')}:** ${names.join(', ')}`);
    }
  }

  // Ads Intelligence
  lines.push('\n## Ads Intelligence\n');
  const ads = report.adsIntelligence;
  lines.push(`- **Total Active Ads:** ${ads.totalActiveAds}`);
  lines.push(`- **Meta Ads:** ${ads.metaAds.length}`);
  lines.push(`- **TikTok Ads:** ${ads.tiktokAds.length}`);
  lines.push(`- **Google Ads:** ${ads.googleAds.length}`);
  if (ads.oldestAdStartDate) lines.push(`- **Running Since:** ${ads.oldestAdStartDate}`);
  lines.push(`- **Proven Ads (60+ days):** ${report.adMetrics.summary.provenAdCount}`);

  // Funnel
  lines.push('\n## Funnel Analysis\n');
  const f = report.funnelData;
  lines.push(`- **Funnel Score:** ${f.funnelScore}/10`);
  lines.push(`- **Landing Pages:** ${f.hasLandingPage ? 'yes' : 'no'}`);
  lines.push(`- **Email Capture:** ${f.hasEmailCapture ? 'yes' : 'no'}`);
  lines.push(`- **Booking Funnel:** ${f.hasBooking ? 'yes' : 'no'}`);
  lines.push(`- **Lead Magnet:** ${f.hasLeadMagnet ? 'yes' : 'no'}`);

  // SEO
  lines.push('\n## SEO & Traffic\n');
  const seo = report.seoTraffic;
  if (seo.indexedPageCount !== null) lines.push(`- **Indexed Pages:** ~${seo.indexedPageCount.toLocaleString()}`);
  if (seo.metaTitle) lines.push(`- **Page Title:** ${seo.metaTitle}`);
  if (seo.h1) lines.push(`- **H1:** ${seo.h1}`);
  lines.push(`- **Has Blog:** ${seo.hasBlog ? 'yes' : 'no'}`);
  lines.push(`- **Running Paid Search:** ${seo.isRunningPaidSearch ? 'yes' : 'no'}`);
  if (seo.topKeywords.length) lines.push(`- **Top Keywords:** ${seo.topKeywords.join(', ')}`);

  // Opportunities
  if (report.opportunities.opportunities.length > 0) {
    lines.push('\n## Marketing Opportunities\n');

    if (report.opportunities.strengths.length) {
      lines.push('**Strengths:**');
      for (const s of report.opportunities.strengths) lines.push(`- ${s}`);
    }

    if (report.opportunities.gaps.length) {
      lines.push('\n**Gaps:**');
      for (const g of report.opportunities.gaps) lines.push(`- ${g}`);
    }

    lines.push('\n**Opportunities:**\n');
    for (const opp of report.opportunities.opportunities) {
      lines.push(`### ${opp.priority.toUpperCase()}: ${opp.category} — ${opp.finding}`);
      lines.push(`\n${opp.recommendation}\n`);
      if (opp.evidence.length) {
        lines.push('*Evidence:* ' + opp.evidence.join(' • '));
      }
      lines.push('');
    }
  }

  // Loom Script
  if (report.loomScript.fullScript) {
    lines.push('\n## Loom Outreach Script\n');
    lines.push(`*${report.loomScript.wordCount} words · ~${Math.round(report.loomScript.estimatedDuration)}s estimated*\n`);

    if (report.loomScript.subjectLine) {
      lines.push(`**Subject Line:** ${report.loomScript.subjectLine}\n`);
    }

    const sectionLabels: { key: keyof typeof report.loomScript.sections; label: string }[] = [
      { key: 'hook', label: 'Hook' },
      { key: 'observation', label: 'Observation' },
      { key: 'insight', label: 'Insight' },
      { key: 'pitch', label: 'Pitch' },
      { key: 'cta', label: 'CTA' },
    ];

    const hasSections = sectionLabels.some(s => report.loomScript.sections[s.key]);

    if (hasSections) {
      for (const { key, label } of sectionLabels) {
        const text = report.loomScript.sections[key];
        if (text) {
          lines.push(`### ${label}\n`);
          lines.push(`${text}\n`);
        }
      }
    } else {
      lines.push('```');
      lines.push(report.loomScript.fullScript);
      lines.push('```');
    }
  }

  return lines.join('\n');
}
