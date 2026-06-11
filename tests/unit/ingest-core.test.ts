import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  assertRunEffective,
  assertSeedOverwriteSafe,
  atomicWriteJson,
  buildIngestStamp,
  validateFlagCombination,
  versionIdFromHref,
  type CliArgs,
} from '../../scripts/lib/ingest-core.js';

function args(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    limit: null,
    skipFetch: false,
    asOfDate: '2026-06-11',
    allLaws: false,
    lawsOnly: false,
    metadataOnly: false,
    keepExisting: false,
    resume: false,
    ...overrides,
  };
}

describe('versionIdFromHref', () => {
  it('extracts the yyyymmdd version id from a history href', () => {
    expect(versionIdFromHref('20260401.html')).toBe('20260401');
  });

  it('fails loud on the promulgated entry href', () => {
    expect(() => versionIdFromHref('vyhlasene_znenie.html')).toThrow(/version/i);
  });

  it('fails loud on unknown href shapes', () => {
    expect(() => versionIdFromHref('index.html')).toThrow(/version/i);
    expect(() => versionIdFromHref('2026.html')).toThrow(/version/i);
    expect(() => versionIdFromHref('')).toThrow(/version/i);
  });
});

describe('validateFlagCombination — the issue #49 root-cause guard', () => {
  it('accepts the default curated refresh', () => {
    expect(() => validateFlagCombination(args())).not.toThrow();
  });

  it('rejects --keep-existing in curated mode (refresh that cannot refresh)', () => {
    // Root cause of #49: flags that mean "nothing will be fetched" exited 0
    // claiming success. In curated mode every target seed already exists, so
    // --keep-existing guarantees a no-op refresh.
    expect(() => validateFlagCombination(args({ keepExisting: true }))).toThrow(/keep-existing/);
  });

  it('rejects --metadata-only in curated mode (would replace full text with stubs)', () => {
    expect(() => validateFlagCombination(args({ metadataOnly: true }))).toThrow(/metadata-only/);
  });

  it('accepts the breadth mode (--all-laws --metadata-only) which forces keep-existing', () => {
    expect(() =>
      validateFlagCombination(args({ allLaws: true, metadataOnly: true, keepExisting: true })),
    ).not.toThrow();
  });

  it('accepts --resume for interrupted curated runs', () => {
    expect(() => validateFlagCombination(args({ resume: true }))).not.toThrow();
  });

  it('rejects a malformed --as-of date instead of silently misselecting versions', () => {
    // Version selection compares dates lexicographically; a non-ISO as-of
    // date would silently select the wrong version.
    expect(() => validateFlagCombination(args({ asOfDate: '11.06.2026' }))).toThrow(/as-of/i);
    expect(() => validateFlagCombination(args({ asOfDate: 'garbage' }))).toThrow(/as-of/i);
    expect(() => validateFlagCombination(args({ asOfDate: '2026-13-99' }))).toThrow(/as-of/i);
  });
});

describe('assertSeedOverwriteSafe — never replace real content with nothing', () => {
  it('allows writing full-text content over anything', () => {
    expect(() => assertSeedOverwriteSafe('act-300-2005', 528, { provisions: 527, definitions: 0 })).not.toThrow();
    expect(() => assertSeedOverwriteSafe('act-300-2005', 528, null)).not.toThrow();
  });

  it('allows creating a zero-provision stub where no seed exists', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', 0, null)).not.toThrow();
  });

  it('allows refreshing a zero-provision stub with another stub', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', 0, { provisions: 0, definitions: 0 })).not.toThrow();
  });

  it('refuses to overwrite a text-bearing seed with a zero-provision result', () => {
    expect(() => assertSeedOverwriteSafe('act-300-2005', 0, { provisions: 527, definitions: 0 }))
      .toThrow(/act-300-2005.*527|refus/i);
  });
});

describe('assertRunEffective — a run that ingests nothing must not exit 0', () => {
  it('passes when at least one law was ingested', () => {
    expect(() => assertRunEffective(1, 10)).not.toThrow();
  });

  it('throws when zero laws were ingested, even if seeds were reused', () => {
    expect(() => assertRunEffective(0, 10)).toThrow(/nothing|0/i);
  });
});

describe('buildIngestStamp', () => {
  it('records the selected version identity for fetched versions', () => {
    const stamp = buildIngestStamp({
      kind: 'fetched_version',
      asOfDate: '2026-06-11',
      version: '20260401',
      versionUrl: 'https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html',
      inForceFrom: '2026-04-01',
      inForceTo: '2026-06-11',
      selectedStatus: 'in_force',
    });

    expect(stamp.kind).toBe('fetched_version');
    expect(stamp.version).toBe('20260401');
    expect(stamp.version_url).toContain('20260401.html');
    expect(stamp.in_force_from).toBe('2026-04-01');
    expect(stamp.in_force_to).toBe('2026-06-11');
    expect(stamp.selected_status).toBe('in_force');
    expect(stamp.as_of_date).toBe('2026-06-11');
    expect(stamp.source).toBe('https://static.slov-lex.sk/static/SK/ZZ/');
    // retrieved_at must be a real ISO timestamp.
    expect(new Date(stamp.retrieved_at).toISOString()).toBe(stamp.retrieved_at);
  });

  it('records metadata stubs without fabricating a version', () => {
    const stamp = buildIngestStamp({ kind: 'metadata_stub', asOfDate: '2026-06-11' });
    expect(stamp.kind).toBe('metadata_stub');
    expect(stamp.version).toBeUndefined();
    expect(stamp.version_url).toBeUndefined();
  });

  it('fails loud when a fetched version stamp is missing its version identity', () => {
    expect(() =>
      buildIngestStamp({
        kind: 'fetched_version',
        asOfDate: '2026-06-11',
        version: '',
        versionUrl: 'https://example.invalid/x.html',
        inForceFrom: '2026-04-01',
        inForceTo: '',
        selectedStatus: 'in_force',
      }),
    ).toThrow(/version/i);
  });
});

describe('atomicWriteJson', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-core-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('writes parseable JSON and leaves no temp files behind', () => {
    const dir = tmpDir();
    const target = path.join(dir, 'seed.json');

    atomicWriteJson(target, { id: 'act-300-2005', provisions: [1, 2, 3] });

    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
    expect(parsed.id).toBe('act-300-2005');
    expect(fs.readdirSync(dir)).toEqual(['seed.json']);
  });

  it('replaces an existing file in one step', () => {
    const dir = tmpDir();
    const target = path.join(dir, 'seed.json');
    fs.writeFileSync(target, JSON.stringify({ old: true }));

    atomicWriteJson(target, { old: false });

    expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual({ old: false });
    expect(fs.readdirSync(dir)).toEqual(['seed.json']);
  });
});
