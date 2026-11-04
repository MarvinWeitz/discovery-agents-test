// Deploys the app's model into the database of the test profile (test.deploy, lib/runtime/db-target.js), for a
// database that is not HANA (Postgres, a SQLite file): drops and re-creates the tables and views and loads the
// CSV data, so every run starts from the same data. HANA-only views are skipped as on SQLite (DISCOVERY_SQLITE_SHIM
// =off keeps them), since Postgres cannot hold them either. Point it at a throwaway database only.
//   CDS_ENV=<profile> node deploy.js            (run in the app folder)
const path = require('path')
const cds = require(require.resolve('@sap/cds', { paths: [process.cwd()] }))
const { hanaOnlyViews } = require('./sqlite-shim')

;(async () => {
  cds.root = process.cwd()
  const csn = await cds.load('*')
  const skipped = process.env.DISCOVERY_SQLITE_SHIM === 'off' ? [] : [...hanaOnlyViews(csn, cds)]
  for (const n of skipped) csn.definitions[n]['@cds.persistence.skip'] = true
  const db = await cds.connect.to('db')
  await cds.deploy(csn).to(db)
  console.log(`deployed ${path.basename(cds.root)} to ${db.options?.kind || db.kind || 'db'} (profile ${process.env.CDS_ENV || 'default'})${skipped.length ? `; HANA-only views skipped: ${skipped.join(', ')}` : ''}`)
  await cds.shutdown?.()
  process.exit(0)
})().catch(e => { console.error(`deploy failed: ${e.stack || e}`); process.exit(1) })
