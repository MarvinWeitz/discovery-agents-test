// Finds what to analyse in a cloned repo: node detect.js <repo-dir> [app-path] [ui-paths] [owner/repo]
// app-path and ui-paths are relative to the repo root; empty means "detect".
// Prints key=value lines for $GITHUB_OUTPUT:
//   app        CAP project folder, relative to the repo root ('.' for the root)
//   ui         UI5 project folders outside <app>/app, relative to the app folder (comma list, for --ui);
//              ui-paths "-" means none
//   install    folder to run the package manager in (nearest lockfile at or above the app)
//   pm         npm | yarn | pnpm
//   ts         true when the app has TypeScript handlers
//   typer      true when the app uses @cap-js/cds-typer
//   jest       true when the app brings its own Jest
//   curated    curated/<file>.json whose META.app names this repo, if any
//   mockauth   true when the app only configures token auth (xsuaa, ias, jwt) and so cannot start in a test
//              without a bound instance; the workflow then runs the tests with CAP's mocked users
// The rules live in lib/project/detect.js. Walkthrough: docs/walkthrough/01-intake.md
const path = require('path')
const { detect } = require('../../lib/project/detect')

const [repoDir, appArg = '', uiArg = '', slug = ''] = process.argv.slice(2)
const out = detect(repoDir, { appArg, uiArg, slug, curatedDir: path.join(__dirname, '../../curated') })
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`)
