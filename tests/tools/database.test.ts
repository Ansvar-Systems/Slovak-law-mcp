import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

describe('Slovak Law database integrity', () => {
  let db: any;

  beforeAll(() => {
    db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  });
  afterAll(() => {
    db.close();
  });

  it('should have 10 legal documents', () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM legal_documents').get() as { cnt: number };
    expect(count.cnt).toBe(10);
  });

  it('should have at least 150 provisions', () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThanOrEqual(150);
  });

  it('should have definitions', () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM definitions').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThanOrEqual(20);
  });

  it('should have EU documents', () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM eu_documents').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThanOrEqual(5);
  });

  it('should have EU references', () => {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM eu_references').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThanOrEqual(10);
  });

  it('should have jurisdiction metadata set to SK', () => {
    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'jurisdiction'").get() as { value: string };
    expect(row.value).toBe('SK');
  });

  it('should have schema_version 2', () => {
    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'schema_version'").get() as { value: string };
    expect(row.value).toBe('2');
  });

  it('should use DELETE journal mode (WASM compatible)', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('delete');
  });

  it('should have all 10 expected documents', () => {
    const docs = db.prepare('SELECT id FROM legal_documents ORDER BY id').all() as { id: string }[];
    const ids = docs.map(d => d.id);
    expect(ids).toContain('act-18-2018');
    expect(ids).toContain('act-69-2018');
    expect(ids).toContain('act-452-2021');
    expect(ids).toContain('act-22-2004');
    expect(ids).toContain('act-211-2000');
    expect(ids).toContain('act-272-2016');
    expect(ids).toContain('act-300-2005');
    expect(ids).toContain('act-95-2019');
    expect(ids).toContain('act-45-2011');
    expect(ids).toContain('act-513-1991');
  });

  it('should have FTS index populated', () => {
    const result = db.prepare("SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'cybersecurity'").get() as { cnt: number };
    expect(result.cnt).toBeGreaterThanOrEqual(1);
  });

  it('should have slov-lex.sk URLs for all documents', () => {
    const docs = db.prepare('SELECT url FROM legal_documents').all() as { url: string }[];
    docs.forEach(d => {
      expect(d.url).toContain('slov-lex.sk');
    });
  });
});
