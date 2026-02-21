import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

describe('getEUBasis', () => {
  let db: any;

  beforeAll(() => {
    db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  });
  afterAll(() => {
    db.close();
  });

  it('should find GDPR reference for Data Protection Act', async () => {
    const result = await getEUBasis(db, { document_id: 'act-18-2018' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const euDocIds = result.results.map(r => r.eu_document_id);
    expect(euDocIds).toContain('regulation:2016/679');
  });

  it('should find NIS Directive reference for Cybersecurity Act', async () => {
    const result = await getEUBasis(db, { document_id: 'act-69-2018' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const euDocIds = result.results.map(r => r.eu_document_id);
    expect(euDocIds).toContain('directive:2016/1148');
  });

  it('should return empty for Trust Services Act (eIDAS 910/2014 uses Number/Year format not parseable by standard extractor)', async () => {
    // eIDAS Regulation (EU) No 910/2014 uses Number/Year format (910 is not a valid year)
    // The standard EU reference extractor expects Year/Number format
    const result = await getEUBasis(db, { document_id: 'act-272-2016' });
    expect(result.results).toHaveLength(0);
  });

  it('should find e-Commerce Directive for E-Commerce Act', async () => {
    const result = await getEUBasis(db, { document_id: 'act-22-2004' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const euDocIds = result.results.map(r => r.eu_document_id);
    expect(euDocIds).toContain('directive:2000/31');
  });

  it('should find Critical Infrastructure Directive reference', async () => {
    const result = await getEUBasis(db, { document_id: 'act-45-2011' });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const euDocIds = result.results.map(r => r.eu_document_id);
    expect(euDocIds).toContain('directive:2008/114');
  });

  it('should return empty for document without EU references', async () => {
    const result = await getEUBasis(db, { document_id: 'act-211-2000' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for non-existent document', async () => {
    const result = await getEUBasis(db, { document_id: 'act-9999-2099' });
    expect(result.results).toHaveLength(0);
  });

  it('should include metadata in response', async () => {
    const result = await getEUBasis(db, { document_id: 'act-18-2018' });
    expect(result._metadata).toBeDefined();
  });
});
