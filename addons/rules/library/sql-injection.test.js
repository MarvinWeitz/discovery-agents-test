const test = require('node:test')
const assert = require('node:assert')
const rule = require('./sql-injection')
const file = text => [{ path: 'srv/s.js', text }]

test('native SQL and CQL where strings built from request data', () => {
  const hits = rule.detect({ files: file([
    "module.exports = srv => {",
    "  srv.on('a', req => cds.run(`SELECT * FROM T WHERE name LIKE '%${req.data.q}%'`))",
    "  srv.on('b', req => { const { q } = req.data; return SELECT.from(T).where(`name like '%${q}%'`) })",
    "  srv.on('c', req => { const s = 'SELECT * FROM T WHERE ID = ' + req.params[0]; return db.run(s + '') })",
    "}"].join('\n')) })
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.js:2', 'srv/s.js:3', 'srv/s.js:4'])
})
test('bound values, tagged templates and entity names are safe', () => {
  assert.strictEqual(rule.detect({ files: file([
    "module.exports = srv => {",
    "  srv.on('a', req => SELECT.from(T).where({ name: { like: req.data.q } }))",
    "  srv.on('b', req => SELECT.from(T).where`name like ${req.data.q}`)",
    "  srv.on('c', req => cds.run(`UPDATE ${Orders} SET x = 1 WHERE ID = ?`, [req.data.ID]))",
    "}"].join('\n')) }).length, 0)
})
