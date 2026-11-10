---
product: project
step: Probe and intake
status: ok
generated: 2026-11-10T15:49Z
---

# Project passport

_Probe and intake_ · How CAP sees the project: profiles, database, auth and messaging per profile, plugins, model files, services and their implementations.



CAP 10.1.0 (app) · TypeScript · 14 model files · 2 services · 20 seed files

![profile matrix](views/profiles.svg)

### Services

| Service | Protocols | Endpoints | Own code | Implementation |
| --- | --- | --- | --- | --- |
| AnalyticsService | odata | odata /analytics | no | none (generic CAP) |
| TravelService | odata | odata /processor | yes | srv/travel-service.ts |

_2 services_ · [browse with filters](browse.html#services) · [services.json](data/lists/services.json)

### Plugins

- `@cap-js/sqlite`
- `@sap/cds-fiori`
- `@cap-js/hana`
- `@cap-js/cds-typer`
- `cds-plugin-ui5`

### Doctor

CAP answered every probe question.


**Deeper:** [browse.html](browse.html) · [project.json](data/project.json)

Read from: `run/project.json` · [all products](../index.md)
