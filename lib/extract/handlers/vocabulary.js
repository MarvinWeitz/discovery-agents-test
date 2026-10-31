// Step 3 · CAP vocabulary the handler parser recognises. Extend these lists when an app uses a form
// the parser does not know yet. Walkthrough: docs/walkthrough/03-handlers.md

// events that are CRUD or draft operations (everything else is an action, function or event name)
const CRUD = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'NEW', 'EDIT', 'SAVE', 'CANCEL', 'PATCH', 'UPSERT', '*']
// CQL statement builders: SELECT.from(X), UPDATE(X).with(...), ...
const QL = ['SELECT', 'INSERT', 'UPSERT', 'UPDATE', 'DELETE']
// handler registration methods: srv.before / on / after
const PHASES = ['before', 'on', 'after']
// receivers whose .on(...) is a lifecycle or Node event, not a service handler (cds.on('served'), process.on('exit'))
const NOT_SERVICES = ['cds', 'app', 'process', 'module', 'emitter']
// a string is SQL when it starts like this
const SQL_START = /^\s*(SELECT|INSERT|UPSERT|UPDATE|DELETE|CALL|CREATE|DROP|ALTER|MERGE|WITH|DO\s+BEGIN)\b/i
// statements that only HANA understands (procedures, sequences, DUMMY, SQLScript built-ins)
const HANA_ONLY = /\bCALL\b|NEXTVAL|CURRVAL|\bFROM\s+DUMMY\b|\bSYS\.|SQLSCRIPT|\bDO\s+BEGIN|ADD_(SECONDS|DAYS)|CURRENT_UTCTIMESTAMP|SERIES_GENERATE|TO_NVARCHAR|CONTAINS\s*\(/i
// methods that call a connected service: ReviewsService.read(...), s4.run(query), messaging.emit(...)
const REMOTE_CALLS = ['read', 'create', 'insert', 'upsert', 'update', 'delete', 'run', 'send', 'emit', 'get', 'post', 'put', 'patch']
// switch / if on these database kinds counts as a database branch
const DB_KINDS = /^['"](hana|sqlite|postgres|h2)['"]$/
const DB_KINDS_IF = /^['"](hana|sqlite|postgres)['"]$/

const flat = s => s.replace(/\s+/g, ' ').trim()

module.exports = { CRUD, QL, PHASES, NOT_SERVICES, SQL_START, HANA_ONLY, REMOTE_CALLS, DB_KINDS, DB_KINDS_IF, flat }
