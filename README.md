# Slovak Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/slovak-law-mcp)](https://www.npmjs.com/package/@ansvar/slovak-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server providing access to Slovak legislation covering data protection, cybersecurity, e-commerce, and criminal law provisions.

**MCP Registry:** `eu.ansvar/slovak-law-mcp`
**npm:** `@ansvar/slovak-law-mcp`

## Quick Start

### Claude Desktop / Cursor (stdio)

```json
{
  "mcpServers": {
    "slovak-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/slovak-law-mcp"]
    }
  }
}
```

### Remote (Streamable HTTP)

```
slovak-law-mcp.vercel.app/mcp
```

## Data Sources

| Source | Authority | License |
|--------|-----------|---------|
| [Slov-Lex](https://www.slov-lex.sk) | Ministry of Justice of the Slovak Republic | Slovak Government Open Data (public domain under Slovak Copyright Act § 5) |

> Full provenance: [`sources.yml`](./sources.yml)

## Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | Full-text search across provisions |
| `get_provision` | Retrieve specific article/section |
| `validate_citation` | Validate legal citation |
| `check_currency` | Check if statute is in force |
| `get_eu_basis` | EU legal basis cross-references |
| `get_slovak_implementations` | National EU implementations |
| `search_eu_implementations` | Search EU documents |
| `validate_eu_compliance` | EU compliance check |
| `build_legal_stance` | Comprehensive legal research |
| `format_citation` | Citation formatting |
| `list_sources` | Data provenance |
| `about` | Server metadata |

## License

Apache-2.0
