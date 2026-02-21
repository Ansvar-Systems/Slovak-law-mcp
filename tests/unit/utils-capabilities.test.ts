import { afterEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import {
  DB_ENV_VAR,
  PACKAGE_NAME,
  REPOSITORY_URL,
  SERVER_LABEL,
  SERVER_NAME,
  SERVER_VERSION,
} from '../../src/constants.js';
import { detectCapabilities, readDbMetadata, upgradeMessage } from '../../src/capabilities.js';
import { normalizeAsOfDate } from '../../src/utils/as-of-date.js';
import { buildFtsQueryVariants, sanitizeFtsInput } from '../../src/utils/fts-query.js';
import { generateResponseMetadata } from '../../src/utils/metadata.js';
import { resolveDocumentId } from '../../src/utils/statute-id.js';

const openDbs: BetterSqlite3.Database[] = [];

function memoryDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  openDbs.push(db);
  return db;
}

afterEach(() => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    db?.close();
  }
});

describe('constants', () => {
  it('should expose stable server constants', () => {
    expect(SERVER_NAME).toBe('slovak-law-mcp');
    expect(SERVER_VERSION).toBe('1.0.0');
    expect(SERVER_LABEL).toBe('Slovak Law MCP');
    expect(PACKAGE_NAME).toBe('@ansvar/slovak-law-mcp');
    expect(REPOSITORY_URL).toContain('Slovak-law-mcp');
    expect(DB_ENV_VAR).toBe('SLOVAK_LAW_DB_PATH');
  });
});

describe('capabilities + metadata', () => {
  it('should detect all declared capabilities when required tables exist', () => {
    const db = memoryDb();
    db.exec(`
      CREATE TABLE legal_documents (id TEXT);
      CREATE TABLE legal_provisions (id INTEGER);
      CREATE VIRTUAL TABLE provisions_fts USING fts5(content);
      CREATE TABLE eu_documents (id TEXT);
      CREATE TABLE eu_references (id INTEGER);
      CREATE TABLE case_law (id TEXT);
      CREATE TABLE preparatory_works (id TEXT);
    `);

    const caps = detectCapabilities(db as never);
    expect(caps.has('core_legislation')).toBe(true);
    expect(caps.has('eu_references')).toBe(true);
    expect(caps.has('case_law')).toBe(true);
    expect(caps.has('preparatory_works')).toBe(true);
  });

  it('should return metadata defaults when db_metadata table is missing', () => {
    const db = memoryDb();
    const meta = readDbMetadata(db as never);

    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1.0');
    expect(meta.built_at).toBeUndefined();
    expect(meta.builder).toBeUndefined();
  });

  it('should read metadata rows when db_metadata exists', () => {
    const db = memoryDb();
    db.exec('CREATE TABLE db_metadata (key TEXT, value TEXT)');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('tier', 'pro');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('schema_version', '2');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('built_at', '2026-02-20T00:00:00Z');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('builder', 'unit-test');

    const meta = readDbMetadata(db as never);
    expect(meta.tier).toBe('pro');
    expect(meta.schema_version).toBe('2');
    expect(meta.built_at).toBe('2026-02-20T00:00:00Z');
    expect(meta.builder).toBe('unit-test');
  });

  it('should build upgrade message with feature name', () => {
    expect(upgradeMessage('eu_references')).toContain('eu_references');
    expect(upgradeMessage('eu_references')).toContain('professional-tier');
  });
});

describe('as-of date normalization', () => {
  it('should normalize valid ISO, parseable text dates, and reject invalid values', () => {
    expect(normalizeAsOfDate()).toBeNull();
    expect(normalizeAsOfDate('   ')).toBeNull();
    expect(normalizeAsOfDate('2026-02-21')).toBe('2026-02-21');
    expect(normalizeAsOfDate('2026-02-20T00:00:00Z')).toBe('2026-02-20');
    expect(normalizeAsOfDate('not-a-date')).toBeNull();
  });
});

describe('fts helpers', () => {
  it('should sanitize dangerous fts tokens', () => {
    expect(sanitizeFtsInput(`"a" (b) c* d'`)).toBe('a b c d');
  });

  it('should return no variants for empty search', () => {
    expect(buildFtsQueryVariants('')).toEqual([]);
    expect(buildFtsQueryVariants('   ')).toEqual([]);
  });

  it('should build single-word and multi-word variants', () => {
    expect(buildFtsQueryVariants('privacy')).toEqual(['privacy', 'privacy*']);
    expect(buildFtsQueryVariants('ab')).toEqual(['ab']);
    expect(buildFtsQueryVariants('data protection')).toEqual([
      '"data protection"',
      'data AND protection',
      'data AND protection*',
    ]);
  });
});

describe('response metadata', () => {
  it('should include freshness when built_at exists', () => {
    const db = memoryDb();
    db.exec('CREATE TABLE db_metadata (key TEXT, value TEXT)');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('built_at', '2026-02-21T00:00:00Z');

    const meta = generateResponseMetadata(db as never);
    expect(meta.jurisdiction).toBe('SK');
    expect(meta.freshness).toBe('2026-02-21T00:00:00Z');
  });

  it('should gracefully omit freshness when db_metadata is missing', () => {
    const db = memoryDb();
    const meta = generateResponseMetadata(db as never);
    expect(meta.freshness).toBeUndefined();
  });
});

describe('document id resolver', () => {
  it('should resolve direct id, fuzzy title_en, lowercase fallback, and no match', () => {
    const db = memoryDb();
    db.pragma('case_sensitive_like = ON');
    db.exec(`
      CREATE TABLE legal_documents (
        id TEXT,
        title TEXT,
        short_name TEXT,
        title_en TEXT
      );
    `);

    db.prepare('INSERT INTO legal_documents (id, title, short_name, title_en) VALUES (?, ?, ?, ?)').run(
      'act-1',
      'Alpha Law',
      'ALPHA',
      'Alpha Law',
    );

    expect(resolveDocumentId(db as never, 'act-1')).toBe('act-1');
    expect(resolveDocumentId(db as never, 'Alpha Law')).toBe('act-1');
    expect(resolveDocumentId(db as never, 'alpha law')).toBe('act-1');
    expect(resolveDocumentId(db as never, '   ')).toBeNull();
    expect(resolveDocumentId(db as never, 'missing')).toBeNull();
  });
});
