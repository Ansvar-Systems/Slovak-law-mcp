import { describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

vi.mock('../../src/utils/statute-id.js', () => ({
  resolveDocumentId: vi.fn(() => 'ghost-doc'),
}));

import { getProvision } from '../../src/tools/get-provision.js';

describe('getProvision edge branch coverage', () => {
  it('should return empty when resolver returns id but document row is missing', async () => {
    const db = new BetterSqlite3(':memory:');
    db.exec(`
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      CREATE TABLE legal_documents (id TEXT, title TEXT, url TEXT);
    `);

    const result = await getProvision(db as never, { document_id: 'anything' });
    expect(result.results).toEqual([]);

    db.close();
  });
});
