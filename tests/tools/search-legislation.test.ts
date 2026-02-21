import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { searchLegislation } from '../../src/tools/search-legislation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

describe('searchLegislation', () => {
  let db: any;

  beforeAll(() => {
    db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  });
  afterAll(() => {
    db.close();
  });

  it('should find provisions about personal data', async () => {
    const result = await searchLegislation(db, { query: 'personal data' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const allSnippets = result.results.map(r => r.snippet.toLowerCase()).join(' ');
    expect(allSnippets).toContain('personal data');
  });

  it('should find provisions about cybersecurity', async () => {
    const result = await searchLegislation(db, { query: 'cybersecurity' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about critical infrastructure', async () => {
    const result = await searchLegislation(db, { query: 'critical infrastructure' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about trade secret', async () => {
    const result = await searchLegislation(db, { query: 'trade secret' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about electronic signature', async () => {
    const result = await searchLegislation(db, { query: 'electronic signature' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty for gibberish query', async () => {
    const result = await searchLegislation(db, { query: 'xyzzyflurble99' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for empty query', async () => {
    const result = await searchLegislation(db, { query: '' });
    expect(result.results).toHaveLength(0);
  });

  it('should respect limit parameter', async () => {
    const result = await searchLegislation(db, { query: 'security', limit: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('should filter by document_id', async () => {
    const result = await searchLegislation(db, { query: 'security', document_id: 'act-69-2018' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    result.results.forEach(r => {
      expect(r.document_id).toBe('act-69-2018');
    });
  });

  it('should include metadata in response', async () => {
    const result = await searchLegislation(db, { query: 'data' });
    expect(result._metadata).toBeDefined();
  });
});
