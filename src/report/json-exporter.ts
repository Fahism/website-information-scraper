import type { ReportData } from '@/scrapers/types';

export function toJson(report: ReportData): string {
  return JSON.stringify(report, null, 2);
}
