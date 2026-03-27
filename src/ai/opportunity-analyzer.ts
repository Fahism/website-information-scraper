import { openrouter, OPENROUTER_MODEL, truncateToLimit } from '@/lib/openrouter';
import { buildOpportunityAnalysisPrompt } from './prompts';
import type { ReportData, OpportunityAnalysis } from '@/scrapers/types';

export async function analyzeOpportunities(data: ReportData): Promise<OpportunityAnalysis> {
  const { system, user } = buildOpportunityAnalysisPrompt(data);
  const truncatedUser = truncateToLimit(user, 10000);

  const response = await openrouter.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: truncatedUser },
    ],
    temperature: 0.4,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content ?? '{}';

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      businessSummary: 'Analysis unavailable',
      overallScore: 0,
      opportunities: [],
      strengths: [],
      gaps: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as OpportunityAnalysis;
    return parsed;
  } catch {
    return {
      businessSummary: 'Analysis parse error',
      overallScore: 0,
      opportunities: [],
      strengths: [],
      gaps: [],
    };
  }
}
