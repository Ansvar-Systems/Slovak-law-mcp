#!/usr/bin/env tsx
/**
 * Slovak Law MCP -- Real data ingestion from Slov-Lex static portal.
 *
 * Fetches official statute history + effective version pages from:
 *   https://static.slov-lex.sk/static/SK/ZZ/{year}/{number}/
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit, resolveRelativeUrl } from './lib/fetcher.js';
import {
  TARGET_SLOVAK_LAWS,
  getHistoryUrl,
  parseHistoryEntries,
  selectHistoryEntry,
  parseActFromVersionPage,
  type TargetLaw,
  type ParsedAct,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
  asOfDate: string;
}

interface IngestionFailure {
  lawId: string;
  reason: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  let limit: number | null = null;
  let skipFetch = false;
  let asOfDate = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
      continue;
    }

    if (args[i] === '--skip-fetch') {
      skipFetch = true;
      continue;
    }

    if (args[i] === '--as-of' && args[i + 1]) {
      asOfDate = args[i + 1];
      i++;
    }
  }

  return { limit, skipFetch, asOfDate };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function clearSeedJsonFiles(): void {
  const files = fs.readdirSync(SEED_DIR).filter(file => file.endsWith('.json') && !file.startsWith('_'));
  for (const file of files) {
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

async function getPage(url: string, cacheFile: string, skipFetch: boolean): Promise<string> {
  if (skipFetch && fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf-8');
  }

  const response = await fetchWithRateLimit(url);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, response.body);
  return response.body;
}

function writeSeed(law: TargetLaw, act: ParsedAct): void {
  const seedPath = path.join(SEED_DIR, law.seedFile);
  fs.writeFileSync(seedPath, JSON.stringify(act, null, 2));
}

async function ingestLaw(
  law: TargetLaw,
  asOfDate: string,
  skipFetch: boolean,
): Promise<{ act: ParsedAct; selectedHref: string; selectedStatus: string }> {
  const lawSourceDir = path.join(SOURCE_DIR, law.id);
  const historyUrl = getHistoryUrl(law);
  const historyCachePath = path.join(lawSourceDir, 'history.html');

  const historyHtml = await getPage(historyUrl, historyCachePath, skipFetch);
  const historyEntries = parseHistoryEntries(historyHtml);
  if (historyEntries.length === 0) {
    throw new Error('No history entries found in law history page');
  }

  const { selected, status, firstInForceDate } = selectHistoryEntry(historyEntries, asOfDate);
  const versionUrl = resolveRelativeUrl(historyUrl, selected.href);
  const versionCachePath = path.join(lawSourceDir, selected.href.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  const versionHtml = await getPage(versionUrl, versionCachePath, skipFetch);

  const act = parseActFromVersionPage(versionHtml, law, status, firstInForceDate);
  if (act.provisions.length === 0) {
    throw new Error('Parser extracted zero provisions from selected version page');
  }

  writeSeed(law, act);
  return { act, selectedHref: selected.href, selectedStatus: status };
}

async function main(): Promise<void> {
  const { limit, skipFetch, asOfDate } = parseArgs();

  console.log('Slovak Law MCP -- Real ingestion from Slov-Lex static portal');
  console.log('============================================================');
  console.log(`As-of date: ${asOfDate}`);
  if (skipFetch) console.log('Mode: --skip-fetch (use cached source pages where available)');
  if (limit !== null) console.log(`Mode: --limit ${limit}`);

  ensureDirs();
  clearSeedJsonFiles();

  const targets = limit ? TARGET_SLOVAK_LAWS.slice(0, limit) : TARGET_SLOVAK_LAWS;

  let ingestedCount = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const failures: IngestionFailure[] = [];
  const versionSummary: Array<{ lawId: string; href: string; status: string }> = [];

  for (const law of targets) {
    process.stdout.write(`\n[${law.id}] Fetching and parsing...`);

    try {
      const { act, selectedHref, selectedStatus } = await ingestLaw(law, asOfDate, skipFetch);

      ingestedCount++;
      totalProvisions += act.provisions.length;
      totalDefinitions += act.definitions.length;
      versionSummary.push({ lawId: law.id, href: selectedHref, status: selectedStatus });

      console.log(` OK (${act.provisions.length} provisions, ${act.definitions.length} definitions, status: ${selectedStatus})`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ lawId: law.id, reason });
      console.log(` FAILED (${reason})`);
    }
  }

  const meta = {
    generated_at: new Date().toISOString(),
    as_of_date: asOfDate,
    source: 'https://static.slov-lex.sk/static/SK/ZZ/',
    requested_laws: targets.length,
    ingested_laws: ingestedCount,
    total_provisions: totalProvisions,
    total_definitions: totalDefinitions,
    selected_versions: versionSummary,
    skipped: failures,
  };
  fs.writeFileSync(path.join(SEED_DIR, '_ingestion-meta.json'), JSON.stringify(meta, null, 2));

  console.log('\n------------------------------------------------------------');
  console.log(`Ingested laws:      ${ingestedCount}/${targets.length}`);
  console.log(`Total provisions:   ${totalProvisions}`);
  console.log(`Total definitions:  ${totalDefinitions}`);

  if (failures.length > 0) {
    console.log('Skipped laws:');
    for (const failure of failures) {
      console.log(`  - ${failure.lawId}: ${failure.reason}`);
    }
  }

  if (ingestedCount === 0) {
    throw new Error('No laws were ingested successfully.');
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
