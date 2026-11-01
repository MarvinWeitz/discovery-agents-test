// JSON Schema validation (Ajv, MIT) for the run's machine-readable files: findings, gaps, AI answers,
// manifest. Schemas live in schema/*.schema.json (draft 2020-12).
// Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const Ajv2020 = require('ajv/dist/2020')

const DIR = path.join(__dirname, '..', 'schema')
let ajv
const compiled = {}

function validator(name) {
  if (!ajv) ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  return compiled[name] ||= ajv.compile(JSON.parse(fs.readFileSync(path.join(DIR, `${name}.schema.json`), 'utf8')))
}

// returns [] when valid, else readable problems ("<where> <path> <message>")
function check(name, value, where = name) {
  const v = validator(name)
  if (v(value)) return []
  return v.errors.map(e => `${where} ${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`)
}

module.exports = { check, DIR }
