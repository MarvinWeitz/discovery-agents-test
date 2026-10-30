// The fixed per-slice checklist; schema/facts.md documents the same list.
const QUESTIONS = [
  ['Q1', 'Entry points: which UI routes, OData operations and actions reach this slice?', 'flow-tracer'],
  ['Q2', 'Path: for each entry point, which handlers run in which phase, and what is read or written?', 'flow-tracer'],
  ['Q3', 'Authorization: who may do what, and where is it enforced?', 'behaviour-analyst'],
  ['Q4', 'Rules: every rejection, derivation, default and assertion, in business terms', 'behaviour-analyst'],
  ['Q5', 'States: lifecycle and state transitions, and which are allowed', 'behaviour-analyst'],
  ['Q6', 'Events and integrations: events, remote calls, failure handling', 'event-integration-analyst'],
  ['Q7', 'Errors: which errors reach the caller, with which status and message', 'behaviour-analyst'],
  ['Q8', 'Dependencies: which other slices share entities, handlers or files', 'flow-tracer'],
  ['Q9', "Patterns: where does the slice deviate from the project's own patterns?", 'risk-reviewer'],
  ['Q10', 'Existing tests: what do they cover, and where are they weak?', 'risk-reviewer'],
]


module.exports = { QUESTIONS }
