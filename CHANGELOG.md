# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- Full Slov-Lex register ingestion mode for all catalog entries (`--all-laws --metadata-only`).
- Seed corpus expanded to 25,609 official register entries (as of 2026-02-21).

### Changed
- Database integrity test updated to validate large-corpus scale instead of a fixed 10-document count.
- Documentation updated with coverage metrics, ingestion modes, and source verification summary.

## [1.0.0] - 2026-02-21
### Added
- Initial release of Slovak Law MCP
- `search_legislation` tool for full-text search across Slovak legislation
- `get_provision` tool for retrieving specific articles
- `validate_citation` tool for citation validation
- `check_currency` tool for checking if legislation is in force
- `get_eu_basis` tool for EU cross-references
- `get_slovak_implementations` tool for finding national EU implementations
- `search_eu_implementations` tool for searching EU documents
- `validate_eu_compliance` tool for EU compliance checking
- `build_legal_stance` tool for comprehensive legal research
- `format_citation` tool for citation formatting
- `get_provision_eu_basis` tool for provision-level EU references
- `list_sources` tool for data provenance
- `about` tool for server metadata
- Contract tests with 12 golden test cases
- Health and version endpoints
- Vercel deployment (Strategy A, bundled DB)
- npm package with stdio transport

[1.0.0]: https://github.com/Ansvar-Systems/Slovak-law-mcp/releases/tag/v1.0.0
