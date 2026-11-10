// A synthetic CAP app with the shapes that made real enterprise apps noisy or unrunnable (smart-core
// review, 2026-11-03), at a size the sandbox runs in seconds. No customer code: every line is generated here.
//   node test/fixtures/scale-app.js <dir> [--entities 60] [--services 12] [--roles 15]
// Shapes it reproduces:
//   - one domain entity projected into several services (one slice per service entity used to multiply)
//   - dense associations between domain entities (slices pulled in half the model)
//   - @restrict with `where` on every service entity, for several roles (one row-level risk per entity)
//   - xs-security.json with many role templates, mock users for two of them only
//   - a parameterized view (SQLite cannot deploy it, so cds.test failed at startup)
//   - an OperationAvailable on a boolean feature flag next to a real code-list lifecycle
//   - emit + on of the same event inside one service (in-process async event)
//   - the same entity name in two namespaces holding personal data
//   - declared actions without a handler, many read-only fields (UI promises CAP keeps)
const fs = require('fs')
const path = require('path')

function scaleApp(dir, { entities = 60, services = 12, roles = 15 } = {}) {
  const files = {}
  const R = Array.from({ length: roles }, (_, i) => `Role${String(i + 1).padStart(2, '0')}`)
  const E = Array.from({ length: entities }, (_, i) => `Doc${String(i).padStart(3, '0')}`)

  files['package.json'] = JSON.stringify({
    name: 'scale-app', version: '1.0.0', private: true, description: 'Synthetic large CAP app for discovery regression tests',
    dependencies: { '@sap/cds': '^9' },
    cds: { requires: {
      auth: { kind: 'mocked', users: { alice: { password: '', roles: [R[0]] }, bob: { password: '', roles: [R[0], R[1]] } } }, '[production]': { auth: 'xsuaa' },
      // a messaging plugin that needs a cloud binding to start (smart-core run 13: an event mesh plugin)
      messaging: { impl: './srv/lib/mesh.js', vcap: { name: 'bus-message-client' } },
    } }
  }, null, 2)
  files['srv/lib/mesh.js'] = `const cds = require('@sap/cds')
module.exports = class Mesh extends cds.MessagingService {
  async init() {
    if (!this.options.credentials?.messaging) throw new Error('Missing or malformed credentials for the message bus. Ensure the service binding for "bus-message-client" is present.')
    return super.init()
  }
}
`
  files['xs-security.json'] = JSON.stringify({
    xsappname: 'scale-app', 'tenant-mode': 'dedicated',
    scopes: R.map(r => ({ name: `$XSAPPNAME.${r}`, description: r })),
    'role-templates': R.map(r => ({ name: r, 'scope-references': [`$XSAPPNAME.${r}`] }))
  }, null, 2)

  // ---- domain model ----
  const db = [`namespace scale.core;`, `using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';`, '',
    `entity Statuses : CodeList {`, `  key code : String(1) enum { Open = 'O'; InProcess = 'P'; Closed = 'C'; };`, `}`, '',
    `entity SystemVariables : cuid {`, `  name : String(40);`, `  _it  : Composition of one SystemItems;`, `}`,
    `entity SystemItems : cuid {`, `  isFeatureFlag : Boolean default false;`, `}`, '',
    `entity UserAccess : cuid {`, `  email : String(200) @PersonalData.IsPotentiallyPersonal;`, `  role  : String(20);`, `}`, '',
    `entity Orders : cuid, managed {`, `  title  : String(100) @mandatory;`, `  status : Association to Statuses default 'O';`,
    `  flags  : Association to SystemVariables;`, `  items  : Composition of many OrderItems on items.order = $self;`, `}`,
    `entity OrderItems : cuid {`, `  order    : Association to Orders;`, `  quantity : Integer @assert.range: [1, 100];`, `}`, '']
  E.forEach((e, i) => {
    db.push(`entity ${e} : cuid, managed {`, `  name   : String(100);`, `  amount : Decimal(9, 2);`, `  status : Association to Statuses;`,
      `  next   : Association to ${E[(i + 1) % E.length]};`, `  ref    : Association to ${E[(i * 7 + 3) % E.length]};`,
      `  order  : Association to Orders;`, `}`)
  })
  // the view SQLite cannot deploy: a parameterized view
  db.push('', `entity StockAtDates(p_date : Date) as select from ${E[0]} { key ID, name, amount } where createdAt <= :p_date;`,
    // a plain view on the parameterized one (and a view on that): SQLite cannot hold them either (smart-core run 11)
    `entity StockAtToday as select from StockAtDates(p_date: $now) { key ID, name, amount };`,
    `entity StockSummary as select from StockAtToday { key ID, amount };`,
    // a plain entity with an association into it: fine on its own, but a view navigating it is HANA-only (run 12)
    `entity Holders : cuid { name : String(40); stockToday : Association to StockAtToday on stockToday.ID = $self.ID; }`, '')
  files['db/schema.cds'] = db.join('\n')
  files['db/ops.cds'] = [`namespace scale.ops;`, `using { cuid } from '@sap/cds/common';`, '',
    `entity UserAccess : cuid {`, `  email : String(200) @PersonalData.IsPotentiallyPersonal;`, `  scope : String(20);`, `}`, ''].join('\n')
  files['db/data/scale.core-Statuses.csv'] = 'code;name\nO;Open\nP;In process\nC;Closed\n'
  files['db/data/scale.core-Orders.csv'] = 'ID;title;status_code\n11111111-1111-4111-8111-111111111111;First;O\n22222222-2222-4222-8222-222222222222;Second;P\n'

  // ---- services: each projects a window of the domain entities (every entity sits in ~3 services) ----
  const per = Math.max(4, Math.ceil(entities * 3 / services))
  for (let s = 0; s < services; s++) {
    const name = `Svc${String(s).padStart(2, '0')}`
    const mine = Array.from({ length: per }, (_, k) => E[(s * Math.ceil(entities / services) + k) % E.length])
    const rr = [R[s % R.length], R[(s + 3) % R.length], R[(s + 7) % R.length]]
    const lines = [`using { scale.core as core, scale.ops as ops } from '../db/schema';`, `using from '../db/ops';`, '',
      `@path: '/svc${s}'`, `@requires: 'authenticated-user'`, `service ${name} {`]
    for (const e of [...new Set(mine)]) {
      lines.push(`  @restrict: [`, `    { grant: ['READ', 'WRITE'], to: '${rr[0]}', where: 'createdBy = $user' },`,
        `    { grant: 'READ', to: '${rr[1]}', where: 'createdBy = $user' },`, `    { grant: '*', to: '${rr[2]}' }`, `  ]`,
        `  entity ${e} as projection on core.${e};`,
        `  annotate ${e} with { createdAt @Common.FieldControl: #ReadOnly; modifiedAt @Common.FieldControl: #ReadOnly; };`)
    }
    if (s === 0) {
      // feature-flag action first, then the real lifecycle; emit + on of one event; an action without handler
      lines.push(`  @restrict: [{ grant: ['READ', 'WRITE', 'sync', 'start', 'close'], to: '${R[0]}' }]`,
        `  entity Orders as projection on core.Orders actions {`,
        `    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/flags/_it/isFeatureFlag' }, true ] } })`, `    action sync();`,
        `    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'O' ] } })`, `    action start() returns Orders;`,
        `    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'P' ] } })`, `    action close() returns Orders;`, `  };`,
        `  @readonly entity Statuses as projection on core.Statuses;`,
        `  @readonly entity UserAccess as projection on core.UserAccess;`,
        `  @readonly entity OpsUserAccess as projection on ops.UserAccess;`,
        `  @readonly entity StockAtDates(p_date : Date) as select from core.StockAtDates(p_date: :p_date) { * };`,
        `  @readonly entity StockToday as projection on core.StockSummary;`,
        `  @readonly entity HolderStock as select from core.Holders { key ID, name, stockToday.amount as amount };`,
        `  action rebuildIndex();`)
    }
    lines.push('}', '')
    files[`srv/${name.toLowerCase()}.cds`] = lines.join('\n')
  }
  files['srv/svc00.js'] = `const cds = require('@sap/cds')

module.exports = class Svc00 extends cds.ApplicationService {
  init() {
    const { Orders } = this.entities
    this.on('start', Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      const o = await SELECT.one.from(Orders, ID).columns('status_code')
      if (o?.status_code !== 'O') return req.reject(409, 'Only open orders can start')
      await UPDATE(Orders, ID).with({ status_code: 'P' })
      return SELECT.one.from(Orders, ID)
    })
    this.on('close', Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      await UPDATE(Orders, ID).with({ status_code: 'C' })
      return SELECT.one.from(Orders, ID)
    })
    // in-process async event: emitted and handled by this same service
    this.after('UPDATE', Orders, async (_, req) => { await this.emit('refreshRequested', { ID: req.data.ID }) })
    this.on('refreshRequested', async msg => { await UPDATE(Orders, msg.data.ID).with({ title: 'refreshed' }) })
    return super.init()
  }
}
`
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), text)
  }
  return dir
}

if (require.main === module) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? +a[i + 1] : undefined }
  if (!a[0]) { console.error('usage: scale-app.js <dir> [--entities n] [--services n] [--roles n]'); process.exit(2) }
  scaleApp(path.resolve(a[0]), { entities: opt('--entities'), services: opt('--services'), roles: opt('--roles') })
  console.log(`scale app written to ${a[0]}`)
}

module.exports = { scaleApp }
