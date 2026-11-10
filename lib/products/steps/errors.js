// Product "Error messages": everything a user can read when the app says no. Two sources:
//   code   req.reject / req.error / req.warn in handlers (Rule nodes of kind "rejection": status, message,
//          field, condition), with the entity, the screens that show it, whether a test triggered it (CI)
//   model  validations CAP enforces from annotations (@mandatory, @assert.range, @assert.format,
//          @assert.target) with CAP's standard message, read from the installed @sap/cds (_i18n/messages)
// and whether each text can be translated: an i18n key with its languages, or inline text (one language).
const fs = require('fs')
const path = require('path')

const ANN = { '@mandatory': 'ASSERT_MANDATORY', '@assert.range': 'ASSERT_RANGE', '@assert.format': 'ASSERT_FORMAT', '@assert.target': 'ASSERT_TARGET' }

// CAP's own message texts and how many languages ship them (the customer's or the toolkit's @sap/cds)
function capMessages() {
  try {
    const dir = path.join(path.dirname(require.resolve('@sap/cds/package.json')), '_i18n')
    const text = Object.fromEntries(fs.readFileSync(path.join(dir, 'messages.properties'), 'utf8').split('\n').map(l => l.match(/^(\w+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/''/g, "'")]))
    return { text, langs: fs.readdirSync(dir).filter(f => /^messages_[a-z]{2}(_[A-Z]{2})?\.properties$/.test(f)).length }
  } catch { return { text: {}, langs: 0 } }
}

// the app's own message bundles: key -> languages that define it
function appBundles(root) {
  const keys = {}
  if (!root) return keys
  for (const d of ['_i18n', 'i18n', 'srv/_i18n', 'srv/i18n', 'db/_i18n']) {
    const dir = path.join(root, d)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter(f => /^(messages|i18n)(_[\w]+)?\.properties$/.test(f))) {
      const lang = (f.match(/_([\w]+)\.properties$/) || [, 'default'])[1]
      for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { const m = l.match(/^([\w.]+)\s*=/); if (m) (keys[m[1]] ||= new Set()).add(lang) }
    }
  }
  return keys
}

module.exports = {
  id: 'errors', title: 'Error messages', step: 'Handler AST and model validations', layer: 'ui',
  does: 'Every message a user can get when the app says no: from handler code and from model validations, with status, field, condition, screens, translation and test status.',
  from: ['run/graph/ (Rule, Handler, Route)', 'run/csn.json', '@sap/cds _i18n/messages', 'app _i18n bundles', 'atlas-data.json MEASURED.rules (CI)'],
  build(C) {
    const nodes = C.nodes(), edges = C.edges(), byId = C.byId(), csn = C.csn(), M = C.facts().MEASURED?.rules
    const never = new Set((M?.never || []).map(r => r.id)), cap = capMessages(), bundles = appBundles(C.root())
    const short = s => String(s || '').split('.').pop()
    // which pages show an entity (route -shows-> service entity)
    const pages = {}
    for (const e of edges.filter(e => e.rel === 'shows')) { const r = byId.get(e.from), t = byId.get(e.to); if (r && t) (pages[short(t.props.name || t.id)] ||= new Set()).add(r.props.name || r.id.split(':').pop()) }
    const entityOf = h => {
      if (!h) return ''
      const act = edges.find(e => e.from === h.id && e.rel === 'handles' && e.to.startsWith('action:'))?.to
      return short(h.props.target || h.props.targets?.[0] || (act ? act.split(':')[1].split('.').slice(-2, -1)[0] : '') || h.props.service)
    }
    const translation = msg => {
      const k = String(msg).match(/^\{i18n>([\w.]+)\}$|^([A-Z][A-Z0-9_]{2,})$/)
      if (!k) return { tr: 'inline text', langs: 1 }
      const key = k[1] || k[2], n = bundles[key]?.size || 0
      return { tr: n ? `key ${key} · ${n} bundles` : `key ${key} · not found`, langs: n }
    }
    const rows = []
    for (const r of nodes.filter(n => n.type === 'Rule' && n.props.kind === 'rejection')) {
      const h = byId.get(r.props.handler), ent = entityOf(h), t = translation(r.props.message || '')
      rows.push({ message: r.props.message || '(no message)', status: r.props.status || '', origin: 'code', kind: r.props.severity || 'reject', entity: ent, field: String(r.props.target || '').replace(/^in\//, ''), when: r.props.guard || '', screens: [...(pages[ent] || [])], translation: t.tr, tested: !M ? 'not measured' : never.has(r.id) ? 'never triggered' : 'triggered by a test', where: r.evidence, dynamic: /\$\{/.test(r.props.message || '') ? 'yes' : 'no' })
    }
    // model validations, on database entities only (service projections inherit them)
    const svcs = Object.entries(csn?.definitions || {}).filter(([, d]) => d.kind === 'service').map(([n]) => n + '.')
    for (const [name, d] of Object.entries(csn?.definitions || {})) {
      if (d.kind !== 'entity' || svcs.some(s => name.startsWith(s)) || /\.texts$/.test(name)) continue
      for (const [el, def] of Object.entries(d.elements || {})) for (const [a, key] of Object.entries(ANN)) {
        if (def[a] === undefined || def[a] === false) continue
        const custom = def[`${a}.message`]
        const ent = short(name)
        rows.push({ message: custom || cap.text[key] || key, status: 400, origin: 'model', kind: a, entity: ent, field: el, when: a === '@assert.range' ? `outside ${JSON.stringify(def[a])}` : a === '@assert.format' ? `not matching ${def[a]}` : a === '@mandatory' ? 'value missing' : 'target does not exist', screens: [...(pages[ent] || [])], translation: custom ? translation(custom).tr : `CAP standard ${key} · ${cap.langs} languages`, tested: 'not measured', where: def.$location ? `${def.$location.file}:${def.$location.line}` : name })
      }
    }
    if (!rows.length) return { status: 'empty', why: 'no rejections in handler code and no validation annotations in the model', kpis: [{ label: 'messages', value: 0 }] }
    for (const r of rows) r.rank = (r.tested === 'never triggered' ? 4 : 0) + (r.translation === 'inline text' ? 2 : 0) + (r.origin === 'code' ? 1 : 0)
    const code = rows.filter(r => r.origin === 'code'), inline = code.filter(r => r.translation === 'inline text'), untested = rows.filter(r => r.tested === 'never triggered')
    const md = [
      `${rows.length} messages: ${code.length} from handler code, ${rows.length - code.length} from model validations. **${inline.length} of the code messages are inline text** (one language only)${M ? `; **${untested.length} were never triggered by a test**` : '; whether tests trigger them is measured in CI'}.`, '',
      '{{list:messages}}',
    ].join('\n')
    return {
      status: untested.length || inline.length ? 'warn' : 'ok',
      kpis: [{ label: 'messages', value: rows.length }, { label: 'from code', value: code.length }, { label: 'inline text', value: inline.length, tone: inline.length ? 'warn' : undefined }, { label: M ? 'never triggered' : 'triggered', value: M ? untested.length : 'in CI', tone: untested.length ? 'bad' : undefined }],
      md,
      lists: { messages: {
        title: 'Error messages', noun: 'messages',
        columns: [{ key: 'message', label: 'Message' }, { key: 'status', label: 'Status', facet: true }, { key: 'entity', label: 'Entity', facet: true }, { key: 'field', label: 'Field' }, { key: 'when', label: 'When' }, { key: 'origin', label: 'From', facet: true }, { key: 'translation', label: 'Translation' }, { key: 'tested', label: 'Tested', facet: true }, { key: 'screens', label: 'Screens', facet: true }, { key: 'where', label: 'Where' }, { key: 'rank', label: 'Attention', num: true, hide: true }],
        rows, sort: { key: 'rank', dir: 'desc' },
      } },
      data: { 'messages.json': rows.map(({ rank, ...r }) => r) },
    }
  },
}
