import { openrouter, OPENROUTER_MODEL, truncateToLimit } from '@/lib/openrouter';
import { buildLoomScriptPrompt } from './prompts';
import type { ReportData, LoomScript } from '@/scrapers/types';

export async function generateLoomScript(data: ReportData): Promise<LoomScript> {
  const { system, user } = buildLoomScriptPrompt(data);
  const truncatedUser = truncateToLimit(user, 10000);

  const response = await openrouter.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: truncatedUser },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content ?? '{}';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return buildEmptyScript();
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      subjectLine?: string;
      hook?: string;
      observation?: string;
      insight?: string;
      pitch?: string;
      cta?: string;
    };

    const sections = {
      hook: parsed.hook ?? '',
      observation: parsed.observation ?? '',
      insight: parsed.insight ?? '',
      pitch: parsed.pitch ?? '',
      cta: parsed.cta ?? '',
    };

    const fullScript = [
      sections.hook,
      sections.observation,
      sections.insight,
      sections.pitch,
      sections.cta,
    ].filter(Boolean).join('\n\n');

    const wordCount = fullScript.split(/\s+/).filter(Boolean).length;
    const estimatedDuration = wordCount / 2.5; // ~150 words per minute

    return {
      wordCount,
      estimatedDuration,
      subjectLine: parsed.subjectLine ?? '',
      sections,
      fullScript,
    };
  } catch {
    return buildEmptyScript();
  }
}

function buildEmptyScript(): LoomScript {
  return {
    wordCount: 0,
    estimatedDuration: 0,
    subjectLine: '',
    sections: { hook: '', observation: '', insight: '', pitch: '', cta: '' },
    fullScript: '',
  };
}
