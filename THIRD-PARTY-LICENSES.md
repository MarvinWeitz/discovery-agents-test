# Third-party tools and licences

Tracked as we go; legal review happens later. Nothing is bundled: every package is installed from npm by whoever runs the toolkit. Status as of 2026-10-29.

## Used by the toolkit

| Tool | Version | Licence | How we use it | Commercial note |
| --- | --- | --- | --- | --- |
| `@sap/cds` | 9.9.x | SAP Developer License | Compiles the target app's CDS model to CSN; reads `cds.env` for mock users | Review needed. Call the customer's install, never bundle |
| `@sap/cds-compiler` | 7.x | SAP Developer License | Pulled in by `@sap/cds` | Same |
| `@sap/eslint-plugin-cds` | 4.x | SAP Developer License | `cds lint` rules | Same |
| `@ui5/linter` | 1.x | Apache-2.0 | Lints UI5 apps | Depends on `@sapui5/types` (SAP Developer License) |
| `eslint` | 9.x | MIT | Runner for the cds lint rules | OK |
| `typescript` | 5.9.3 | Apache-2.0 | Compiler API parses handler files (JS and TS) | OK |
| `mermaid` | 10.9.1 | MIT | Diagrams in `discovery-report.md` | OK |
| `d3` | 7.9.0 | ISC | Atlas page: force graph, treemap | OK; loaded from cdnjs on the page |
| `d3-sankey` | 0.12.3 | BSD-3-Clause | Atlas page: data-flow Sankey | OK; loaded from jsDelivr on the page |
| `playwright` | pre-installed | Apache-2.0 | Headless Chromium renders atlas images and diagrams | OK; downloads Chromium (BSD-style + bundled third-party licences) |
| `git` | system | GPL-2.0 | Commit hash and churn (CLI only, not linked) | OK as a separate tool |

## Installed during the session, not used by the toolkit

`@cap-js/sqlite` 2.4.3, `@cap-js/db-service` 2.11.3, `@cap-js/cds-test` 1.0.2 (all Apache-2.0) and `better-sqlite3` 13.0.3 (MIT) were installed with `--no-save` for a runtime probe that the sandbox blocked. They are not in `package.json`. The generated tests need `@cap-js/cds-test` (Apache-2.0) in the target app.

## Concepts and algorithms reused (no code copied)

| Source | Licence | What we took |
| --- | --- | --- |
| Murphy, Notkin, Sullivan: software reflexion models (1995) | paper | intended model (UI annotations) vs extracted model (handlers) → UIS verdicts |
| CodeWiki / layered documentation | paper | wide map first, then per-slice deep dives, layered depth in the atlas |
| Microsoft PICT | MIT | greedy all-pairs generation, reimplemented in `lib/test-design.js` |
| dependency-cruiser, ArchUnitTS | MIT | layer rules and dependency matrix for `extract-cds-deps.js` |
| wshobson/agents C4 plugin | MIT | agent role split and Markdown-first output |
| SAP/codeql-sap-js queries | MIT | list of CAP security patterns to check (row-level filters, open services); not executed |

## Reference only (not used, licence blocks commercial use)

| Source | Licence | Why only reference |
| --- | --- | --- |
| GitNexus | PolyForm Noncommercial | non-commercial |
| secondsky/sap-skills | GPL | copyleft on skill text |

## Evaluated, not used yet

Joern (Apache-2.0), Opengrep (LGPL-2.1, external CLI), codebase-memory-mcp (MIT), `@cap-js/mcp-server` and the UI5 MCP server (SAP licences; call the customer's install only), `hana-mcp-server`. CodeQL / GitHub Advanced Security excluded (paid).

## Pilot apps analysed (not redistributed)

`cap-js/incidents-app` (Apache-2.0), `SAP-samples/cap-sflight` (Apache-2.0), `SAP-samples/ui5-cap-event-app` (Apache-2.0).
