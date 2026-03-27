import { analyzeOpportunities } from '@/ai/opportunity-analyzer';
import { generateLoomScript } from '@/ai/loom-script-generator';
import type { ReportData } from '@/scrapers/types';

export async function buildReport(
  data: ReportData,
  onProgress?: (progress: number, step: string) => Promise<void>
): Promise<ReportData> {
  await onProgress?.(88, 'Generating opportunity analysis');
  const opportunities = await analyzeOpportunities(data);

  await onProgress?.(93, 'Writing Loom script');
  const loomScript = await generateLoomScript({ ...data, opportunities });

  await onProgress?.(97, 'Finalizing report');
  return {
    ...data,
    opportunities,
    loomScript,
  };
}
