/**
 * Pure, testable core logic for the Slov-Lex ingest pipeline.
 *
 * Extracted as part of the issue #49 repair (corpus version-pin defect):
 * - flag-combination guard: a "refresh" whose flags mean nothing will be
 *   fetched must fail loud instead of exiting 0 claiming success;
 * - version identity stamping (_ingest block) so refresh decisions are
 *   provable from the seed itself;
 * - content sanity: a zero-provision parse must never overwrite a seed
 *   that carries real text;
 * - atomic seed writes (tmp + rename).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
  asOfDate: string;
  allLaws: boolean;
  lawsOnly: boolean;
  metadataOnly: boolean;
  keepExisting: boolean;
  resume: boolean;
}

/**
 * Content shape of a parsed act or an existing seed, as far as the
 * overwrite-safety rules care: how many provisions it carries and whether it
 * is the flat-text fallback (a single fabricated provision with
 * `provision_ref: 'text'`, produced when zero `paragraf` divs parse).
 */
export interface SeedContentSummary {
  provisions: number;
  flatTextOnly: boolean;
}

export interface ExistingSeedSummary extends SeedContentSummary {
  definitions: number;
}

export const FLAT_TEXT_PROVISION_REF = 'text';

export function summarizeProvisions(
  provisions: Array<{ provision_ref: string }>,
): SeedContentSummary {
  return {
    provisions: provisions.length,
    flatTextOnly: provisions.length === 1 && provisions[0].provision_ref === FLAT_TEXT_PROVISION_REF,
  };
}

export const SLOV_LEX_STATIC_SOURCE = 'https://static.slov-lex.sk/static/SK/ZZ/';

/**
 * Version identity stamp written into every seed under `_ingest`.
 *
 * `fetched_version` records exactly which Slov-Lex consolidation state the
 * seed text came from. `metadata_stub` marks catalog-breadth stubs that carry
 * no provision text and therefore no version identity.
 */
export interface IngestStamp {
  kind: 'fetched_version' | 'metadata_stub';
  source: string;
  retrieved_at: string;
  as_of_date: string;
  version?: string;
  version_url?: string;
  /** Final post-redirect URL that actually served the version bytes (fresh fetches only). */
  served_url?: string;
  /** True when any page backing this stamp was replayed from the local cache (--skip-fetch). */
  from_cache?: boolean;
  in_force_from?: string;
  in_force_to?: string;
  selected_status?: string;
}

const VERSION_HREF_RE = /^(\d{8})\.html$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extract the `{yyyymmdd}` version id from a history-page href.
 * Unknown shapes fail loud — a seed must never carry a fabricated identity.
 */
export function versionIdFromHref(href: string): string {
  const match = href.trim().match(VERSION_HREF_RE);
  if (!match) {
    throw new Error(
      `Cannot derive a {yyyymmdd} version id from history href "${href}" — refusing to stamp an unknown version identity`,
    );
  }
  return match[1];
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Reject flag combinations that make a refresh run a guaranteed no-op.
 *
 * Root cause of issue #49: commit 93d63401 ran with
 * `--all-laws --metadata-only --skip-fetch --keep-existing`, which can never
 * re-fetch existing curated seeds, yet exited 0 claiming success.
 */
export function validateFlagCombination(args: CliArgs): void {
  if (!isValidIsoDate(args.asOfDate)) {
    throw new Error(
      `Invalid --as-of date "${args.asOfDate}" — must be YYYY-MM-DD; ` +
      'version selection compares dates lexicographically and would silently misselect otherwise',
    );
  }

  if (!args.allLaws) {
    // Curated mode exists to (re-)fetch the full text of the target statutes.
    if (args.keepExisting) {
      throw new Error(
        'Refusing --keep-existing in curated mode: every existing target seed would be skipped, ' +
        'making this a refresh that fetches nothing (issue #49 root cause). ' +
        'Use --resume to continue an interrupted run.',
      );
    }
    if (args.metadataOnly) {
      throw new Error(
        'Refusing --metadata-only in curated mode: it would replace full-text seeds with empty stubs. ' +
        'Metadata stubs are only valid in catalog breadth mode (--all-laws).',
      );
    }
  }
}

/**
 * Never replace a text-bearing seed with a degraded result.
 * (The Finnish lesson: an empty or shrunken parse is a failure, not new data.)
 *
 * Three gates, in order:
 * 1. zero provisions must never destroy real content;
 * 2. the flat-text fallback (one fabricated `provision_ref: 'text'` provision,
 *    produced when zero `paragraf` divs parse) must never overwrite a
 *    structured seed — it passes gate 1 with count 1, which is exactly the
 *    bypass found in review;
 * 3. a parse that holds fewer than 50% of the existing provisions is treated
 *    as a partial-parse failure, not a legitimate amendment. If a statute
 *    genuinely shrank that much, delete the seed file first — deliberately.
 */
export function assertSeedOverwriteSafe(
  lawId: string,
  next: SeedContentSummary,
  existing: SeedContentSummary | null,
): void {
  if (existing === null || existing.provisions === 0) {
    return;
  }

  if (next.provisions === 0) {
    throw new Error(
      `Refusing to overwrite seed for ${lawId}: existing seed has ${existing.provisions} provisions, ` +
      'replacement parsed to 0. A zero-provision result must never destroy real content.',
    );
  }

  if (next.flatTextOnly && !existing.flatTextOnly) {
    throw new Error(
      `Refusing to overwrite seed for ${lawId}: replacement is a flat-text fallback parse ` +
      `(single fabricated "${FLAT_TEXT_PROVISION_REF}" provision — zero paragraf divs found) but the existing seed ` +
      `holds ${existing.provisions} structured provision(s). A structureless parse must never destroy structure.`,
    );
  }

  if (next.provisions * 2 < existing.provisions) {
    throw new Error(
      `Refusing to overwrite seed for ${lawId}: replacement parsed ${next.provisions} provisions but the ` +
      `existing seed holds ${existing.provisions} — below the 50% shrink gate. A partial parse must not ` +
      'silently destroy content; if the statute genuinely shrank, delete the seed file first.',
    );
  }
}

export type RunOutcome = 'ingested' | 'nothing_new';

/**
 * Separate "the flag combination made this run a guaranteed no-op" (the
 * issue #49 root cause — a CURATED refresh that fetched nothing) from
 * "legitimately nothing new" (breadth mode over an unchanged catalog, or a
 * --resume re-run after a completed run, where reusing every seed is the
 * expected steady state).
 */
export function assertRunEffective(
  counts: { ingested: number; reused: number; requested: number },
  mode: { allLaws: boolean; resume: boolean },
): RunOutcome {
  if (counts.ingested > 0) {
    return 'ingested';
  }

  if ((mode.allLaws || mode.resume) && counts.reused > 0) {
    return 'nothing_new';
  }

  throw new Error(
    `Refresh ingested nothing: 0 of ${counts.requested} requested laws were (re-)ingested ` +
    `(${counts.reused} reused). A curated refresh that fetches nothing accomplished no refresh ` +
    '(issue #49 root cause).',
  );
}

/**
 * Provenance of one fetched-or-cached page: whether it was served from the
 * local cache, when its bytes were actually retrieved from the source, and —
 * for fresh fetches — the final post-redirect URL that served them.
 */
export interface PageProvenance {
  fromCache: boolean;
  retrievedAt: string;
  servedUrl?: string;
}

/**
 * Combine the provenance of the history page and the version page into the
 * stamp-level truth: cached if EITHER page was a cache replay, retrieved at
 * the OLDEST of the two retrieval times (never the newest — a cache replay
 * must not look fresher than its oldest input), served from wherever the
 * version bytes actually came from.
 */
export function combinePageProvenance(
  history: PageProvenance,
  version: PageProvenance,
): PageProvenance {
  return {
    fromCache: history.fromCache || version.fromCache,
    retrievedAt: history.retrievedAt < version.retrievedAt ? history.retrievedAt : version.retrievedAt,
    servedUrl: version.servedUrl,
  };
}

/**
 * Cheap version-currency check: does the version pinned in a seed's _ingest
 * stamp still match what selectHistoryEntry picks from the live history page?
 */
export function isSeedVersionCurrent(stampVersion: string, currentSelectedHref: string): boolean {
  return versionIdFromHref(currentSelectedHref) === stampVersion;
}

export type StampInput =
  | {
      kind: 'fetched_version';
      asOfDate: string;
      version: string;
      versionUrl: string;
      /** Final post-redirect URL that served the version bytes (omit for cache replays). */
      servedUrl?: string;
      inForceFrom: string;
      inForceTo: string;
      selectedStatus: string;
      /** When the page bytes were actually retrieved. Defaults to now (fresh fetch). */
      retrievedAt?: string;
      /** True when the content was replayed from the local cache (--skip-fetch). */
      fromCache?: boolean;
    }
  | {
      kind: 'metadata_stub';
      asOfDate: string;
    };

export function buildIngestStamp(input: StampInput): IngestStamp {
  if (input.kind === 'metadata_stub') {
    return {
      kind: 'metadata_stub',
      source: SLOV_LEX_STATIC_SOURCE,
      retrieved_at: new Date().toISOString(),
      as_of_date: input.asOfDate,
    };
  }

  if (!/^\d{8}$/.test(input.version)) {
    throw new Error(
      `Invalid version identity "${input.version}" for fetched_version stamp — expected {yyyymmdd}`,
    );
  }

  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const retrievedDate = new Date(retrievedAt);
  if (Number.isNaN(retrievedDate.getTime())) {
    throw new Error(
      `Invalid retrievedAt "${input.retrievedAt}" for fetched_version stamp — ` +
      'cache-replay provenance must carry a real retrieval timestamp',
    );
  }

  // The in-force window is compared lexicographically everywhere; a non-ISO
  // shape would silently scramble version selection and currency checks.
  if (!isValidIsoDate(input.inForceFrom)) {
    throw new Error(
      `Invalid in_force_from "${input.inForceFrom}" for fetched_version stamp — must be YYYY-MM-DD`,
    );
  }
  if (input.inForceTo !== '' && !isValidIsoDate(input.inForceTo)) {
    throw new Error(
      `Invalid in_force_to "${input.inForceTo}" for fetched_version stamp — must be YYYY-MM-DD or empty (open-ended)`,
    );
  }

  return {
    kind: 'fetched_version',
    source: SLOV_LEX_STATIC_SOURCE,
    retrieved_at: retrievedAt,
    as_of_date: input.asOfDate,
    version: input.version,
    version_url: input.versionUrl,
    ...(input.servedUrl !== undefined ? { served_url: input.servedUrl } : {}),
    from_cache: input.fromCache ?? false,
    in_force_from: input.inForceFrom,
    in_force_to: input.inForceTo,
    selected_status: input.selectedStatus,
  };
}

/**
 * Atomic JSON write: write to a sibling temp file, then rename over the
 * target. A crash mid-write can never leave a truncated seed behind.
 */
export function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);

  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}
