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

export interface ExistingSeedSummary {
  provisions: number;
  definitions: number;
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

function isValidIsoDate(value: string): boolean {
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
 * Never replace a text-bearing seed with a zero-provision result.
 * (The Finnish lesson: an empty parse is a failure, not new data.)
 */
export function assertSeedOverwriteSafe(
  lawId: string,
  newProvisionCount: number,
  existing: ExistingSeedSummary | null,
): void {
  if (newProvisionCount === 0 && existing !== null && existing.provisions > 0) {
    throw new Error(
      `Refusing to overwrite seed for ${lawId}: existing seed has ${existing.provisions} provisions, ` +
      'replacement parsed to 0. A zero-provision result must never destroy real content.',
    );
  }
}

/**
 * A run that ingested nothing must not exit 0 claiming success,
 * regardless of how many existing seeds it reused or skipped.
 */
export function assertRunEffective(ingestedCount: number, requestedCount: number): void {
  if (ingestedCount === 0) {
    throw new Error(
      `Refresh ingested nothing: 0 of ${requestedCount} requested laws were (re-)ingested. ` +
      'The flag combination reused or skipped every target — this run accomplished no refresh.',
    );
  }
}

export type StampInput =
  | {
      kind: 'fetched_version';
      asOfDate: string;
      version: string;
      versionUrl: string;
      inForceFrom: string;
      inForceTo: string;
      selectedStatus: string;
    }
  | {
      kind: 'metadata_stub';
      asOfDate: string;
    };

export function buildIngestStamp(input: StampInput): IngestStamp {
  const base = {
    source: SLOV_LEX_STATIC_SOURCE,
    retrieved_at: new Date().toISOString(),
    as_of_date: input.asOfDate,
  };

  if (input.kind === 'metadata_stub') {
    return { kind: 'metadata_stub', ...base };
  }

  if (!/^\d{8}$/.test(input.version)) {
    throw new Error(
      `Invalid version identity "${input.version}" for fetched_version stamp — expected {yyyymmdd}`,
    );
  }

  return {
    kind: 'fetched_version',
    ...base,
    version: input.version,
    version_url: input.versionUrl,
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
