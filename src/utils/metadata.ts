/**
 * Response metadata utilities for Slovak Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Slov-Lex (www.slov-lex.sk) — Ministry of Justice of the Slovak Republic',
    jurisdiction: 'SK',
    disclaimer:
      'This data is sourced from the Slov-Lex under public domain. ' +
      'The authoritative versions are maintained by Ministry of Justice of the Slovak Republic. ' +
      'Always verify with the official Slov-Lex portal (www.slov-lex.sk).',
    freshness,
  };
}
