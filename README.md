# Slovak Law MCP Server

**The SLOV-LEX alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fslovak-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/slovak-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Slovak-law-mcp?style=social)](https://github.com/Ansvar-Systems/Slovak-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Slovak-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-1%2C913-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **25,609 Slovak statutes** — from zákon č. 18/2018 Z.z. (ochrana osobných údajov) and the Trestný zákon to the Občiansky zákonník, zákon o kybernetickej bezpečnosti, and more — directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Slovak legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Slovak legal research is scattered across SLOV-LEX, zbierka.sk, EUR-Lex, and government ministerial portals. Whether you're:
- A **lawyer** validating citations in a brief or zmluva
- A **compliance officer** checking obligations under zákon č. 18/2018 Z.z. or zákon č. 69/2018 Z.z.
- A **legal tech developer** building tools on Slovak law
- A **researcher** tracing legislative history from dôvodová správa to zákon

...you shouldn't need a dozen browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Slovak law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version — zero dependencies, nothing to install.

**Endpoint:** `https://slovak-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add slovak-law --transport http https://slovak-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "slovak-law": {
      "type": "url",
      "url": "https://slovak-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** — add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "slovak-law": {
      "type": "http",
      "url": "https://slovak-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/slovak-law-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "slovak-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/slovak-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally (dotazy fungujú v slovenčine alebo angličtine):

- *"Čo hovorí § 13 zákona č. 18/2018 Z.z. o právnom základe spracúvania osobných údajov?"*
- *"Hľadať 'ochrana osobných údajov' v slovenskej legislatíve"*
- *"Je zákon č. 122/2013 Z.z. o ochrane osobných údajov stále platný?"*
- *"Aké sú trestné činy kybernetickej kriminality v Trestnom zákone (č. 300/2005 Z.z.)?"*
- *"Ktoré slovenské zákony transponujú smernicu NIS2?"*
- *"Hľadať ustanovenia o elektronickom podpise v zákone č. 272/2016 Z.z."*
- *"Find provisions about data breach notification in Slovak law"*
- *"Validate the citation 'zákon č. 18/2018 Z.z., § 34'"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 25,609 zákonov | Comprehensive Slovak legislation from SLOV-LEX |
| **Provisions** | 1,913 paragrafov | Full-text searchable with FTS5 |
| **Premium: Case law** | 0 (free tier) | Judikatúra expansion planned |
| **Premium: Preparatory works** | 428,952 documents | Dôvodové správy and parliamentary documentation |
| **Premium: Agency guidance** | 0 (free tier) | Úrad na ochranu osobných údajov guidance planned |
| **Database Size** | ~27 MB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against SLOV-LEX |

**Verified data only** — every citation is validated against official sources (SLOV-LEX / zbierka.sk). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from SLOV-LEX (slov-lex.sk) official sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing — the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by zákon number + paragraph
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
SLOV-LEX API → Parse → SQLite → FTS5 snippet() → MCP response
                 ↑                     ↑
          Provision parser       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search SLOV-LEX by číslo zákona | Search by plain Slovak: *"ochrana osobných údajov súhlas"* |
| Navigate multi-chapter statutes manually | Get the exact provision with context |
| Manual cross-referencing between zákony | `build_legal_stance` aggregates across sources |
| "Je tento zákon platný?" → check manually | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search SLOV-LEX → Download PDF → Ctrl+F → Cross-reference with EUR-Lex → Check Úrad na ochranu osobných údajov → Repeat

**This MCP:** *"Aký je európsky základ § 13 zákona č. 18/2018 Z.z. o ochrane osobných údajov?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 1,913 provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by zákon number + paragraph (e.g., "18/2018 Z.z." + "§ 13") |
| `check_currency` | Check if a statute is in force (platný/neplatný), amended, or repealed |
| `validate_citation` | Validate citation against database — zero-hallucination check. Supports "zákon č. 18/2018 Z.z., § 13" |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Slovak conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations underlying a Slovak statute |
| `get_slovak_implementations` | Find Slovak laws implementing a specific EU act |
| `search_eu_implementations` | Search EU documents with Slovak implementation counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check implementation status of Slovak statutes against EU directives |

---

## EU Law Integration

Slovakia is an **EU member state** (since 2004) and eurozone member (since 2009). Slovak legislation in data protection, cybersecurity, financial services, and e-commerce is built on EU directives and regulations. The EU bridge tools give you full bi-directional lookup.

| Metric | Value |
|--------|-------|
| **EU Member State** | Yes — since 1 May 2004 |
| **Eurozone** | Yes — since 1 January 2009 |
| **EU References** | Cross-references linking Slovak statutes to EU law |
| **Directives transposed** | GDPR, NIS2, DORA, AI Act, eIDAS, PSD2, AML directives, and more |
| **EUR-Lex Integration** | Automated metadata fetching |
| **Úrad supervision** | Data protection and cybersecurity regulatory frameworks fully covered |

### Key Slovak EU Implementations

- **Zákon č. 18/2018 Z.z.** — GDPR national implementation (ochrana osobných údajov)
- **Zákon č. 69/2018 Z.z.** — Zákon o kybernetickej bezpečnosti (NIS Directive transposition)
- **Zákon č. 272/2016 Z.z.** — Zákon o dôveryhodných službách (eIDAS transposition)
- **Zákon č. 492/2009 Z.z.** — Zákon o platobných službách (PSD2 transposition)

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation.

---

## Data Sources & Freshness

All content is sourced from authoritative Slovak legal databases:

- **[SLOV-LEX](https://www.slov-lex.sk/)** — Portál právnych predpisov SR (official legal portal)
- **[zbierka.sk](https://zbierka.sk/)** — Zbierka zákonov Slovenskej republiky
- **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU law database (metadata only)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Ministerstvo spravodlivosti Slovenskej republiky / SLOV-LEX |
| **Retrieval method** | SLOV-LEX official database and open data |
| **Language** | Slovak |
| **License** | Public domain (verejná správa) |
| **Coverage** | 25,609 statutes, 1,913 provisions |
| **Last ingested** | 2026-02-28 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors SLOV-LEX for changes:

| Check | Method |
|-------|--------|
| **Statute amendments** | SLOV-LEX date comparison across 25,609 statutes |
| **New statutes** | Zbierka zákonov publication monitoring |
| **Repealed statutes** | Platnosť/neplatnosť status change detection |
| **EU reference staleness** | Git commit timestamps — flagged if >90 days old |

**Verified data only** — every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official SLOV-LEX publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** in the free tier — do not rely solely on this for judikatúra research
> - **Verify critical citations** against primary sources (SLOV-LEX, Zbierka zákonov) for court filings
> - **EU cross-references** are extracted from statute text and EUR-Lex metadata, not a complete implementation mapping

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for guidance consistent with **Slovenská advokátska komora** (Slovak Bar Association) professional conduct standards.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Slovak-law-mcp
cd Slovak-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest           # Ingest statutes from SLOV-LEX
npm run build:db         # Rebuild SQLite database
npm run drift:detect     # Run drift detection against anchors
npm run check-updates    # Check for amendments
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~27 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** — MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** — GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/slovak-law-mcp (This Project)
**Query 25,609 Slovak statutes directly from Claude** — zákon č. 18/2018 Z.z., Trestný zákon, Občiansky zákonník, and more. Full provision text with EU cross-references. `npx @ansvar/slovak-law-mcp`

### [@ansvar/czech-law-mcp](https://github.com/Ansvar-Systems/Czech-law-mcp)
**Query 45,899 Czech statutes directly from Claude** — for cross-border Czechoslovak legal research. `npx @ansvar/czech-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** — ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Austria, Belgium, Croatia, Czech Republic, Denmark, Estonia, Finland, France, Germany, Hungary, Ireland, Italy, Luxembourg, Netherlands, Norway, Poland, Portugal, Romania, Slovenia, Spain, Sweden, Switzerland, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Ústavný súd SR, Najvyšší súd SR)
- EU cross-reference expansion
- Historical statute versions and amendment tracking
- Úrad na ochranu osobných údajov guidance documents
- NBÚ (Národný bezpečnostný úrad) guidance

---

## Roadmap

- [x] Core statute database with FTS5 search (25,609 statutes, 1,913 provisions)
- [x] EU law integration with bi-directional lookup
- [x] Premium preparatory works dataset (428,952 documents)
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Judikatúra (court case law) expansion
- [ ] Full EU text integration (via @ansvar/eu-regulations-mcp)
- [ ] Historical statute versions (amendment tracking)
- [ ] Úrad na ochranu osobných údajov guidance
- [ ] Full provision coverage expansion

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{slovak_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Slovak Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Slovak-law-mcp},
  note = {25,609 Slovak statutes with EU law cross-references and 428,952 preparatory works}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Ministerstvo spravodlivosti SR / SLOV-LEX (public domain)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server is part of our Central European coverage — alongside Czech, Polish, and Hungarian law MCPs — ensuring that the full EU compliance picture is accessible from a single AI interface.

So we're open-sourcing it. Navigating 25,609 statutes shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
