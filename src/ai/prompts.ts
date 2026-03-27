import type { ReportData } from '@/scrapers/types';

export function buildOpportunityAnalysisPrompt(data: ReportData): { system: string; user: string } {
  const system = `You are an expert marketing strategist for a digital marketing agency. Analyze business data and identify actionable marketing opportunities. Be concrete — cite exact numbers. Avoid generic recommendations. Return ONLY valid JSON.`;

  const truncate = (str: string | null, max: number) => str ? str.slice(0, max) : null;

  const metaAdSamples = data.adsIntelligence.metaAds
    .slice(0, 2)
    .map(a => a.adText)
    .filter(Boolean);
  const googleAdSamples = data.adsIntelligence.googleAds
    .slice(0, 1)
    .map(a => a.adText)
    .filter(Boolean);

  const payload = {
    businessName: data.businessName,
    websiteUrl: data.websiteUrl,
    industry: data.businessInfo.industry,
    phone: data.businessInfo.phone,
    hasBooking: data.businessInfo.hasBookingSystem,
    bookingPlatform: data.businessInfo.bookingPlatform,
    hasContactForm: data.businessInfo.hasContactForm,
    googleRating: data.businessInfo.googleRating,
    reviewCount: data.businessInfo.reviewCount,
    businessHours: data.businessInfo.businessHours,
    socialProfiles: data.socialMedia.profiles.map(p => ({
      platform: p.platform,
      followers: p.followers,
      engagementRate: p.engagementRate,
      bio: truncate(p.bio, 100),
      posts: p.posts,
    })),
    technologies: data.techStack.technologies.slice(0, 15).map(t => t.name),
    hasCRM: data.techStack.hasCRM,
    crmName: data.techStack.crmName,
    hasEmailTool: data.techStack.hasEmailTool,
    emailToolName: data.techStack.emailToolName,
    hasMetaPixel: data.techStack.pixelTypes.includes('Meta Pixel'),
    activeAds: data.adsIntelligence.totalActiveAds,
    metaAdsCount: data.adsIntelligence.metaAds.length,
    tiktokAdsCount: data.adsIntelligence.tiktokAds.length,
    googleAdsCount: data.adsIntelligence.googleAds.length,
    metaAdSamples,
    googleAdSamples,
    provenAdCount: data.adMetrics.summary.provenAdCount,
    funnelScore: data.funnelData.funnelScore,
    hasLandingPage: data.funnelData.hasLandingPage,
    hasEmailCapture: data.funnelData.hasEmailCapture,
    hasBookingFunnel: data.funnelData.hasBooking,
    indexedPages: data.seoTraffic.indexedPageCount,
    hasBlog: data.seoTraffic.hasBlog,
    isRunningPaidSearch: data.seoTraffic.isRunningPaidSearch,
    topKeywords: data.seoTraffic.topKeywords.slice(0, 10),
    responseTimeMs: data.seoTraffic.responseTimeMs,
    hasSSL: data.seoTraffic.hasSSL,
    description: truncate(data.businessInfo.description, 300),
  };

  const user = `Analyze this business and return a JSON object with this exact structure:
{
  "businessSummary": "2-3 sentence overview of the business",
  "overallScore": <number 0-100, marketing sophistication score>,
  "opportunities": [
    {
      "id": "opp_1",
      "category": "<automation|funnel|social|ads|seo|tech|content>",
      "priority": "<high|medium|low>",
      "finding": "One specific finding about this business",
      "recommendation": "Specific actionable recommendation. What exact tool or approach to use.",
      "evidence": ["specific data point 1", "specific data point 2"]
    }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2", "gap 3"]
}

Business data: ${JSON.stringify(payload)}

Rules:
- Generate 3-6 opportunities
- Be specific and cite actual numbers from the data (e.g., "0 active Meta ads" not "no advertising")
- Reference exact values: follower counts, review counts, ratings, response times, page counts
- Each opportunity must have 1-3 evidence items drawn from the data
- Score 0-30: no digital presence, 31-60: basic presence, 61-80: growing, 81-100: sophisticated
- Return ONLY the JSON, no markdown`;

  return { system, user };
}

export function buildLoomScriptPrompt(data: ReportData): { system: string; user: string } {
  const system = `You are a world-class agency outreach strategist who writes Loom video scripts that actually get replies. Your scripts feel like a smart friend casually pointing out money left on the table — never like a cold pitch.

Your style rules:
- Open with a PATTERN INTERRUPT — something unexpected that makes them lean in (a compliment, a surprising stat about their own business, a bold observation). Never start with "Hey [name], I was looking at your website."
- Every claim must reference SPECIFIC data you found (exact numbers, platform names, real URLs). Vague observations kill credibility.
- Create an "aha moment" — connect dots they haven't connected. Show them something they didn't know about their own business.
- The pitch should feel like sharing a secret, not selling a service. Frame it as "here's what I'd do if I were you" not "we can help you."
- End with a micro-commitment CTA — make it so easy to say yes that saying no feels harder.
- Write like you TALK — contractions, short sentences, the occasional "honestly" or "look." No corporate speak.
- Aim for the energy of a voice note to a friend who owns a business, not a sales presentation.

Return ONLY valid JSON.`;

  const biz = data.businessInfo;
  const social = data.socialMedia.profiles;
  const tech = data.techStack;
  const ads = data.adsIntelligence;
  const funnel = data.funnelData;
  const seo = data.seoTraffic;
  const opps = data.opportunities;

  const topOpps = opps.opportunities
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
      return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
    })
    .slice(0, 5);

  const socialSnapshot = social.slice(0, 4).map(p =>
    `${p.platform}: ${p.followers ?? '?'} followers, ${p.engagementRate ?? '?'}% engagement, ${p.posts ?? '?'} posts`
  ).join('\n') || 'No social profiles found';

  const techList = tech.technologies.slice(0, 10).map(t => t.name).join(', ') || 'None detected';

  const adSnapshot = [
    ads.metaAds.length > 0 ? `${ads.metaAds.length} Meta ads` : null,
    ads.googleAds.length > 0 ? `${ads.googleAds.length} Google ads` : null,
    ads.tiktokAds.length > 0 ? `${ads.tiktokAds.length} TikTok ads` : null,
    ads.totalActiveAds === 0 ? 'No active ads detected' : null,
  ].filter(Boolean).join(', ');

  const funnelMissing = [
    !funnel.hasLandingPage ? 'landing page' : null,
    !funnel.hasEmailCapture ? 'email capture' : null,
    !funnel.hasLeadMagnet ? 'lead magnet' : null,
    !funnel.hasBooking ? 'booking system' : null,
  ].filter(Boolean);

  const user = `Write a 200-300 word Loom outreach script for this business. Also write a compelling email subject line (under 60 chars) for sending the Loom link.

===== BUSINESS PROFILE =====
Name: ${data.businessName ?? data.websiteUrl}
URL: ${data.websiteUrl}
Industry: ${biz.industry ?? 'Unknown'}
Location: ${[biz.city, biz.state].filter(Boolean).join(', ') || 'Unknown'}
Description: ${biz.description?.slice(0, 200) ?? 'N/A'}
Google Rating: ${biz.googleRating ?? 'N/A'} (${biz.reviewCount ?? 0} reviews)
Has Booking: ${biz.hasBookingSystem ? `Yes (${biz.bookingPlatform ?? 'unknown platform'})` : 'No'}
Has Contact Form: ${biz.hasContactForm ? 'Yes' : 'No'}

===== DIGITAL PRESENCE =====
Social: ${socialSnapshot}
Tech Stack: ${techList}
CRM: ${tech.hasCRM ? tech.crmName : 'None'} | Email Tool: ${tech.hasEmailTool ? tech.emailToolName : 'None'}
Tracking Pixels: ${tech.pixelTypes.length > 0 ? tech.pixelTypes.join(', ') : 'None'}
Ads: ${adSnapshot}
SEO Score: ~${seo.indexedPageCount ?? 0} indexed pages, ${seo.hasBlog ? 'has blog' : 'no blog'}, ${seo.topKeywords.slice(0, 5).join(', ') || 'no keywords found'}

===== FUNNEL =====
Score: ${funnel.funnelScore}/10
Missing: ${funnelMissing.length > 0 ? funnelMissing.join(', ') : 'All elements present'}

===== AI ANALYSIS =====
Overall Score: ${opps.overallScore}/100
Summary: ${opps.businessSummary}
Strengths: ${opps.strengths.join('; ')}
Gaps: ${opps.gaps.join('; ')}
Top Opportunities:
${topOpps.map((o, i) => `${i + 1}. [${o.priority.toUpperCase()}] ${o.finding} → ${o.recommendation}`).join('\n')}

===== OUTPUT FORMAT =====
Return this exact JSON:
{
  "subjectLine": "Short, curiosity-driven subject line under 60 chars",
  "hook": "Pattern-interrupt opener that makes them stop scrolling. Reference something SPECIFIC about their business — a real number, a real page, a real gap. 2-3 sentences.",
  "observation": "Your key finding, backed by real data from above. Connect multiple data points to paint a picture they haven't seen. 3-4 sentences.",
  "insight": "The 'aha moment' — what this actually MEANS for their revenue/growth. Make them feel the cost of inaction. 2-3 sentences.",
  "pitch": "Position your solution as the obvious next step. Frame it as what YOU would do, not what you're selling. Be specific about the approach. 2-3 sentences.",
  "cta": "Micro-commitment close. Make saying yes effortless — suggest a specific, low-stakes next step. 1-2 sentences."
}

Rules:
- 200-300 words total across all sections
- Every section must reference SPECIFIC data from above (numbers, platform names, scores)
- No placeholder text like [name] or [business] — use the actual business name
- Sound like a real person on a Loom, not a template
- The hook must NOT start with "Hey" or "Hi" — find a more creative opener
- Return ONLY the JSON, no markdown`;

  return { system, user };
}
