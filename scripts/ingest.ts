#!/usr/bin/env tsx
/**
 * Slovak Law MCP -- Real data ingestion from Slov-Lex static portal.
 *
 * Modes:
 * - Curated mode (default): ingest the key curated statutes with full provision text.
 * - Catalog mode (--all-laws): discover laws from annual Slov-Lex register pages.
 *   - --metadata-only: create metadata-only seed files from catalog entries (fast breadth coverage).
 *   - without --metadata-only: fetch and parse selected effective version pages (deep coverage).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit, resolveRelativeUrl } from './lib/fetcher.js';
import {
  assertRunEffective,
  assertSeedOverwriteSafe,
  atomicWriteJson,
  buildIngestStamp,
  combinePageProvenance,
  summarizeProvisions,
  validateFlagCombination,
  versionIdFromHref,
  type CliArgs,
  type ExistingSeedSummary,
  type IngestStamp,
  type PageProvenance,
} from './lib/ingest-core.js';
import {
  TARGET_SLOVAK_LAWS,
  getHistoryUrl,
  getCatalogRootUrl,
  getCatalogYearUrl,
  parseCatalogYears,
  parseCatalogYearEntries,
  isLikelyLawEntry,
  catalogEntryToTargetLaw,
  parseHistoryEntries,
  selectHistoryEntry,
  parseActFromVersionPage,
  type TargetLaw,
  type ParsedAct,
  type DocumentStatus,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface IngestionFailure {
  lawId: string;
  reason: string;
}

interface IngestResult {
  act: ParsedAct;
  selectedHref: string;
  selectedStatus: string;
  selectedInForceFrom: string;
  selectedInForceTo: string;
  versionUrl: string;
  provenance: PageProvenance;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  let limit: number | null = null;
  let skipFetch = false;
  let asOfDate = new Date().toISOString().slice(0, 10);
  let allLaws = false;
  let lawsOnly = false;
  let metadataOnly = false;
  let keepExisting = false;
  let resume = false;

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
      continue;
    }

    if (args[i] === '--all-laws') {
      allLaws = true;
      continue;
    }

    if (args[i] === '--laws-only') {
      lawsOnly = true;
      continue;
    }

    if (args[i] === '--metadata-only') {
      metadataOnly = true;
      continue;
    }

    if (args[i] === '--keep-existing') {
      keepExisting = true;
      continue;
    }

    if (args[i] === '--resume') {
      resume = true;
    }
  }

  if (metadataOnly && allLaws) {
    keepExisting = true;
  }

  return {
    limit,
    skipFetch,
    asOfDate,
    allLaws,
    lawsOnly,
    metadataOnly,
    keepExisting,
    resume,
  };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function seedPathForLaw(law: TargetLaw): string {
  return path.join(SEED_DIR, law.seedFile);
}

function readExistingSeedSummary(seedPath: string): ExistingSeedSummary | null {
  if (!fs.existsSync(seedPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as {
      provisions?: Array<{ provision_ref?: unknown }>;
      definitions?: unknown[];
    };

    const provisions = Array.isArray(parsed.provisions) ? parsed.provisions : [];
    return {
      ...summarizeProvisions(
        provisions.map(p => ({ provision_ref: typeof p?.provision_ref === 'string' ? p.provision_ref : '' })),
      ),
      definitions: Array.isArray(parsed.definitions) ? parsed.definitions.length : 0,
    };
  } catch {
    return null;
  }
}

interface FetchedPage {
  body: string;
  provenance: PageProvenance;
}

async function getPage(url: string, cacheFile: string, skipFetch: boolean): Promise<FetchedPage> {
  if (skipFetch && fs.existsSync(cacheFile)) {
    // A cache replay must carry the CACHE FILE's own age as its retrieval
    // time — stamping "retrieved now" for months-old bytes is provenance lying.
    return {
      body: fs.readFileSync(cacheFile, 'utf-8'),
      provenance: {
        fromCache: true,
        retrievedAt: fs.statSync(cacheFile).mtime.toISOString(),
      },
    };
  }

  const response = await fetchWithRateLimit(url);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, response.body);
  return {
    body: response.body,
    provenance: {
      fromCache: false,
      retrievedAt: new Date().toISOString(),
      // Final post-redirect URL — record where the bytes actually came from.
      servedUrl: response.url,
    },
  };
}

function writeSeed(law: TargetLaw, act: ParsedAct, stamp: IngestStamp): void {
  const seedPath = seedPathForLaw(law);
  assertSeedOverwriteSafe(law.id, summarizeProvisions(act.provisions), readExistingSeedSummary(seedPath));
  atomicWriteJson(seedPath, { ...act, _ingest: stamp });
}

function buildMetadataOnlyAct(law: TargetLaw): ParsedAct {
  const title = law.catalogTitle ?? `${law.shortName}`;

  return {
    id: law.id,
    type: 'statute',
    title,
    title_en: law.titleEn || title,
    short_name: law.shortName,
    status: 'unknown',
    url: `https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/${law.year}/${law.number}/`,
    description: law.description,
    provisions: [],
    definitions: [],
  };
}

async function ingestLaw(
  law: TargetLaw,
  asOfDate: string,
  skipFetch: boolean,
): Promise<IngestResult> {
  const lawSourceDir = path.join(SOURCE_DIR, law.id);
  const historyUrl = getHistoryUrl(law);
  const historyCachePath = path.join(lawSourceDir, 'history.html');

  const historyPage = await getPage(historyUrl, historyCachePath, skipFetch);
  const historyEntries = parseHistoryEntries(historyPage.body);
  if (historyEntries.length === 0) {
    throw new Error('No history entries found in law history page');
  }

  const { selected, status, firstInForceDate } = selectHistoryEntry(historyEntries, asOfDate);
  const versionUrl = resolveRelativeUrl(historyUrl, selected.href);
  const versionCachePath = path.join(lawSourceDir, selected.href.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  const versionPage = await getPage(versionUrl, versionCachePath, skipFetch);

  const act = parseActFromVersionPage(versionPage.body, law, status, firstInForceDate);
  if (act.provisions.length === 0) {
    throw new Error(
      `Fetched ${versionUrl} but parsed 0 provisions — treating as a parse failure, not new data`,
    );
  }
  if (act.provisions.length === 1 && act.provisions[0].provision_ref === 'text') {
    console.log(`\n  NOTE [${law.id}]: flat-text fallback parse — no paragraf structure, single 'text' provision`);
  }

  return {
    act,
    selectedHref: selected.href,
    selectedStatus: status,
    selectedInForceFrom: selected.inForceFrom,
    selectedInForceTo: selected.inForceTo,
    versionUrl,
    provenance: combinePageProvenance(historyPage.provenance, versionPage.provenance),
  };
}

async function discoverCatalogTargets(
  skipFetch: boolean,
  lawsOnly: boolean,
): Promise<TargetLaw[]> {
  const catalogDir = path.join(SOURCE_DIR, 'catalog');
  const rootUrl = getCatalogRootUrl();
  const rootCache = path.join(catalogDir, 'root.html');
  const rootHtml = (await getPage(rootUrl, rootCache, skipFetch)).body;

  const years = parseCatalogYears(rootHtml);
  const targets = new Map<string, TargetLaw>();

  for (const year of years) {
    const yearUrl = getCatalogYearUrl(year);
    const yearCache = path.join(catalogDir, `${year}.html`);
    const yearHtml = (await getPage(yearUrl, yearCache, skipFetch)).body;

    const entries = parseCatalogYearEntries(yearHtml, year);
    for (const entry of entries) {
      if (lawsOnly && !isLikelyLawEntry(entry)) {
        continue;
      }

      const target = catalogEntryToTargetLaw(entry);
      if (!targets.has(target.id)) {
        targets.set(target.id, target);
      }
    }
  }

  return [...targets.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.number !== b.number) return a.number - b.number;
    return a.id.localeCompare(b.id);
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  validateFlagCombination(args);
  const {
    limit,
    skipFetch,
    asOfDate,
    allLaws,
    lawsOnly,
    metadataOnly,
    keepExisting,
    resume,
  } = args;

  console.log('Slovak Law MCP -- Real ingestion from Slov-Lex static portal');
  console.log('============================================================');
  console.log(`As-of date: ${asOfDate}`);
  if (skipFetch) console.log('Mode: --skip-fetch (use cached source pages where available)');
  if (allLaws) console.log('Mode: --all-laws (catalog discovery enabled)');
  if (lawsOnly) console.log('Mode: --laws-only (filter catalog to entries that start with "Zákon")');
  if (metadataOnly) console.log('Mode: --metadata-only (catalog breadth coverage with metadata-only seeds)');
  if (keepExisting) console.log('Mode: --keep-existing (do not overwrite existing seed files)');
  if (resume) console.log('Mode: --resume (skip items with existing seeds)');
  if (limit !== null) console.log(`Mode: --limit ${limit}`);

  ensureDirs();

  // Seeds are overwritten atomically per target on successful ingestion.
  // There is deliberately no pre-clear: a transient fetch/parse failure must
  // never destroy previously good seed content (transient != gone), and a
  // curated run must not touch the catalog-breadth seeds outside its targets.

  let targets: TargetLaw[];
  if (allLaws) {
    targets = await discoverCatalogTargets(skipFetch, lawsOnly);
  } else {
    targets = TARGET_SLOVAK_LAWS;
  }

  if (limit !== null) {
    targets = targets.slice(0, limit);
  }

  const curatedIds = new Set(TARGET_SLOVAK_LAWS.map(law => law.id));
  let ingestedCount = 0;
  let reusedCount = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const failures: IngestionFailure[] = [];
  const reusedCuratedIds: string[] = [];
  const versionSummary: Array<{
    lawId: string;
    href: string;
    status: DocumentStatus | string;
    version?: string;
  }> = [];

  for (const law of targets) {
    const seedPath = seedPathForLaw(law);

    if ((keepExisting || resume) && fs.existsSync(seedPath)) {
      const summary = readExistingSeedSummary(seedPath);
      reusedCount++;
      totalProvisions += summary?.provisions ?? 0;
      totalDefinitions += summary?.definitions ?? 0;
      versionSummary.push({ lawId: law.id, href: 'existing', status: 'existing' });
      if (curatedIds.has(law.id)) {
        reusedCuratedIds.push(law.id);
      }
      console.log(`\n[${law.id}] SKIP existing seed`);
      continue;
    }

    process.stdout.write(`\n[${law.id}] Fetching and parsing...`);

    try {
      let act: ParsedAct;
      let selectedHref: string;
      let selectedStatus: string;
      let stamp: IngestStamp;

      if (metadataOnly) {
        act = buildMetadataOnlyAct(law);
        selectedHref = 'catalog_only';
        selectedStatus = 'unknown';
        stamp = buildIngestStamp({ kind: 'metadata_stub', asOfDate });
      } else {
        const result = await ingestLaw(law, asOfDate, skipFetch);
        act = result.act;
        selectedHref = result.selectedHref;
        selectedStatus = result.selectedStatus;
        stamp = buildIngestStamp({
          kind: 'fetched_version',
          asOfDate,
          version: versionIdFromHref(result.selectedHref),
          versionUrl: result.versionUrl,
          servedUrl: result.provenance.servedUrl,
          inForceFrom: result.selectedInForceFrom,
          inForceTo: result.selectedInForceTo,
          selectedStatus: result.selectedStatus,
          retrievedAt: result.provenance.retrievedAt,
          fromCache: result.provenance.fromCache,
        });
      }

      writeSeed(law, act, stamp);
      ingestedCount++;
      totalProvisions += act.provisions.length;
      totalDefinitions += act.definitions.length;
      versionSummary.push({ lawId: law.id, href: selectedHref, status: selectedStatus, version: stamp.version });

      console.log(` OK (${act.provisions.length} provisions, ${act.definitions.length} definitions, status: ${selectedStatus}${stamp.version ? `, version: ${stamp.version}` : ''})`);
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
    mode: {
      all_laws: allLaws,
      laws_only: lawsOnly,
      metadata_only: metadataOnly,
      keep_existing: keepExisting,
      resume,
      skip_fetch: skipFetch,
    },
    requested_laws: targets.length,
    ingested_laws: ingestedCount,
    reused_existing_laws: reusedCount,
    reused_curated_laws: reusedCuratedIds,
    total_provisions: totalProvisions,
    total_definitions: totalDefinitions,
    selected_versions: versionSummary,
    failed: failures,
  };
  atomicWriteJson(path.join(SEED_DIR, '_ingestion-meta.json'), meta);

  console.log('\n------------------------------------------------------------');
  console.log(`Target laws:        ${targets.length}`);
  console.log(`Ingested laws:      ${ingestedCount}`);
  console.log(`Reused seeds:       ${reusedCount}`);
  console.log(`Total provisions:   ${totalProvisions}`);
  console.log(`Total definitions:  ${totalDefinitions}`);

  if (reusedCuratedIds.length > 0) {
    console.log(
      `NOTE: ${reusedCuratedIds.length} curated full-text laws were REUSED, not refreshed: ` +
      reusedCuratedIds.join(', '),
    );
    console.log('      Run the default curated mode (no flags) to refresh them.');
  }

  if (failures.length > 0) {
    console.log('Failed laws:');
    for (const failure of failures) {
      console.log(`  - ${failure.lawId}: ${failure.reason}`);
    }
  }

  const outcome = assertRunEffective(
    { ingested: ingestedCount, reused: reusedCount, requested: targets.length },
    { allLaws, resume },
  );

  if (outcome === 'nothing_new') {
    console.log(
      `Nothing new: all ${reusedCount} requested laws already have seeds ` +
      '(breadth/resume steady state) — no refresh was needed.',
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Partial run: ${failures.length} of ${targets.length} laws failed to ingest (see "failed" in _ingestion-meta.json).`,
    );
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
