#!/usr/bin/env ts-node
// Load .env.local for CLI usage (Next.js does this automatically but ts-node does not)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { runOrchestrator } from '@/scrapers';
import { buildReport } from '@/report/builder';
import { toMarkdown } from '@/report/markdown-exporter';
import { printReport } from './cli-reporter';

const program = new Command();

program
  .name('bi-research')
  .description('Business Intelligence Research Tool CLI')
  .option('--url <url>', 'Website URL to research')
  .option('--output <file>', 'Save output to Markdown file')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  if (!opts.url) {
    console.error(chalk.red('Error: --url is required'));
    process.exit(1);
  }

  const targetUrl: string = opts.url;
  const spinner = ora('Running research pipeline...').start();

  try {
    const reportData = await runOrchestrator(targetUrl, 'cli', 'cli', {
      onProgress: async (progress, step) => {
        spinner.text = `${chalk.dim(`${progress}%`)} ${step}`;
      },
    });

    // Enrich with AI (skipped in CLI if no OPENROUTER_API_KEY)
    if (process.env.OPENROUTER_API_KEY) {
      spinner.text = 'Generating AI analysis...';
      const enriched = await buildReport(reportData);
      spinner.succeed('Research complete');
      printReport(enriched);

      if (opts.output) {
        const md = toMarkdown(enriched);
        fs.writeFileSync(path.resolve(opts.output), md, 'utf-8');
        console.log(chalk.green(`Report saved to ${opts.output}`));
      }
    } else {
      spinner.succeed('Research complete (AI skipped — no OPENROUTER_API_KEY)');
      printReport(reportData);
    }
  } catch (err) {
    spinner.fail(`Research failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch(console.error);
