// Atlas section UIS · UI promises vs server (reflexion matrix). Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { short } = require('../../analyse/authz')

const PV = {
  enforced: ['=', 'y', 'server enforces it'], consistent: ['=', 'y', 'server recomputes it'], framework: ['⚙', 'y', 'CAP enforces it'],
  stricter: ['≈', 'a', 'server stricter than UI'], partial: ['≈', 'a', 'server enforces part'], 'ui-only': ['✕', 'r', 'UI promise, server open']
}
function uis(g) {
  const label = r => {
    const p = r.props, e = short(p.entity)
    return {
      'operation-available': `${p.action} offered only if ${p.ui}`, 'field-control': `${e}: ${p.ui}`, CreateHidden: `New ${e} ${p.ui}`, DeleteHidden: `Delete ${e} ${p.ui}`,
      'side-effects': `${e}: ${p.ui}`, readonly: `${e}: read-only ${p.ui}`, mandatory: `${e}: required ${p.ui}`, 'assert.range': `${p.action}: ${p.ui}`
    }[p.kind] || `${e}: ${p.kind}`
  }
  const order = Object.keys(PV)
  const rows = g.byType('UiRule').sort((a, b) => order.indexOf(b.props.verdict) - order.indexOf(a.props.verdict))
    .map(r => [label(r), r.props.ui, r.props.server, r.props.verdict, [r.evidence, ...g.out(r.id, 'enforced_by').map(e => g.nodes.get(e.to)?.evidence).filter(Boolean)].slice(0, 3).join(' · ')])
  return { PARITY: rows, PV }
}

module.exports = { uis, PV }
