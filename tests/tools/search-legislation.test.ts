import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { searchLegislation } from '../../src/tools/search-legislation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');
const DB_EXISTS = fs.existsSync(DB_PATH);

describe.skipIf(!DB_EXISTS)('searchLegislation', () => {
  let db: any;

  beforeAll(() => {
    db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  });
  afterAll(() => {
    db.close();
  });

  it('should find provisions about personal data', async () => {
    const result = await searchLegislation(db, { query: 'osobných údajov' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const allSnippets = result.results.map(r => r.snippet.toLowerCase()).join(' ');
    expect(allSnippets).toContain('osobných údajov');
  });

  it('should find provisions about cybersecurity', async () => {
    const result = await searchLegislation(db, { query: 'kybernetickej bezpečnosti' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about critical infrastructure', async () => {
    const result = await searchLegislation(db, { query: 'kritickej infraštruktúry' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about trade secret', async () => {
    const result = await searchLegislation(db, { query: 'obchodné tajomstvo' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should find provisions about electronic signature', async () => {
    const result = await searchLegislation(db, { query: 'elektronických podpisov' });
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
    const result = await searchLegislation(db, { query: 'bezpečnosť', limit: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('should filter by document_id', async () => {
    const result = await searchLegislation(db, { query: 'kybernetickej', document_id: 'act-69-2018' });
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
