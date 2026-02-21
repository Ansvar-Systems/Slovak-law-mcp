import { afterAll, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { buildTools, registerTools } from '../../src/tools/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

const realDb = new BetterSqlite3(DB_PATH, { readonly: true, fileMustExist: true });

class MockServer {
  private readonly handlers = new Map<object, (...args: any[]) => Promise<any>>();

  setRequestHandler(schema: object, handler: (...args: any[]) => Promise<any>) {
    this.handlers.set(schema, handler);
  }

  handler(schema: object) {
    const fn = this.handlers.get(schema);
    if (!fn) throw new Error('handler not found');
    return fn;
  }
}

afterAll(() => {
  realDb.close();
});

describe('registry buildTools', () => {
  it('should build base tool list and include optional about/list tools', () => {
    const base = buildTools();
    expect(base.some(t => t.name === 'list_sources')).toBe(true);
    expect(base.some(t => t.name === 'about')).toBe(false);

    const withContext = buildTools(realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00Z',
    });
    expect(withContext.some(t => t.name === 'about')).toBe(true);
  });

  it('should tolerate dbs without definitions table while building tools', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      const tools = buildTools(db as never);
      expect(tools.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});

describe('registry request handlers', () => {
  it('should list tools and execute all supported tool routes', async () => {
    const server = new MockServer();
    registerTools(server as never, realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00Z',
    });

    const listHandler = server.handler(ListToolsRequestSchema);
    const listed = await listHandler({});
    expect(listed.tools.length).toBeGreaterThan(10);

    const callHandler = server.handler(CallToolRequestSchema);

    const calls: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'search_legislation', args: { query: 'osobných údajov' } },
      { name: 'get_provision', args: { document_id: 'act-18-2018', provision_ref: '§1' } },
      { name: 'validate_citation', args: { citation: 'Section 1, act-18-2018' } },
      { name: 'build_legal_stance', args: { query: 'osobných údajov' } },
      { name: 'format_citation', args: { citation: 'Section 1, Act', format: 'short' } },
      { name: 'check_currency', args: { document_id: 'act-18-2018' } },
      { name: 'get_eu_basis', args: { document_id: 'act-18-2018' } },
      { name: 'get_slovak_implementations', args: { eu_document_id: 'regulation:2016/679' } },
      { name: 'search_eu_implementations', args: { query: 'Regulation' } },
      { name: 'get_provision_eu_basis', args: { document_id: 'act-18-2018', provision_ref: '§1' } },
      { name: 'validate_eu_compliance', args: { document_id: 'act-18-2018' } },
      { name: 'list_sources', args: {} },
      { name: 'about', args: {} },
    ];

    for (const call of calls) {
      const response = await callHandler({ params: { name: call.name, arguments: call.args } });
      expect(response.isError).toBeUndefined();
      expect(response.content[0].type).toBe('text');
      expect(() => JSON.parse(response.content[0].text)).not.toThrow();
    }

    const unknown = await callHandler({ params: { name: 'unknown_tool', arguments: {} } });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toContain('Unknown tool');
  });

  it('should return configured error for about when context is missing', async () => {
    const server = new MockServer();
    registerTools(server as never, realDb as never);

    const callHandler = server.handler(CallToolRequestSchema);
    const result = await callHandler({ params: { name: 'about', arguments: {} } });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not configured');
  });

  it('should catch thrown errors in tool execution', async () => {
    const server = new MockServer();
    registerTools(server as never, realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00Z',
    });

    const callHandler = server.handler(CallToolRequestSchema);
    const result = await callHandler({ params: { name: 'check_currency', arguments: {} } });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });

  it('should stringify non-Error throws in handler catch path', async () => {
    const stringThrowingDb = {
      prepare: () => {
        throw 'string-failure';
      },
    };

    const server = new MockServer();
    registerTools(server as never, stringThrowingDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00Z',
    });

    const callHandler = server.handler(CallToolRequestSchema);
    const result = await callHandler({ params: { name: 'check_currency', arguments: { document_id: 'x' } } });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('string-failure');
  });
});
