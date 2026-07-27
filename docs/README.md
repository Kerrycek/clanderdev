# Documentation

Start with [PROJECT_GUIDE.md](PROJECT_GUIDE.md). It is the canonical,
maintained overview of the repository: architecture, authorization model,
source layout, development, testing, localization and deployment boundaries.

[CANONICAL_DOCS.md](CANONICAL_DOCS.md) records which documents are current,
derived or historical. When documents disagree, use the authority stated in
that map and verify behavior against the source and HaveAPI schema.

## Directory map

| Path | Purpose |
| --- | --- |
| `PROJECT_GUIDE.md` | Maintained engineering and operations overview |
| `haveapi/` | Distilled HaveAPI behavior, authorization and resource mapping |
| `spec/` | Focused implementation/testing appendices and historical stubs |
| `audits/` | Point-in-time reviews; findings can become stale |
| `discovery/` | Generated inventories and legacy/API discovery material |
| `clankerdev/` | Import history and deployment notes for clankerdev |
| `rc/` | Release-candidate process |
| `chat/` | Historical planning material; not normative |

Environment-specific deployment instructions live in the repository-level
`deploy/` directory rather than here.

## Maintenance rules

- Keep `PROJECT_GUIDE.md` concise and link to detailed documents.
- Update the guide when architecture, supported environments, role boundaries,
  primary commands or CI gates change.
- Do not turn dated audits or discovery output into product requirements.
- Mark historical material clearly instead of silently treating it as current.
- Validate factual behavior against current source and the runtime HaveAPI
  description; frontend documentation does not override backend authorization.
