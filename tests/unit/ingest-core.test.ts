import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  assertRunEffective,
  assertSeedOverwriteSafe,
  atomicWriteJson,
  buildIngestStamp,
  combinePageProvenance,
  isSeedVersionCurrent,
  summarizeProvisions,
  validateFlagCombination,
  versionIdFromHref,
  type CliArgs,
  type SeedContentSummary,
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

describe('summarizeProvisions — flat-text fallback detection', () => {
  it('summarizes an empty provision list', () => {
    expect(summarizeProvisions([])).toEqual({ provisions: 0, flatTextOnly: false });
  });

  it('marks the single fabricated flat-text provision (provision_ref "text")', () => {
    expect(summarizeProvisions([{ provision_ref: 'text' }])).toEqual({ provisions: 1, flatTextOnly: true });
  });

  it('does not mark a single structured provision', () => {
    expect(summarizeProvisions([{ provision_ref: '§1' }])).toEqual({ provisions: 1, flatTextOnly: false });
  });

  it('does not mark multi-provision parses even when one ref is "text"', () => {
    expect(summarizeProvisions([{ provision_ref: 'text' }, { provision_ref: '§2' }]))
      .toEqual({ provisions: 2, flatTextOnly: false });
  });
});

describe('assertSeedOverwriteSafe — never replace real content with nothing', () => {
  function structured(n: number): SeedContentSummary {
    return { provisions: n, flatTextOnly: false };
  }
  const flatText: SeedContentSummary = { provisions: 1, flatTextOnly: true };

  it('allows writing full-text content over a comparable seed', () => {
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(528), structured(527))).not.toThrow();
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(528), null)).not.toThrow();
  });

  it('allows creating a zero-provision stub where no seed exists', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', structured(0), null)).not.toThrow();
  });

  it('allows refreshing a zero-provision stub with another stub', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', structured(0), structured(0))).not.toThrow();
  });

  it('refuses to overwrite a text-bearing seed with a zero-provision result', () => {
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(0), structured(527)))
      .toThrow(/act-300-2005.*527|refus/i);
  });

  it('refuses the flat-text fallback (1 fabricated provision) over a structured seed', () => {
    // Bypass found in review: zero paragraf divs -> flatText fallback fabricates
    // ONE provision (ref "text"), defeating both the zero-provision throw and
    // the overwrite guard. A flat-text-only parse must never overwrite structure.
    expect(() => assertSeedOverwriteSafe('act-300-2005', flatText, structured(528)))
      .toThrow(/flat-text/i);
  });

  it('refuses the flat-text fallback even over a single structured provision', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', flatText, structured(1)))
      .toThrow(/flat-text/i);
  });

  it('allows refreshing a genuinely flat-text seed with another flat-text parse', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', flatText, { provisions: 1, flatTextOnly: true }))
      .not.toThrow();
  });

  it('allows a structured parse to replace a flat-text seed (upgrade)', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', structured(12), { provisions: 1, flatTextOnly: true }))
      .not.toThrow();
  });

  it('allows creating a flat-text seed where no seed exists', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', flatText, null)).not.toThrow();
  });

  it('refuses a shrink below 50% of the held provision count (the Finnish lesson)', () => {
    // 263 * 2 = 526 < 528 -> below half, refuse.
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(263), structured(528)))
      .toThrow(/shrink|50%/i);
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(100), structured(528)))
      .toThrow(/shrink|50%/i);
  });

  it('allows a shrink at exactly 50% of the held count', () => {
    // 264 * 2 = 528 -> exactly half, allowed.
    expect(() => assertSeedOverwriteSafe('act-300-2005', structured(264), structured(528))).not.toThrow();
  });

  it('does not apply the shrink gate when no seed exists', () => {
    expect(() => assertSeedOverwriteSafe('act-1-1945', structured(3), null)).not.toThrow();
  });
});

describe('assertRunEffective — separates "flag no-op" from "legitimately nothing new"', () => {
  const curated = { allLaws: false, resume: false };
  const breadth = { allLaws: true, resume: false };
  const resume = { allLaws: false, resume: true };

  it('reports ingested when at least one law was ingested', () => {
    expect(assertRunEffective({ ingested: 1, reused: 0, requested: 10 }, curated)).toBe('ingested');
    expect(assertRunEffective({ ingested: 3, reused: 7, requested: 10 }, breadth)).toBe('ingested');
  });

  it('throws for a curated run that ingested nothing (the #49 root cause)', () => {
    expect(() => assertRunEffective({ ingested: 0, reused: 0, requested: 10 }, curated))
      .toThrow(/nothing|0/i);
  });

  it('accepts a breadth run on an unchanged catalog as "nothing new"', () => {
    // --all-laws --metadata-only on an unchanged Slov-Lex catalog legitimately
    // ingests 0: every stub already exists. That is not a failed refresh.
    expect(assertRunEffective({ ingested: 0, reused: 38211, requested: 38211 }, breadth))
      .toBe('nothing_new');
  });

  it('accepts a --resume re-run after a completed curated run as "nothing new"', () => {
    expect(assertRunEffective({ ingested: 0, reused: 10, requested: 10 }, resume))
      .toBe('nothing_new');
  });

  it('still throws for a breadth run that neither ingested nor reused anything', () => {
    expect(() => assertRunEffective({ ingested: 0, reused: 0, requested: 0 }, breadth))
      .toThrow(/nothing|0/i);
  });
});

describe('combinePageProvenance — stamp provenance from the pages actually used', () => {
  it('combines two fresh fetches: not cached, earliest retrieval, version page served URL', () => {
    const combined = combinePageProvenance(
      { fromCache: false, retrievedAt: '2026-06-11T10:00:00.000Z' },
      {
        fromCache: false,
        retrievedAt: '2026-06-11T10:00:05.000Z',
        servedUrl: 'https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html',
      },
    );

    expect(combined.fromCache).toBe(false);
    expect(combined.retrievedAt).toBe('2026-06-11T10:00:00.000Z');
    expect(combined.servedUrl).toBe('https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html');
  });

  it('marks the result cached when either page came from cache', () => {
    const historyCached = combinePageProvenance(
      { fromCache: true, retrievedAt: '2026-02-21T00:00:00.000Z' },
      { fromCache: false, retrievedAt: '2026-06-11T10:00:00.000Z', servedUrl: 'https://x.example/v.html' },
    );
    expect(historyCached.fromCache).toBe(true);

    const versionCached = combinePageProvenance(
      { fromCache: false, retrievedAt: '2026-06-11T10:00:00.000Z' },
      { fromCache: true, retrievedAt: '2026-02-21T00:00:00.000Z' },
    );
    expect(versionCached.fromCache).toBe(true);
    expect(versionCached.servedUrl).toBeUndefined();
  });

  it('uses the OLDEST page retrieval time, never the newest', () => {
    // A cache-replay must be stamped with when the bytes were actually
    // retrieved, not when the replay ran.
    const combined = combinePageProvenance(
      { fromCache: true, retrievedAt: '2026-02-21T00:00:00.000Z' },
      { fromCache: true, retrievedAt: '2026-03-01T00:00:00.000Z' },
    );
    expect(combined.retrievedAt).toBe('2026-02-21T00:00:00.000Z');
  });
});

describe('isSeedVersionCurrent — cheap version-currency check for check-updates', () => {
  it('confirms currency when the history selection matches the pinned version', () => {
    expect(isSeedVersionCurrent('20260401', '20260401.html')).toBe(true);
  });

  it('flags an outdated pin when the history selection moved on', () => {
    expect(isSeedVersionCurrent('20260401', '20260612.html')).toBe(false);
  });

  it('fails loud on unparseable history hrefs', () => {
    expect(() => isSeedVersionCurrent('20260401', 'vyhlasene_znenie.html')).toThrow(/version/i);
  });
});

describe('buildIngestStamp', () => {
  function fetchedInput(overrides: Record<string, unknown> = {}) {
    return {
      kind: 'fetched_version' as const,
      asOfDate: '2026-06-11',
      version: '20260401',
      versionUrl: 'https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html',
      inForceFrom: '2026-04-01',
      inForceTo: '2026-06-11',
      selectedStatus: 'in_force',
      ...overrides,
    };
  }

  it('records the selected version identity for fetched versions', () => {
    const stamp = buildIngestStamp(fetchedInput());

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
    // A fresh fetch is explicitly not a cache replay.
    expect(stamp.from_cache).toBe(false);
  });

  it('records metadata stubs without fabricating a version', () => {
    const stamp = buildIngestStamp({ kind: 'metadata_stub', asOfDate: '2026-06-11' });
    expect(stamp.kind).toBe('metadata_stub');
    expect(stamp.version).toBeUndefined();
    expect(stamp.version_url).toBeUndefined();
  });

  it('fails loud when a fetched version stamp is missing its version identity', () => {
    expect(() => buildIngestStamp(fetchedInput({ version: '' }))).toThrow(/version/i);
  });

  it('records the final post-redirect URL that served the bytes (served_url)', () => {
    const stamp = buildIngestStamp(
      fetchedInput({ servedUrl: 'https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html' }),
    );
    expect(stamp.served_url).toBe('https://static.slov-lex.sk/static/SK/ZZ/2005/300/20260401.html');
  });

  it('stamps cache replays with the CACHE retrieval time and from_cache: true', () => {
    // --skip-fetch must not claim retrieved_at = now for months-old cache bytes.
    const stamp = buildIngestStamp(
      fetchedInput({ retrievedAt: '2026-02-21T08:00:00.000Z', fromCache: true }),
    );
    expect(stamp.retrieved_at).toBe('2026-02-21T08:00:00.000Z');
    expect(stamp.from_cache).toBe(true);
  });

  it('rejects an unparseable retrievedAt instead of stamping garbage provenance', () => {
    expect(() => buildIngestStamp(fetchedInput({ retrievedAt: 'yesterday-ish' }))).toThrow(/retriev/i);
  });

  it('rejects a non-ISO in_force_from window (lexicographic comparison would lie)', () => {
    expect(() => buildIngestStamp(fetchedInput({ inForceFrom: '01.04.2026' }))).toThrow(/in_force_from/i);
    expect(() => buildIngestStamp(fetchedInput({ inForceFrom: '' }))).toThrow(/in_force_from/i);
  });

  it('rejects a non-ISO in_force_to but accepts the empty open-ended window', () => {
    expect(() => buildIngestStamp(fetchedInput({ inForceTo: '11.06.2026' }))).toThrow(/in_force_to/i);
    expect(() => buildIngestStamp(fetchedInput({ inForceTo: '2026-13-99' }))).toThrow(/in_force_to/i);
    expect(() => buildIngestStamp(fetchedInput({ inForceTo: '' }))).not.toThrow();
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
