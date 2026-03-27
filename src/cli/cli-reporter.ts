import chalk from 'chalk';
import type { ReportData } from '@/scrapers/types';

export function printReport(report: ReportData): void {
  console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.white('  BUSINESS INTELLIGENCE REPORT'));
  console.log(chalk.bold.cyan('═'.repeat(60)));

  // Business Info
  console.log('\n' + chalk.bold.yellow('BUSINESS INFO'));
  console.log(chalk.gray('─'.repeat(40)));
  const bi = report.businessInfo;
  console.log(`  Name:     ${bi.businessName ?? chalk.gray('—')}`);
  console.log(`  Phone:    ${bi.phone ?? chalk.gray('—')}`);
  console.log(`  Email:    ${bi.email ?? chalk.gray('—')}`);
  console.log(`  Address:  ${bi.address ?? chalk.gray('—')}`);
  console.log(`  Industry: ${bi.industry ?? chalk.gray('—')}`);
  console.log(`  Booking:  ${bi.hasBookingSystem ? chalk.green(bi.bookingPlatform ?? 'yes') : chalk.gray('none')}`);

  // Social Media
  console.log('\n' + chalk.bold.yellow('SOCIAL MEDIA'));
  console.log(chalk.gray('─'.repeat(40)));
  if (report.socialMedia.profiles.length === 0) {
    console.log(chalk.gray('  No profiles found'));
  } else {
    for (const p of report.socialMedia.profiles) {
      console.log(`  ${chalk.cyan(p.platform.padEnd(12))} ${p.handle ?? '—'} · ${p.followers?.toLocaleString() ?? '?'} followers`);
    }
  }

  // Tech Stack
  console.log('\n' + chalk.bold.yellow('TECH STACK'));
  console.log(chalk.gray('─'.repeat(40)));
  const techs = report.techStack.technologies;
  if (techs.length === 0) {
    console.log(chalk.gray('  None detected'));
  } else {
    techs.slice(0, 10).forEach(t => {
      console.log(`  ${chalk.blue(t.name.padEnd(25))} ${chalk.gray(t.category)}`);
    });
    if (techs.length > 10) console.log(chalk.gray(`  ... and ${techs.length - 10} more`));
  }

  // Ads
  console.log('\n' + chalk.bold.yellow('ADS INTELLIGENCE'));
  console.log(chalk.gray('─'.repeat(40)));
  const ads = report.adsIntelligence;
  console.log(`  Meta:    ${ads.metaAds.length} ads`);
  console.log(`  TikTok:  ${ads.tiktokAds.length} ads`);
  console.log(`  Google:  ${ads.googleAds.length} ads`);
  console.log(`  Active:  ${ads.totalActiveAds} total`);

  // Funnel
  console.log('\n' + chalk.bold.yellow('FUNNEL ANALYSIS'));
  console.log(chalk.gray('─'.repeat(40)));
  const f = report.funnelData;
  console.log(`  Score:          ${chalk.bold(f.funnelScore + '/10')}`);
  console.log(`  Landing pages:  ${f.hasLandingPage ? chalk.green('yes') : chalk.gray('no')}`);
  console.log(`  Email capture:  ${f.hasEmailCapture ? chalk.green('yes') : chalk.gray('no')}`);
  console.log(`  Booking:        ${f.hasBooking ? chalk.green('yes') : chalk.gray('no')}`);
  console.log(`  Pages crawled:  ${f.crawledPages}`);

  // SEO
  console.log('\n' + chalk.bold.yellow('SEO / TRAFFIC'));
  console.log(chalk.gray('─'.repeat(40)));
  const seo = report.seoTraffic;
  console.log(`  Indexed pages:  ${seo.indexedPageCount?.toLocaleString() ?? chalk.gray('—')}`);
  console.log(`  Has blog:       ${seo.hasBlog ? chalk.green('yes') : chalk.gray('no')}`);
  console.log(`  Paid search:    ${seo.isRunningPaidSearch ? chalk.green('yes') : chalk.gray('no')}`);
  console.log(`  Top keywords:   ${seo.topKeywords.slice(0, 5).join(', ') || chalk.gray('—')}`);

  // AI Opportunities
  if (report.opportunities.opportunities.length > 0) {
    console.log('\n' + chalk.bold.yellow('OPPORTUNITIES'));
    console.log(chalk.gray('─'.repeat(40)));
    for (const opp of report.opportunities.opportunities.slice(0, 5)) {
      const priorityColor = opp.priority === 'high' ? chalk.red : opp.priority === 'medium' ? chalk.yellow : chalk.gray;
      console.log(`  ${priorityColor(`[${opp.priority.toUpperCase()}]`)} ${opp.finding}`);
      console.log(`         → ${chalk.gray(opp.recommendation)}`);
    }
  }

  // Loom Script
  if (report.loomScript.fullScript) {
    console.log('\n' + chalk.bold.yellow('LOOM SCRIPT'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white(report.loomScript.fullScript));
    console.log(chalk.gray(`  ${report.loomScript.wordCount} words · ~${Math.round(report.loomScript.estimatedDuration)}s`));
  }

  console.log('\n' + chalk.bold.cyan('═'.repeat(60)) + '\n');
}
