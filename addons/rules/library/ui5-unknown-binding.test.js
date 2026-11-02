const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const rule = require('./ui5-unknown-binding')
const { Graph } = require('../../../lib/graph')

function project({ uri = '/catalog/', view = "{/Books}", ctrl = 'bindContext("/submitOrder(...)")' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui5b-'))
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t) }
  w('app/a/webapp/manifest.json', JSON.stringify({ 'sap.app': { dataSources: { main: { uri, type: 'OData' }, s4: { uri: '/sap/opu/odata/sap/API_X/', type: 'OData' } } }, 'sap.ui5': { models: { '': { dataSource: 'main' } } } }, null, 2))
  w('app/a/webapp/view/Main.view.xml', `<List items="${view}"/>`)
  w('app/a/webapp/controller/Main.controller.js', `this.getModel().${ctrl}; this.getView().bindElement({ path: "/x", model: "view" })`)
  const g = new Graph('t')
  g.node('service:C', 'Service', { name: 'C', path: '/catalog' })
  g.node('svcentity:C.Books', 'ServiceEntity', { name: 'C.Books', service: 'C' })
  g.node('action:C.submitOrder', 'Action', { name: 'C.submitOrder', bound: false })
  g.node('ui5app:a', 'UI5App', { manifest: 'app/a/webapp/manifest.json' })
  return { root, g }
}

test('a correct app: nothing; remote APIs and named models are left alone', () => {
  assert.deepStrictEqual(rule.detect(project()), [])
})
test('typos in the entity set, the action and the dataSource path', () => {
  assert.match(rule.detect(project({ view: '{/Bookz}' }))[0].t, /binds \/Bookz.*did you mean Books/)
  assert.match(rule.detect(project({ ctrl: 'bindContext("/submitOrdr(...)")' }))[0].t, /binds \/submitOrdr/)
  assert.match(rule.detect(project({ uri: '/catalogue/' }))[0].t, /uses \/catalogue\/, served nowhere/)
})
