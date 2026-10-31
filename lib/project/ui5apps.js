// UI5 applications and CAP projects as SAP's open-source Fiori tools find them (@sap-ux/project-access,
// Apache-2.0, the library behind SAP Fiori tools and the Fiori generators):
//   CAP projects   findCapProjects + getCapProjectType (CAPNodejs vs CAPJava)
//   UI5 apps       every ui5.yaml, its webapp folder from getWebappPath (resources.configuration.paths.webapp),
//                  plus the Fiori tools apps findAllApps knows (sapux projects)
// The old convention (a folder holding webapp/manifest.json) only adds apps the tools do not report.
// Walkthrough: docs/walkthrough/01-intake.md · Sources: docs/walkthrough/references.md (Intake)
const fs = require('fs')
const path = require('path')
const { walk } = require('./files')

const pa = () => require('@sap-ux/project-access')
const SKIP = /[\\/](node_modules|\.git|dist|gen|resources|mta_archives)[\\/]/

// [{ root, webapp, manifest, by }] below the given folders, each app once
async function ui5Apps(dirs) {
  const out = new Map()
  const add = (root, webapp, by) => { const manifest = path.join(webapp, 'manifest.json'); if (fs.existsSync(manifest) && !SKIP.test(manifest) && !out.has(manifest)) out.set(manifest, { root, webapp, manifest, by }) }
  for (const d of dirs.filter(d => fs.existsSync(d))) {
    for (const y of walk(d, p => /[\\/]ui5[\w-]*\.yaml$/.test(p) && path.basename(p) === 'ui5.yaml')) {
      const root = path.dirname(y)
      try { add(root, await pa().getWebappPath(root), 'ui5.yaml') } catch {}
    }
    try { for (const a of await pa().findAllApps([d])) add(a.appRoot, path.dirname(a.manifestPath), 'Fiori tools') } catch {}
    for (const m of walk(d, p => p.endsWith(path.join('webapp', 'manifest.json')))) add(path.dirname(path.dirname(m)), path.dirname(m), 'webapp/ convention')
  }
  return [...out.values()].sort((a, b) => a.manifest.localeCompare(b.manifest))
}

// CAP Node.js projects below a folder (absolute paths); null when the library cannot be used
async function capNodeProjects(dir) {
  try {
    const found = await pa().findCapProjects({ wsFolders: [dir] })
    const out = []
    for (const p of found) if (await pa().getCapProjectType(p) === 'CAPNodejs') out.push(p)
    return out
  } catch { return null }
}

module.exports = { ui5Apps, capNodeProjects }
