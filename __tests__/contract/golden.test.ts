/**
 * Golden contract tests for Slovak Law MCP.
 *
 * These tests run the assertions defined in fixtures/golden-tests.json
 * against the actual tool implementations. They require the production
 * database (data/database.db) to be present.
 *
 * Skipped automatically in CI where the DB is not shipped.
 */
import { afterAll, describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import BetterSqlite3 from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.resolve(ROOT, 'data/database.db');
const FIXTURES_PATH = path.resolve(ROOT, 'fixtures/golden-tests.json');

const DB_EXISTS = fs.existsSync(DB_PATH);
const FIXTURES_EXIST = fs.existsSync(FIXTURES_PATH);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoldenTestAssertions {
  result_not_empty?: boolean;
  text_contains?: string[];
  any_result_contains?: string[];
  fields_present?: string[];
  text_not_empty?: boolean;
  min_results?: number;
  citation_url_pattern?: string;
  handles_gracefully?: boolean;
}

interface GoldenTest {
  id: string;
  category: string;
  description: string;
  tool: string;
  input: Record<string, unknown>;
  assertions: GoldenTestAssertions;
}

interface GoldenTestsFile {
  version: string;
  mcp_name: string;
  description: string;
  tests: GoldenTest[];
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

async function dispatchTool(
  db: BetterSqlite3.Database,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'get_provision': {
      const { getProvision } = await import('../../src/tools/get-provision.js');
      return getProvision(db as never, input);
    }
    case 'search_legislation': {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      return searchLegislation(db as never, input);
    }
    case 'get_eu_basis': {
      const { getEUBasis } = await import('../../src/tools/get-eu-basis.js');
      return getEUBasis(db as never, input);
    }
    case 'validate_citation': {
      const { validateCitationTool } = await import('../../src/tools/validate-citation.js');
      return validateCitationTool(db as never, input);
    }
    case 'check_currency': {
      const { checkCurrency } = await import('../../src/tools/check-currency.js');
      return checkCurrency(db as never, input);
    }
    case 'build_legal_stance': {
      const { buildLegalStance } = await import('../../src/tools/build-legal-stance.js');
      return buildLegalStance(db as never, input);
    }
    case 'format_citation': {
      const { formatCitationTool } = await import('../../src/tools/format-citation.js');
      return formatCitationTool(input);
    }
    case 'list_sources': {
      const { listSources } = await import('../../src/tools/list-sources.js');
      return listSources(db as never);
    }
    case 'get_provision_eu_basis': {
      const { getProvisionEUBasis } = await import('../../src/tools/get-provision-eu-basis.js');
      return getProvisionEUBasis(db as never, input);
    }
    case 'get_slovak_implementations': {
      const { getSlovakImplementations } = await import('../../src/tools/get-slovak-implementations.js');
      return getSlovakImplementations(db as never, input);
    }
    case 'search_eu_implementations': {
      const { searchEUImplementations } = await import('../../src/tools/search-eu-implementations.js');
      return searchEUImplementations(db as never, input);
    }
    case 'validate_eu_compliance': {
      const { validateEUCompliance } = await import('../../src/tools/validate-eu-compliance.js');
      return validateEUCompliance(db as never, input);
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 0) ?? '';
}

function extractResults(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = data as Record<string, unknown> | undefined;
  if (Array.isArray(record?.results)) return record!.results as unknown[];
  if (Array.isArray(record?.documents)) return record!.documents as unknown[];
  if (Array.isArray(record?.sources)) return record!.sources as unknown[];
  return [];
}

// ---------------------------------------------------------------------------
// Load fixture at module level (safe — just a JSON read)
// ---------------------------------------------------------------------------

const fixtureData: GoldenTestsFile = FIXTURES_EXIST
  ? JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8'))
  : { version: '0', mcp_name: '', description: '', tests: [] };

// ---------------------------------------------------------------------------
// Test suite (skipped when DB or fixtures are absent)
// ---------------------------------------------------------------------------

describe.skipIf(!DB_EXISTS || !FIXTURES_EXIST)('Golden contract tests: Slovak Law MCP', () => {
  let db: BetterSqlite3.Database;

  // Lazily open on first use
  function ensureDb(): BetterSqlite3.Database {
    if (!db) {
      db = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });
    }
    return db;
  }

  afterAll(() => {
    db?.close();
  });

  for (const test of fixtureData.tests) {
    describe(`[${test.id}] ${test.description}`, () => {
      it('executes without throwing', async () => {
        const result = await dispatchTool(ensureDb(), test.tool, test.input);
        expect(result).toBeDefined();
      });

      if (test.assertions.result_not_empty) {
        it('result is not empty', async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          const text = stringify(result);
          expect(text.length).toBeGreaterThan(2);
        });
      }

      if (test.assertions.text_not_empty) {
        it('result text is not empty', async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          const text = stringify(result);
          expect(text.trim().length).toBeGreaterThan(0);
        });
      }

      if (test.assertions.text_contains) {
        for (const needle of test.assertions.text_contains) {
          it(`contains text "${needle}"`, async () => {
            const result = await dispatchTool(ensureDb(), test.tool, test.input);
            const haystack = stringify(result).toLowerCase();
            expect(haystack).toContain(needle.toLowerCase());
          });
        }
      }

      if (test.assertions.any_result_contains) {
        for (const needle of test.assertions.any_result_contains) {
          it(`any result contains "${needle}"`, async () => {
            const result = await dispatchTool(ensureDb(), test.tool, test.input);
            const haystack = stringify(result).toLowerCase();
            expect(haystack).toContain(needle.toLowerCase());
          });
        }
      }

      if (test.assertions.fields_present) {
        it(`has fields: ${test.assertions.fields_present.join(', ')}`, async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          const items = extractResults(result);
          expect(items.length).toBeGreaterThan(0);
          const first = items[0] as Record<string, unknown>;
          for (const field of test.assertions.fields_present!) {
            expect(first).toHaveProperty(field);
          }
        });
      }

      if (test.assertions.min_results !== undefined) {
        it(`returns at least ${test.assertions.min_results} results`, async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          const items = extractResults(result);
          expect(items.length).toBeGreaterThanOrEqual(test.assertions.min_results!);
        });
      }

      if (test.assertions.citation_url_pattern) {
        it(`citation URLs match ${test.assertions.citation_url_pattern}`, async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          const text = stringify(result);
          const urlRegex = /https?:\/\/[^\s"'<>]+/g;
          const urls = text.match(urlRegex) ?? [];
          expect(urls.length).toBeGreaterThan(0);
          const pattern = new RegExp(test.assertions.citation_url_pattern!);
          for (const url of urls) {
            expect(url).toMatch(pattern);
          }
        });
      }

      if (test.assertions.handles_gracefully) {
        it('handles gracefully (no unhandled exception)', async () => {
          const result = await dispatchTool(ensureDb(), test.tool, test.input);
          expect(result).toBeDefined();
        });
      }
    });
  }
});
