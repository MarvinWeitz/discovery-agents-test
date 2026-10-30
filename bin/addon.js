#!/usr/bin/env node
// node bin/addon.js list            enabled addons, one per line
// node bin/addon.js enabled <name>  exit 0 if on, 1 if off (for workflow `if:` steps)
const { enabled, list } = require('../lib/addons')
const [cmd, name] = process.argv.slice(2)
if (cmd === 'enabled') { const on = enabled(name); console.log(`${name}: ${on ? 'on' : 'off'}`); process.exit(on ? 0 : 1) }
if (cmd === 'list') { for (const a of list()) console.log(a.name); process.exit(0) }
console.error('usage: addon.js list | enabled <name>'); process.exit(2)
