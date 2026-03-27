'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReportData } from '@/scrapers/types';
import SocialMediaCard from './SocialMediaCard';
import TechStackBadges from './TechStackBadges';
import AdsIntelligencePanel from './AdsIntelligencePanel';
import OpportunityList from './OpportunityList';
import LoomScriptPanel from './LoomScriptPanel';

type Section = 'overview' | 'social' | 'tech' | 'ads' | 'funnel' | 'seo' | 'opportunities' | 'loom';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview',      label: 'Overview' },
  { id: 'social',        label: 'Social Media' },
  { id: 'tech',          label: 'Tech Stack' },
  { id: 'ads',           label: 'Ads' },
  { id: 'funnel',        label: 'Funnel' },
  { id: 'seo',           label: 'SEO' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'loom',          label: 'Loom Script' },
];

interface ReportViewerProps {
  report: ReportData;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const router = useRouter();

  const score = report.opportunities.overallScore;
  const scoreColor = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-zinc-100 truncate">
              {report.businessName ?? report.websiteUrl}
            </h1>
            <p className="text-sm text-zinc-500 mt-1 truncate">
              <a
                href={report.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-zinc-300 transition-colors"
                title={report.websiteUrl}
              >
                {(() => {
                  try {
                    const u = new URL(report.websiteUrl);
                    return u.origin + u.pathname;
                  } catch {
                    return report.websiteUrl;
                  }
                })()}
              </a>
              {report.businessInfo.city && ` · ${report.businessInfo.city}, ${report.businessInfo.state}`}
              {report.businessInfo.industry && ` · ${report.businessInfo.industry.replace('_', ' ')}`}
            </p>
          </div>
          {score > 0 && (
            <div className="flex-shrink-0 text-center">
              <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
              <p className="text-xs text-zinc-600">/100</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={() => router.push('/')}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            + New Research
          </button>
          <a
            href={`/api/export/${report.id}?format=markdown`}
            className="text-xs font-medium px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Export Markdown
          </a>
          <a
            href={`/api/export/${report.id}?format=json`}
            className="text-xs font-medium px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Export JSON
          </a>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeSection === s.id
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Desktop: sidebar + content */}
      <div className="hidden lg:grid grid-cols-[200px_1fr] gap-4">
        <div className="space-y-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === s.id
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div>
          <SectionContent section={activeSection} report={report} />
        </div>
      </div>

      {/* Mobile: active section only */}
      <div className="lg:hidden">
        <SectionContent section={activeSection} report={report} />
      </div>
    </div>
  );
}

function SectionContent({ section, report }: { section: Section; report: ReportData }) {
  switch (section) {
    case 'overview':      return <OverviewSection report={report} />;
    case 'social':        return <SocialMediaCard socialMedia={report.socialMedia} />;
    case 'tech':          return <TechStackBadges techStack={report.techStack} />;
    case 'ads':           return <AdsIntelligencePanel adsIntelligence={report.adsIntelligence} adMetrics={report.adMetrics} />;
    case 'funnel':        return <FunnelSection report={report} />;
    case 'seo':           return <SeoSection report={report} />;
    case 'opportunities': return <OpportunityList analysis={report.opportunities} />;
    case 'loom':          return <LoomScriptPanel loomScript={report.loomScript} />;
  }
}

function OverviewSection({ report }: { report: ReportData }) {
  const bi = report.businessInfo;
  const rows = [
    { label: 'Phone',        value: bi.phone },
    { label: 'Email',        value: bi.email },
    { label: 'Address',      value: [bi.address?.replace(/[,\s]+$/, ''), bi.city ? `${bi.city}${bi.state ? `, ${bi.state}` : ''}${bi.zip ? ` ${bi.zip}` : ''}` : null].filter(Boolean).join(', ') || null },
    { label: 'Industry',     value: bi.industry?.replace('_', ' ') },
    { label: 'Booking',      value: bi.hasBookingSystem ? (bi.bookingPlatform ?? 'Yes') : null },
    { label: 'Contact Form', value: bi.hasContactForm ? 'Yes' : 'No' },
  ].filter(r => r.value);

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-medium text-zinc-400">Business Info</h3>
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-sm">
            <span className="text-zinc-600 w-28 flex-shrink-0">{label}</span>
            <span className="text-zinc-300">{value}</span>
          </div>
        ))}
      </div>
      {bi.description && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Description</h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{bi.description.slice(0, 400)}</p>
        </div>
      )}
    </div>
  );
}

const FUNNEL_ELEMENT_META: Record<string, { label: string; icon: string; desc: string; recommendation: string }> = {
  landing_page:  { label: 'Landing Page',         icon: '🎯', desc: 'Dedicated conversion page for campaigns',         recommendation: 'Create targeted landing pages for each service/offer' },
  lead_magnet:   { label: 'Lead Magnet',           icon: '🧲', desc: 'Free resource to capture leads',                  recommendation: 'Offer a free guide, checklist or estimate to collect emails' },
  email_capture: { label: 'Email Capture',         icon: '📧', desc: 'Form to collect visitor emails',                  recommendation: 'Add a contact form or email signup to key pages' },
  booking_embed: { label: 'Booking System',        icon: '📅', desc: 'Online appointment scheduling',                   recommendation: 'Add Calendly or similar to let visitors book instantly' },
  checkout:      { label: 'Checkout / Store',      icon: '🛒', desc: 'E-commerce or payment capability',               recommendation: 'Add online payment to sell products or deposits' },
  chatbot:       { label: 'Live Chat / Bot',       icon: '💬', desc: 'Real-time visitor engagement',                    recommendation: 'Add a chat widget (Tidio/Crisp) to capture leads 24/7' },
  free_offer:    { label: 'Free Trial / Offer',    icon: '🎁', desc: 'Risk-free entry offer',                           recommendation: 'Offer a free trial, sample or first-session free' },
  consultation:  { label: 'Free Consultation',     icon: '📞', desc: 'Offer to speak with prospects',                   recommendation: 'Prominently offer a free consultation or quote call' },
  contact_page:  { label: 'Contact Page',          icon: '📍', desc: 'Dedicated contact information page',              recommendation: 'Ensure a dedicated /contact page with multiple contact methods' },
};

const ALL_FUNNEL_TYPES = Object.keys(FUNNEL_ELEMENT_META) as Array<keyof typeof FUNNEL_ELEMENT_META>;

function FunnelSection({ report }: { report: ReportData }) {
  const f = report.funnelData;
  const scoreBadgeColor = f.funnelScore >= 7
    ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
    : f.funnelScore >= 4
    ? 'bg-amber-900/50 text-amber-300 border-amber-700'
    : 'bg-red-900/50 text-red-300 border-red-700';

  // Build a map of type → first found element
  const foundMap = new Map<string, string>();
  for (const el of f.elements) {
    if (!foundMap.has(el.type)) {
      foundMap.set(el.type, el.url);
    }
  }

  const foundTypes = ALL_FUNNEL_TYPES.filter(t => foundMap.has(t));
  const missingTypes = ALL_FUNNEL_TYPES.filter(t => !foundMap.has(t));

  function truncateUrl(u: string, maxLen = 50): string {
    if (u.length <= maxLen) return u;
    return u.slice(0, maxLen - 1) + '…';
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">Funnel Analysis</h3>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${scoreBadgeColor}`}>
          {f.funnelScore}/10
        </span>
      </div>

      {/* Score explanation */}
      <p className="text-xs text-zinc-500">
        Score: {f.funnelScore}/10 — based on {f.elements.length} funnel element{f.elements.length !== 1 ? 's' : ''} found across {f.crawledPages} page{f.crawledPages !== 1 ? 's' : ''}
      </p>

      {/* Found / Missing columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Found */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
            Found ({foundTypes.length})
          </p>
          {foundTypes.length === 0 && (
            <p className="text-xs text-zinc-600 italic">No funnel elements detected</p>
          )}
          {foundTypes.map(t => {
            const meta = FUNNEL_ELEMENT_META[t];
            const foundUrl = foundMap.get(t) ?? '';
            return (
              <div key={t} className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span>{meta.icon}</span>
                  <span className="text-sm font-medium text-emerald-300">{meta.label}</span>
                </div>
                <p className="text-xs text-emerald-200/60">{meta.desc}</p>
                {foundUrl && (
                  <p className="text-xs text-emerald-400/50 font-mono truncate" title={foundUrl}>
                    {truncateUrl(foundUrl)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Missing */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Missing ({missingTypes.length})
          </p>
          {missingTypes.length === 0 && (
            <p className="text-xs text-emerald-400 italic">All funnel elements present!</p>
          )}
          {missingTypes.map(t => {
            const meta = FUNNEL_ELEMENT_META[t];
            return (
              <div key={t} className="bg-zinc-800/50 border border-zinc-700/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="grayscale opacity-50">{meta.icon}</span>
                  <span className="text-sm font-medium text-zinc-400">{meta.label}</span>
                </div>
                <p className="text-xs text-zinc-500">{meta.recommendation}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-zinc-600">
        Crawled {f.crawledPages} pages · Found {f.elements.length} funnel elements
      </p>
    </div>
  );
}

function computeSeoScore(seo: ReportData['seoTraffic']): number {
  let score = 0;
  if (seo.metaTitle) score += 15;
  if (seo.metaDescription) score += 15;
  if (seo.h1) score += 10;
  if (seo.hasBlog) score += 20;
  if ((seo.indexedPageCount ?? 0) > 10) score += 20;
  if (seo.topKeywords.length >= 5) score += 10;
  if (seo.hasSSL) score += 10;
  if (seo.hasStructuredData) score += 5;
  if (seo.ogTitle) score += 5;
  if ((seo.h2Count ?? 0) > 0) score += 5;
  return Math.min(score, 100);
}

function SeoSection({ report }: { report: ReportData }) {
  const seo = report.seoTraffic;
  const seoScore = computeSeoScore(seo);
  const scoreColor = seoScore >= 70 ? 'text-emerald-400' : seoScore >= 40 ? 'text-amber-400' : 'text-red-400';

  // Determine paid search: check both seo flag and actual Google Ads data
  const hasPaidSearch = seo.isRunningPaidSearch || (report.adsIntelligence.googleAds.length > 0);
  const paidSearchLabel = hasPaidSearch
    ? (report.adsIntelligence.googleAds.length > 0 ? 'Yes (Google Ads detected)' : 'Yes')
    : 'No';

  // Filter display keywords: remove file path-like entries and domain name
  let domainRoot: string | null = null;
  try {
    domainRoot = new URL(report.websiteUrl).hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
  } catch {
    // ignore
  }
  const displayKeywords = seo.topKeywords.filter(kw => {
    if (kw.includes('/') || kw.includes('.')) return false;
    if (domainRoot && kw.split(' ').some(p => p === domainRoot)) return false;
    return true;
  });

  // Score breakdown criteria
  const breakdown = [
    { label: 'Title',       met: !!seo.metaTitle },
    { label: 'Description', met: !!seo.metaDescription },
    { label: 'H1',          met: !!seo.h1 },
    { label: 'Blog',        met: seo.hasBlog },
    { label: 'SSL',         met: seo.hasSSL },
    { label: 'Struct. Data', met: !!seo.hasStructuredData },
    { label: 'OG Tags',     met: !!seo.ogTitle },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      {/* Header + score */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">SEO &amp; Traffic</h3>
        <div className="text-center">
          <span className={`text-2xl font-bold ${scoreColor}`}>{seoScore}</span>
          <span className="text-sm font-normal text-zinc-600">/100</span>
        </div>
      </div>

      {/* Score breakdown tooltip row */}
      <div className="flex flex-wrap gap-1.5">
        {breakdown.map(({ label, met }) => (
          <span
            key={label}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              met
                ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800'
                : 'bg-zinc-800 text-zinc-600 border border-zinc-700'
            }`}
          >
            {label} {met ? '✓' : '✗'}
          </span>
        ))}
      </div>

      {/* Meta text fields */}
      <div className="space-y-3">
        {seo.metaTitle && (
          <div className="text-sm">
            <span className="text-zinc-600 block text-xs mb-0.5">Page Title</span>
            <span className="text-zinc-300">{seo.metaTitle}</span>
          </div>
        )}
        {seo.metaDescription && (
          <div className="text-sm">
            <span className="text-zinc-600 block text-xs mb-0.5">Meta Description</span>
            <span className="text-zinc-300">{seo.metaDescription}</span>
          </div>
        )}
        {seo.h1 && (
          <div className="text-sm">
            <span className="text-zinc-600 block text-xs mb-0.5">H1</span>
            <span className="text-zinc-300">{seo.h1}</span>
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          { label: 'Indexed Pages', value: seo.indexedPageCount !== null ? `~${seo.indexedPageCount.toLocaleString()}` : '—' },
          {
            label: 'Has Blog',
            value: seo.hasBlog ? 'Yes' : 'No',
            link: seo.hasBlog && seo.blogUrl ? seo.blogUrl : null,
          },
          { label: 'Paid Search',   value: paidSearchLabel },
          { label: 'SSL',           value: seo.hasSSL ? 'Yes' : 'No' },
          { label: 'Response Time', value: seo.responseTimeMs != null ? `${seo.responseTimeMs}ms` : '—' },
        ].map(({ label, value, link }) => (
          <div key={label} className="bg-zinc-800 rounded-lg p-3">
            <p className="text-xs text-zinc-600 mb-0.5">{label}</p>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
              >
                {value}
              </a>
            ) : (
              <p className="text-zinc-300 font-medium">{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Additional signal badges */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Structured Data', present: !!seo.hasStructuredData },
          { label: 'Open Graph Tags', present: !!seo.ogTitle },
          { label: 'Canonical URL',   present: !!seo.canonicalUrl },
        ].map(({ label, present }) => (
          <span
            key={label}
            className={`text-xs px-2 py-1 rounded-full border ${
              present
                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800'
                : 'bg-zinc-800 text-zinc-600 border-zinc-700'
            }`}
          >
            {present ? '✓' : '✗'} {label}
          </span>
        ))}
        {(seo.h2Count ?? 0) > 0 && (
          <span className="text-xs px-2 py-1 rounded-full border bg-emerald-900/30 text-emerald-400 border-emerald-800">
            H2 Headings: {seo.h2Count}
          </span>
        )}
      </div>

      {/* Keywords */}
      {displayKeywords.length > 0 && (
        <div>
          <p className="text-xs text-zinc-600 mb-2">Top Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {displayKeywords.map(kw => (
              <span key={kw} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
