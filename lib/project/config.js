// How a CAP project configures itself. Two views:
//   files(root)  the raw config files with their text, for file:line evidence (package.json "cds", .cdsrc.json)
//   env(root)    the effective configuration as CAP computes it (all files, profiles, CAP defaults)
// Raw files show where a setting is written; env shows what CAP will actually do.
// Walkthrough: docs/walkthrough/00-assumptions.md
const fs = require('fs')
const path = require('path')

// Config files read as text, in this order. CAP also reads .cdsrc.yaml, .cdsrc-private.json and
// environment variables; those only reach the pipeline through env().
const FILES = [
  { file: 'package.json', cds: j => j.cds },
  { file: '.cdsrc.json', cds: j => j },
]

// Deployment and security descriptors whose presence is reported (relative to the app root)
const DESCRIPTORS = ['mta.yaml', 'xs-security.json', 'app/router/xs-app.json']

// [{ file, raw, json, cds }] for the config files that exist
function files(root, only = FILES.map(f => f.file)) {
  const out = []
  for (const f of FILES.filter(f => only.includes(f.file))) {
    const p = path.join(root, f.file)
    if (!fs.existsSync(p)) continue
    const raw = fs.readFileSync(p, 'utf8')
    const json = JSON.parse(raw)
    out.push({ file: f.file, raw, json, cds: f.cds(json) || {} })
  }
  return out
}

// Effective cds.env for the project folder (null when @sap/cds cannot be loaded)
function env(root, cds) {
  try { return (cds || require('@sap/cds')).env.for('cds', root) } catch { return null }
}

const packageJson = root => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

module.exports = { files, env, packageJson, FILES, DESCRIPTORS }
