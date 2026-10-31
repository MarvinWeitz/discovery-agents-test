// Step 5a · UI5 apps: manifests, OData data sources, routes, views and their event handlers.
// Walkthrough: docs/walkthrough/05-other-extractors.md
const fs = require('fs')
const path = require('path')
const { walk, lineOf } = require('../project/files')
const { layout } = require('../project/layout')

// A UI5 project is a folder holding webapp/manifest.json
const isManifest = p => p.endsWith(path.join('webapp', 'manifest.json')) && !p.includes('node_modules')

function extractUI5(root, g, uiDirs = []) {
  // app/ plus UI5 projects that live elsewhere in a monorepo (discover --ui ../ui-form)
  const manifests = layout(root).uiRoots(uiDirs).flatMap(d => walk(d, isManifest))
  const services = g.byType('Service')
  for (const mf of manifests) {
    const rel = path.relative(root, mf)
    const raw = fs.readFileSync(mf, 'utf8')
    const m = JSON.parse(raw)
    const appId = m['sap.app']?.id || rel
    const ui5 = m['sap.ui5'] || {}
    const libs = Object.keys(ui5.dependencies?.libs || {})
    const fe = libs.includes('sap.fe.templates')
    const aid = `ui5app:${appId}`
    g.node(aid, 'UI5App', { id: appId, manifest: rel, minUI5Version: ui5.dependencies?.minUI5Version, libs, fioriElements: fe }, { evidence: `${rel}:1`, source: 'tool:ui5' })

    // Data sources -> CAP services by URI
    const dsService = {}
    for (const [dsName, ds] of Object.entries(m['sap.app']?.dataSources || {})) {
      if (ds.type !== 'OData') continue
      const uri = '/' + ds.uri.replace(/^\/|\/$/g, '')
      const svc = services.find(s => uri.endsWith(s.props.path))
      if (svc) {
        dsService[dsName] = svc.props.name
        g.edge(aid, 'uses', svc.id, { dataSource: dsName, odataVersion: ds.settings?.odataVersion }, { evidence: `${rel}:${lineOf(raw, `"${dsName}"`)}`, source: 'tool:ui5' })
      } else {
        g.node(`remote:${uri}`, 'ExternalService', { name: uri })
        g.edge(aid, 'uses', `remote:${uri}`, { dataSource: dsName }, { evidence: `${rel}:${lineOf(raw, `"${dsName}"`)}`, source: 'tool:ui5' })
      }
    }
    const defaultModel = ui5.models?.['']?.dataSource || Object.keys(dsService)[0]
    const svc = dsService[defaultModel]

    // Routes and their targets
    const routing = ui5.routing || {}
    for (const r of routing.routes || []) {
      const rid = `route:${appId}/${r.name}`
      const tname = [].concat(r.target)[0]
      const t = routing.targets?.[tname] || {}
      const settings = t.options?.settings || {}
      const entitySet = settings.entitySet || settings.contextPath?.replace(/^\//, '').split('/')[0]
      g.node(rid, 'Route', { name: r.name, pattern: r.pattern, template: t.name || t.viewName, entitySet }, { evidence: `${rel}:${lineOf(raw, `"name": "${r.name}"`)}`, source: 'tool:ui5' })
      g.edge(aid, 'has_route', rid, {}, { evidence: `${rel}:${lineOf(raw, `"name": "${r.name}"`)}`, source: 'tool:ui5' })
      if (entitySet && svc) g.edge(rid, 'shows', `svcentity:${svc}.${entitySet}`, {}, { evidence: `${rel}:${lineOf(raw, `"entitySet": "${entitySet}"`)}`, source: 'tool:ui5' })
      for (const nav of Object.values(settings.navigation || {})) {
        if (nav.detail?.route) g.edge(rid, 'navigates_to', `route:${appId}/${nav.detail.route}`, {}, { evidence: `${rel}:${lineOf(raw, `"route": "${nav.detail.route}"`)}`, source: 'tool:ui5' })
      }
    }

    // Freestyle views: bindings and event handlers
    const webapp = path.dirname(mf)
    for (const v of walk(webapp, p => p.endsWith('.view.xml') || p.endsWith('.fragment.xml'))) {
      const vrel = path.relative(root, v)
      const src = fs.readFileSync(v, 'utf8')
      const vid = `view:${vrel}`
      g.node(vid, 'View', { file: vrel }, { evidence: `${vrel}:1`, source: 'tool:ui5' })
      g.edge(aid, 'has_view', vid, {}, { evidence: `${vrel}:1`, source: 'tool:ui5' })
      for (const b of src.matchAll(/["{]\s*(?:path\s*:\s*['"])?\/(\w+)/g)) {
        if (svc && g.nodes.has(`svcentity:${svc}.${b[1]}`)) g.edge(vid, 'binds_to', `svcentity:${svc}.${b[1]}`, {}, { evidence: `${vrel}:${src.slice(0, b.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
      }
      for (const h of src.matchAll(/\b(press|change|select|liveChange|search|submit)="\.?([\w.]+)"/g)) {
        const hid = `uihandler:${vrel}#${h[2]}`
        g.node(hid, 'UIHandler', { event: h[1], method: h[2] }, { evidence: `${vrel}:${src.slice(0, h.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
        g.edge(vid, 'triggers', hid, {}, { evidence: `${vrel}:${src.slice(0, h.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
      }
    }
  }
  return { apps: manifests.length }
}

module.exports = { extractUI5, isManifest }
