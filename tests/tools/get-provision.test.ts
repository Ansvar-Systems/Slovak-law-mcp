import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getProvision } from '../../src/tools/get-provision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

describe('getProvision', () => {
  let db: any;

  beforeAll(() => {
    db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
  });
  afterAll(() => {
    db.close();
  });

  it('should retrieve Data Protection Act §1', async () => {
    const result = await getProvision(db, { document_id: 'act-18-2018', provision_ref: '§1' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toContain('Tento zákon upravuje');
    expect(result.results[0].content).toContain('osobných údajov');
    expect(result.results[0].provision_ref).toBe('§1');
  });

  it('should retrieve Cybersecurity Act §1', async () => {
    const result = await getProvision(db, { document_id: 'act-69-2018', provision_ref: '§1' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toContain('kybernetickej bezpečnosti');
    expect(result.results[0].content).toContain('bezpečnostné opatrenia');
  });

  it('should retrieve Criminal Code §247 (unauthorized access)', async () => {
    const result = await getProvision(db, { document_id: 'act-300-2005', provision_ref: '§247' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toContain('počítačového systému');
    expect(result.results[0].content).toContain('Odňatím slobody');
  });

  it('should retrieve Commercial Code §17 (trade secret)', async () => {
    const result = await getProvision(db, { document_id: 'act-513-1991', provision_ref: '§17' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toContain('obchodné tajomstvo');
  });

  it('should retrieve Freedom of Information Act §1', async () => {
    const result = await getProvision(db, { document_id: 'act-211-2000', provision_ref: '§1' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toContain('slobodného prístupu k informáciám');
  });

  it('should retrieve all provisions for a document when no ref given', async () => {
    const result = await getProvision(db, { document_id: 'act-22-2004' });
    expect(result.results.length).toBeGreaterThanOrEqual(10);
    expect(result.results[0].document_id).toBe('act-22-2004');
  });

  it('should return empty for non-existent document', async () => {
    const result = await getProvision(db, { document_id: 'act-9999-2099', provision_ref: '§1' });
    expect(result.results).toHaveLength(0);
  });

  it('should return empty for non-existent provision', async () => {
    const result = await getProvision(db, { document_id: 'act-18-2018', provision_ref: '§999ZZZ' });
    expect(result.results).toHaveLength(0);
  });

  it('should resolve document by title_en via fuzzy match', async () => {
    const result = await getProvision(db, { document_id: 'Data Protection Act', provision_ref: '§1' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].document_id).toBe('act-18-2018');
  });

  it('should include URL from slov-lex.sk', async () => {
    const result = await getProvision(db, { document_id: 'act-18-2018', provision_ref: '§5' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].url).toContain('slov-lex.sk');
  });

  it('should include metadata in response', async () => {
    const result = await getProvision(db, { document_id: 'act-18-2018', provision_ref: '§1' });
    expect(result._metadata).toBeDefined();
  });
});
