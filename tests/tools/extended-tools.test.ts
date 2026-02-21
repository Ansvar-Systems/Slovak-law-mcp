import { afterAll, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { getAbout } from '../../src/tools/about.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { getSlovakImplementations } from '../../src/tools/get-slovak-implementations.js';
import { listSources } from '../../src/tools/list-sources.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { searchLegislation } from '../../src/tools/search-legislation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

const realDb = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
const ownedDbs: BetterSqlite3.Database[] = [];

function createDb(sql: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(sql);
  ownedDbs.push(db);
  return db;
}

afterAll(() => {
  realDb.close();
  for (const db of ownedDbs) db.close();
});

describe('about + list_sources', () => {
  it('should return about details on real db', () => {
    const about = getAbout(realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00Z',
    });

    expect(about.server).toBe('slovak-law-mcp');
    expect(about.database.capabilities.length).toBeGreaterThan(0);
    expect(about.statistics.documents).toBeGreaterThan(0);
  });

  it('should tolerate missing tables in about/list_sources', async () => {
    const db = createDb('CREATE TABLE db_metadata (key TEXT, value TEXT);');
    const about = getAbout(db as never, { version: '1', fingerprint: 'x', dbBuilt: 'y' });
    expect(about.statistics.documents).toBe(0);

    const sources = await listSources(db as never);
    expect(sources.results.database.document_count).toBe(0);
    expect(sources.results.database.provision_count).toBe(0);
  });
});

describe('build_legal_stance', () => {
  it('should return empty for blank queries', async () => {
    const result = await buildLegalStance(realDb as never, { query: '   ' });
    expect(result.results).toHaveLength(0);
  });

  it('should search and filter by document id', async () => {
    const all = await buildLegalStance(realDb as never, { query: 'osobných údajov', limit: 3 });
    expect(all.results.length).toBeGreaterThanOrEqual(1);

    const filtered = await buildLegalStance(realDb as never, {
      query: 'osobných údajov',
      document_id: 'act-18-2018',
      limit: 3,
    });
    expect(filtered.results.length).toBeGreaterThanOrEqual(1);
    filtered.results.forEach(row => expect(row.document_id).toBe('act-18-2018'));
  });

  it('should handle fts errors and return empty', async () => {
    const throwingDb = {
      prepare: () => ({ all: () => { throw new Error('fts error'); } }),
    };

    const result = await buildLegalStance(throwingDb as never, { query: 'something' });
    expect(result.results).toHaveLength(0);
  });
});

describe('check_currency', () => {
  it('should handle unknown, repealed, and not-yet-in-force documents', async () => {
    const missing = await checkCurrency(realDb as never, { document_id: 'missing-law' });
    expect(missing.results.status).toBe('not_found');

    const repealed = await checkCurrency(realDb as never, { document_id: 'act-45-2011' });
    expect(repealed.results.status).toBe('repealed');
    expect(repealed.results.warnings.join(' ')).toContain('repealed');

    const db = createDb(`
      CREATE TABLE legal_documents (
        id TEXT,
        title TEXT,
        short_name TEXT,
        title_en TEXT,
        status TEXT,
        issued_date TEXT,
        in_force_date TEXT
      );
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('future-law', 'Future Law', 'FL', 'Future Law', 'not_yet_in_force', '2030-01-01', '2031-01-01');
    `);

    const notYet = await checkCurrency(db as never, { document_id: 'future-law' });
    expect(notYet.results.status).toBe('not_yet_in_force');
    expect(notYet.results.warnings.join(' ')).toContain('not yet entered into force');
  });
});

describe('format_citation', () => {
  it('should format section-first and section-last citations in all modes', async () => {
    const full = await formatCitationTool({ citation: 'Section 13 Privacy Act 1988', format: 'full' });
    expect(full.formatted).toBe('Section 13, Privacy Act 1988');

    const short = await formatCitationTool({ citation: 'Privacy Act 1988 s 13', format: 'short' });
    expect(short.formatted).toBe('Privacy Act 1988 s 13');

    const pinpoint = await formatCitationTool({ citation: 'Privacy Act 1988 Section 13', format: 'pinpoint' });
    expect(pinpoint.formatted).toBe('s 13');

    const noSection = await formatCitationTool({ citation: 'Privacy Act 1988' });
    expect(noSection.formatted).toBe('Privacy Act 1988');

    const shortNoSection = await formatCitationTool({ citation: 'Privacy Act 1988', format: 'short' });
    expect(shortNoSection.formatted).toBe('Privacy Act 1988');

    const pinpointNoSection = await formatCitationTool({ citation: 'Privacy Act 1988', format: 'pinpoint' });
    expect(pinpointNoSection.formatted).toBe('Privacy Act 1988');
  });
});

describe('eu basis tools', () => {
  it('should return per-provision eu basis and no-result paths', async () => {
    const found = await getProvisionEUBasis(realDb as never, { document_id: 'act-18-2018', provision_ref: '§104' });
    expect(found.results.length).toBeGreaterThanOrEqual(1);

    const none = await getProvisionEUBasis(realDb as never, { document_id: 'act-18-2018', provision_ref: '§9999' });
    expect(none.results).toHaveLength(0);

    const missingDoc = await getProvisionEUBasis(realDb as never, { document_id: 'missing', provision_ref: '§1' });
    expect(missingDoc.results).toHaveLength(0);
  });

  it('should return tier note when eu tables are unavailable', async () => {
    const db = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT);
      CREATE TABLE legal_provisions (id INTEGER, document_id TEXT, provision_ref TEXT, section TEXT);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('doc-1', 'Doc One', 'D1', 'Doc One');
      INSERT INTO legal_provisions VALUES (1, 'doc-1', '§1', '1');
    `);

    const provision = await getProvisionEUBasis(db as never, { document_id: 'doc-1', provision_ref: '§1' });
    expect((provision._metadata as Record<string, string>).note).toContain('not available');

    const basis = await getEUBasis(db as never, { document_id: 'doc-1' });
    expect((basis._metadata as Record<string, string>).note).toContain('not available');
  });

  it('should support get_eu_basis filters and include_articles', async () => {
    const result = await getEUBasis(realDb as never, {
      document_id: 'act-18-2018',
      include_articles: true,
      reference_types: ['implements'],
    });

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results.every(r => r.reference_type === 'implements')).toBe(true);
    expect(Array.isArray(result.results[0].articles)).toBe(true);
  });

  it('should resolve unknown document to empty result', async () => {
    const result = await getEUBasis(realDb as never, { document_id: 'does-not-exist' });
    expect(result.results).toHaveLength(0);
  });

  it('should search and filter EU implementation mappings', async () => {
    const byDoc = await getSlovakImplementations(realDb as never, {
      eu_document_id: 'regulation:2016/679',
      primary_only: true,
      in_force_only: true,
    });

    expect(byDoc.results.length).toBeGreaterThanOrEqual(1);
    byDoc.results.forEach(r => {
      expect(r.is_primary).toBeTruthy();
      expect(r.status).toBe('in_force');
    });

    const euSearch = await searchEUImplementations(realDb as never, {
      query: 'Regulation',
      type: 'regulation',
      year_from: 1990,
      year_to: 2030,
      has_slovak_implementation: true,
      limit: 500,
    });
    expect(euSearch.results.length).toBeGreaterThanOrEqual(1);
    expect(euSearch.results.length).toBeLessThanOrEqual(100);
  });

  it('should return eu-tier notes when eu tables do not exist', async () => {
    const db = createDb('CREATE TABLE db_metadata (key TEXT, value TEXT);');

    const impl = await getSlovakImplementations(db as never, { eu_document_id: 'regulation:2016/679' });
    expect((impl._metadata as Record<string, string>).note).toContain('not available');

    const euSearch = await searchEUImplementations(db as never, { query: 'GDPR' });
    expect((euSearch._metadata as Record<string, string>).note).toContain('not available');
  });
});

describe('validate_citation', () => {
  it('should validate multiple citation syntaxes and default document-only citation', async () => {
    const sectionFirst = await validateCitationTool(realDb as never, { citation: 'Section 1, act-18-2018' });
    expect(sectionFirst.results.valid).toBe(true);

    const sectionLast = await validateCitationTool(realDb as never, { citation: 'act-18-2018 s 1' });
    expect(sectionLast.results.valid).toBe(true);

    const sectionWordLast = await validateCitationTool(realDb as never, { citation: 'act-18-2018 Section 1' });
    expect(sectionWordLast.results.valid).toBe(true);

    const documentOnly = await validateCitationTool(realDb as never, { citation: 'act-18-2018' });
    expect(documentOnly.results.valid).toBe(true);
  });

  it('should return warnings/errors for missing docs, missing provisions, repealed, and amended', async () => {
    const missing = await validateCitationTool(realDb as never, { citation: 'Section 1 Missing Act' });
    expect(missing.results.valid).toBe(false);
    expect(missing.results.warnings.join(' ')).toContain('Document not found');

    const missingProvision = await validateCitationTool(realDb as never, { citation: 'Section 9999 act-18-2018' });
    expect(missingProvision.results.valid).toBe(false);
    expect(missingProvision.results.warnings.join(' ')).toContain('not found');

    const repealed = await validateCitationTool(realDb as never, { citation: 'act-45-2011' });
    expect(repealed.results.warnings.join(' ')).toContain('repealed');

    const amendedDb = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE legal_provisions (id INTEGER, document_id TEXT, provision_ref TEXT, section TEXT, title TEXT, content TEXT, chapter TEXT);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('amended-act', 'Amended Act', 'AA', 'Amended Act', 'amended');
      INSERT INTO legal_provisions VALUES (1, 'amended-act', '§1', '1', 's1', 'text', NULL);
    `);

    const amended = await validateCitationTool(amendedDb as never, { citation: 'Section 1 Amended Act' });
    expect(amended.results.valid).toBe(true);
    expect(amended.results.warnings.join(' ')).toContain('amended');
  });
});

describe('validate_eu_compliance', () => {
  it('should handle not-found and missing-eu-table scenarios', async () => {
    const missingDoc = await validateEUCompliance(realDb as never, { document_id: 'missing-law' });
    expect(missingDoc.results.compliance_status).toBe('not_applicable');

    const db = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('doc-1', 'Doc', 'D', 'Doc', 'in_force');
    `);

    const missingEu = await validateEUCompliance(db as never, { document_id: 'doc-1' });
    expect(missingEu.results.compliance_status).toBe('not_applicable');
    expect(missingEu.results.warnings.join(' ')).toContain('not available');
  });

  it('should report no-eu-reference path', async () => {
    const noRefs = await validateEUCompliance(realDb as never, { document_id: 'act-22-2004', eu_document_id: 'regulation:2016/679' });
    expect(noRefs.results.compliance_status).toBe('not_applicable');
    expect(noRefs.results.recommendations.join(' ')).toContain('No EU cross-references');
  });

  it('should report compliant, partial, and unclear statuses', async () => {
    const compliantDb = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE eu_references (document_id TEXT, eu_document_id TEXT, implementation_status TEXT, is_primary_implementation INTEGER);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('c1', 'Compliant Doc', 'C1', 'Compliant Doc', 'in_force');
      INSERT INTO eu_references VALUES ('c1', 'regulation:2016/679', 'complete', 1);
    `);
    const compliant = await validateEUCompliance(compliantDb as never, { document_id: 'c1' });
    expect(compliant.results.compliance_status).toBe('compliant');

    const partialDb = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE eu_references (document_id TEXT, eu_document_id TEXT, implementation_status TEXT, is_primary_implementation INTEGER);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('p1', 'Partial Doc', 'P1', 'Partial Doc', 'repealed');
      INSERT INTO eu_references VALUES ('p1', 'directive:2022/2555', 'partial', 0);
    `);
    const partial = await validateEUCompliance(partialDb as never, { document_id: 'p1' });
    expect(partial.results.compliance_status).toBe('partial');
    expect(partial.results.warnings.join(' ')).toContain('repealed');

    const unclearDb = createDb(`
      CREATE TABLE legal_documents (id TEXT, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE eu_references (document_id TEXT, eu_document_id TEXT, implementation_status TEXT, is_primary_implementation INTEGER);
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO legal_documents VALUES ('u1', 'Unclear Doc', 'U1', 'Unclear Doc', 'in_force');
      INSERT INTO eu_references VALUES ('u1', 'directive:2016/680', 'unknown', 0);
    `);
    const unclear = await validateEUCompliance(unclearDb as never, { document_id: 'u1' });
    expect(unclear.results.compliance_status).toBe('unclear');
    expect(unclear.results.recommendations.join(' ')).toContain('unknown alignment status');
  });
});

describe('extra search branches', () => {
  it('should apply status filter in search_legislation', async () => {
    const result = await searchLegislation(realDb as never, {
      query: 'osobných údajov',
      status: 'in_force',
      limit: 2,
    });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('should swallow fts errors and return empty', async () => {
    const db = createDb('CREATE TABLE db_metadata (key TEXT, value TEXT);');
    const result = await searchLegislation(db as never, { query: 'query' });
    expect(result.results).toEqual([]);
  });

  it('should map undefined urls to undefined in get_provision results', async () => {
    const db = createDb(`
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      CREATE TABLE legal_documents (
        id TEXT,
        title TEXT,
        short_name TEXT,
        title_en TEXT,
        status TEXT,
        issued_date TEXT,
        in_force_date TEXT,
        url TEXT
      );
      CREATE TABLE legal_provisions (
        id INTEGER,
        document_id TEXT,
        provision_ref TEXT,
        chapter TEXT,
        section TEXT,
        title TEXT,
        content TEXT
      );
      INSERT INTO legal_documents VALUES ('doc-null-url', 'Doc Null URL', 'DNU', 'Doc Null URL', 'in_force', NULL, NULL, NULL);
      INSERT INTO legal_provisions VALUES (1, 'doc-null-url', '§1', NULL, '1', 'One', 'Provision one');
      INSERT INTO legal_provisions VALUES (2, 'doc-null-url', '§2', NULL, '2', 'Two', 'Provision two');
    `);

    const { getProvision } = await import('../../src/tools/get-provision.js');

    const single = await getProvision(db as never, { document_id: 'doc-null-url', provision_ref: '§1' });
    expect(single.results[0].url).toBeUndefined();

    const all = await getProvision(db as never, { document_id: 'doc-null-url' });
    expect(all.results.length).toBe(2);
    expect(all.results.every(r => r.url === undefined)).toBe(true);
  });
});
