// Why each thing in the step products exists. Rule (Marvin, 2026-11-10): a picture, list or diagram is
// shown only when it answers a question someone actually has; the reason is written down here and
// printed next to it, so it is not lost. lib/products/index.js drops any view, list or block without an
// entry and records it in summary.json "dropped"; test/products.test.js fails when that happens.
//   q      the question it answers (the heading a reader looks for)
//   cause  why that question matters: the risk, decision or cost behind it
//   form   why this form and not another (chart type, order, what is left out)
//   then   what to do with the answer
// Data files and pages carry `data` / `page`: who reads them and why that format.
// Generated into <out>/steps/reasoning.md and products.json; walkthrough: docs/walkthrough/14-step-products.md

module.exports = {
  run: {
    'timeline.svg': { q: 'Where did the run spend its time, and which stage failed or was skipped?', cause: 'A failed or skipped stage leaves every product after it incomplete, so its numbers must not be trusted.', form: 'Gantt bars on one time axis: duration and order at a glance; colour = how the stage knows (static, measured, AI, failed).', then: 'Read what the failed or skipped stage said in the list below before trusting later cards.' },
    stages: { q: 'What did each stage report?', cause: 'The one-line message of each stage is the first place to look when a number seems off.', form: 'Run order, never truncated: the toolkit has a fixed set of stages.', then: 'Follow a stage to its product card, or rerun with that stage switched on.' },
    'stages.json': { data: 'The manifest stages as recorded; trend dashboards and the PR comment read it.' },
  },
  project: {
    'profiles.svg': { q: 'What runs in development, test and production: database, auth, messaging?', cause: 'Mocked auth or SQLite in production, or a test profile that differs from production, makes tests prove less than they seem.', form: 'Profile × service matrix with fixed rows: grey = mock or local, blue = real platform service.', then: 'If production shows a mock, treat every access result as unproven until it is fixed.' },
    services: { q: 'Which services exist, where are they served, and which have their own code?', cause: 'A service without its own code is generic CAP: its behaviour comes from the model alone, so tests and review focus elsewhere.', form: 'One row per service, sorted by name; filter "own code" to see the generic ones.', then: 'Open the Behaviour matrix for services with code, the API surface for the others.' },
    plugins: { q: 'Which CAP plugins change behaviour without code in this repository?', cause: 'Plugins add handlers, protocols or database behaviour that no source file shows.', form: 'Plain list: plugins are few.', then: 'Read the plugin docs for anything the Behaviour matrix cannot explain.' },
    problems: { q: 'Which questions could CAP not answer about the project?', cause: 'Every unanswered probe question is a gap in all later products.', form: 'Plain list of the probe errors as CAP reported them.', then: 'Fix the setup (install, profile, credentials) and rerun.' },
    'project.json': { data: 'What CAP itself answered (cds.env, services, folders): the source of truth every other stage reads instead of guessing from files.' },
  },
  model: {
    entities: { q: 'Which entities spread a change furthest?', cause: 'Changing a widely used entity touches projections, handlers, screens and tests at once; knowing the reach before a change is cheaper than finding it after.', form: 'Stacked bars per entity, one colour per layer, sorted by total reach; only direct dependencies (3 steps, no associations) so the numbers mean "must be checked", not "might be touched".', then: 'Open "impact" for the entity, or the explorer to walk it, before changing it.' },
    projections: { q: 'Which service entities change when a database entity changes?', cause: 'A field added or removed on the database entity shows up (or breaks) in every projection on it.', form: 'Two columns, database entity → service entities, so one change reads left to right.', then: 'Check each projection on the right when you change the entity on the left.' },
    er: { q: 'How are the entities related?', cause: 'Compositions delete and deep-insert together; associations only refer. That decides what a change or a delete takes with it.', form: 'Mermaid ER diagram, drawn only up to 15 entities: past that it is unreadable and the explorer draws the part you pick.', then: 'Treat a composition parent and its children as one unit in changes and tests.' },
    'explorer.html': { page: 'Model and impact explorer: pick any node and see what depends on it, drawn as graph, rings or layers. Only the affected part is drawn.' },
    'model-graph.json': { data: 'The compact graph (nodes, edges, evidence) the explorer and the query CLI walk.' },
    'impact.json': { data: 'Reach per entity by layer, for trends and the PR comment.' },
    'impact/': { data: 'One Markdown impact list per entity, so an agent or reviewer can read the reach of one entity without a browser.' },
  },
  api: {
    services: { q: 'Which services exist and where are their API documents?', cause: 'Clients, contract tests and reviewers need the standard documents, not our summary.', form: 'One row per service with links to EDMX, OpenAPI, AsyncAPI and the Redoc page.', then: 'Hand the OpenAPI file to client or contract tests; read it in Redoc.' },
    surface: { q: 'Which entity sets accept which operations, and which need no role?', cause: 'An entity set open to any caller is the first thing an attacker or an auditor looks at.', form: 'Entity set × operation matrix, open ones first; amber = no role needed.', then: 'Confirm each amber cell is meant to be public, then check it in the Access map.' },
    'edmx/': { data: 'OData $metadata as CAP compiles it: what every OData client reads.' },
    'openapi/': { data: 'OpenAPI 3 per service (@cap-js/openapi): input for client generators, contract tests and API catalogues.' },
    'asyncapi/': { data: 'AsyncAPI per service with events (@cap-js/asyncapi): the event contract.' },
    'openapi-': { page: 'Redoc, the standard OpenAPI reader: endpoints, parameters and schemas of one service.' },
  },
  behaviour: {
    matrix: { q: 'Where does custom code run: for which entity, phase and event?', cause: 'Everything without a handler is generic CAP behaviour; the code that differs from it is where bugs and business rules live.', form: 'Entity × phase-event matrix: before (blue), on (amber), after (purple); a cell says handlers · rules.', then: 'Read the handlers of the busiest cells first; give each rule a test.' },
    handlers: { q: 'Which handler does what, and where is it?', cause: 'Reviews and tests need the exact code location and the rules inside each handler.', form: 'One row per handler, handlers with most rules first.', then: 'Filter by entity before changing it; every rule here should have a test in Coverage.' },
    sequence: { q: 'In which order does code run for the busiest entity?', cause: 'Before, on and after handlers run in a fixed order; a value set in one phase and overwritten in another is a common surprise.', form: 'Mermaid sequence for one entity, at most 12 handlers; all of them in the handlers list.', then: 'Check that no later phase undoes what an earlier one enforced.' },
    'handlers.json': { data: 'Every handler with phase, events, target and rules, from the handler AST.' },
  },
  screens: {
    'verdicts.svg': { q: 'How many UI promises does the server not enforce?', cause: 'A field the UI hides or locks but the server accepts can be changed by any OData client: the UI is not a security boundary.', form: 'Bars over the four fixed verdicts, red first.', then: 'Fix the red ones on the server (@readonly, @mandatory, a before handler, a restriction).' },
    screens: { q: 'Which page shows which entity, and where are the UI-only promises?', cause: 'A UI-only promise matters most on a page users actually use; this connects the verdict to a screen.', form: 'App → page → entity columns; page colour = worst verdict; pages with most UI-only promises first.', then: 'Open the page, then its promises below.' },
    promises: { q: 'What exactly does each UI promise say, and what does the server do?', cause: 'To fix or test a promise you need the field, the UI rule and the server behaviour side by side.', form: 'One row per promise, UI-only first.', then: 'Turn each UI-only promise into a server rule or a test that pins today\'s behaviour.' },
    'ui-promises.json': { data: 'Every UI promise with UI rule, server rule and verdict.' },
  },
  errors: {
    messages: { q: 'What does a user read when the app says no?', cause: 'Error messages are the part of the app users meet when things go wrong; an untranslated, vague or untested message is a support ticket waiting to happen, and the list doubles as the catalogue of business rules in words.', form: 'One row per message, those no test triggers and those in one language only first; model validations carry CAP\'s standard text.', then: 'Move inline texts into the i18n bundle, write a test that triggers each untested message, and check that each one tells the user what to do.' },
    'messages.json': { data: 'Every message with status, entity, field, condition, translation and test status, for UX review and translation tools.' },
  },
  access: {
    matrix: { q: 'Who may do what, and does the running app agree?', cause: 'Authorization mistakes are the costliest bugs here; the model says what should happen, CI measures what does.', form: 'Operation × user matrix; operations that differ from the measurement or need no role come first.', then: 'Fix every ≠ cell; confirm every "r" (no role needed) is meant to be open.' },
    'access.json': { data: 'Static matrix, users and measured results together, for the who-can query and the PR comment.' },
  },
  checks: {
    files: { q: 'In which files do findings pile up?', cause: 'Findings concentrate; fixing the worst few files removes most of the noise and risk.', form: 'Treemap: size = number of findings, colour = worst severity; with many files only the top ones are drawn.', then: 'Start with red, then large amber tiles.' },
    findings: { q: 'What exactly was found, and where?', cause: 'Each finding needs a location and a kind before someone can fix or dismiss it.', form: 'One row per finding, most severe first; filter by kind or folder.', then: 'Open the location; dismissals go into the rules library so they do not come back.' },
    'checks.sarif': { data: 'SARIF 2.1.0, the OASIS format VS Code\'s SARIF Viewer, GitHub code scanning and most CI tools read.' },
  },
  history: {
    hotspots: { q: 'Where does the code change most?', cause: 'Files that change often and a lot are where new bugs appear; with the findings they show where to invest first.', form: 'Treemap: size = lines changed, colour = number of commits; only the app\'s own CAP folders, no Java, no generated files.', then: 'Review and test hotspots first, especially those with findings.' },
    coupling: { q: 'Which files change together?', cause: 'If two files almost always change in the same commit, a change to one usually needs the other: impact from history, next to impact from the model.', form: 'Pairs with at least 3 shared commits and 50% coupling, strongest first.', then: 'When you change file A, check file B; if the model shows no link between them, look for a hidden one.' },
    'hotspots.json': { data: 'Commits, lines, authors and last change per file.' },
    'coupling.json': { data: 'Coupled file pairs with shared commits and coupling degree.' },
  },
  risk: {
    files: { q: 'Which files are most likely to break unnoticed when changed?', cause: 'A file that changes often, already has findings and has rules no test runs combines the three reasons bugs ship; each signal alone over- or under-rates it.', form: 'Stacked bars per file: each signal scaled to 0-1 against the file with the most of it, so the bar (0-3) shows the score and what drives it; riskiest first.', then: 'Before changing a top file, add the missing tests for its rules; filter "Kind: code" to skip UI and test files.' },
    'risk.json': { data: 'The ranking with every signal per file, for the PR comment and trends.' },
  },
  findings: {
    'ladder.svg': { q: 'How much of what the run claims is proven?', cause: 'A measured finding was seen in the running app; a static one is read from code; an AI one is a suspicion until a test confirms it. Decisions should weigh them differently.', form: 'Stacked bars per kind, one colour per method.', then: 'Prefer measured findings for decisions; send suspected ones to the gap list below.' },
    'severity.svg': { q: 'Which layer holds the severe findings?', cause: 'Severe findings in access or service layers reach users directly; the same count in tests matters less.', form: 'Severity × layer matrix with fixed rows.', then: 'Work the red row from the left.' },
    gaps: { q: 'What could the run not decide, and who can?', cause: 'An open question is a blind spot in every product; naming who can close it (a measurement, an AI pass, a person) turns it into a task.', form: 'One row per question, open first; filter by who can answer.', then: 'Run CI for "measured", static+ai for "ai", and ask the owner for "human".' },
    findings: { q: 'What does the run claim, how was it found, and how sure is it?', cause: 'The evidence behind every claim must be checkable, or the claim is an opinion.', form: 'One row per claim, most severe first; filter by method or status.', then: 'Check the evidence of anything you act on.' },
    'findings.jsonl': { data: 'Every claim with evidence, method and status (JSON Schema in schema/).' },
    'gaps.jsonl': { data: 'Every open or answered question with who can answer it (JSON Schema in schema/).' },
  },
  ai: {
    'funnel.svg': { q: 'How much of what the AI said survived the evidence gate?', cause: 'AI answers are only kept when the gate finds evidence; the funnel shows how much was dropped and so how far to trust the rest.', form: 'Bars from open questions to accepted findings.', then: 'Read the rejected reasons below; many rejections on one question mean it needs a person.' },
    answers: { q: 'What did the AI answer, and why did the gate reject parts of it?', cause: 'Rejections teach where the static analysis or the question was unclear.', form: 'One row per answer, answers with rejections first.', then: 'Turn repeated rejections into a better question or a static rule.' },
    'merge-log.json': { data: 'Each AI answer with what the gate accepted and rejected, and why.' },
    'requests.json': { data: 'The questions handed to the AI, with their evidence.' },
  },
  testdesign: {
    'tree.svg': { q: 'How were the tests designed for each category?', cause: 'Each category uses a known technique (decision table, state transition, pairwise, …); seeing it explains why these classes and not others.', form: 'Category → technique → three sample classes; the full list is below.', then: 'Challenge a technique that does not fit; add a category that is missing.' },
    categories: { q: 'How many classes does each category have, and how many are covered today?', cause: 'A category with many classes and no coverage is a whole kind of behaviour nobody tests.', form: 'One row per category, largest first; never truncated, the categories are fixed.', then: 'Start with the largest uncovered category in Coverage.' },
    pairwise: { q: 'Which input combinations must be tested for the action with most factors?', cause: 'Testing every combination explodes; pairwise covers every pair of values with a few rows and finds most interaction bugs.', form: 'One row per test case, factors as columns.', then: 'Use each row as a test case.' },
    classes: { q: 'Which equivalence classes exist, with input and expected outcome?', cause: 'An equivalence class is one test worth writing; the list is the test backlog.', form: 'One row per class; filter by category or by how it is tested today.', then: 'Pick untested classes from Coverage → Test next.' },
    'classes.json': { data: 'Every equivalence class with input, expected outcome and today\'s status.' },
    'class-seeds.json': { data: 'The facts each class was derived from, so a class can be traced back to code or model.' },
  },
  tests: {
    generated: { q: 'Which tests were generated, and for which class?', cause: 'Before CI runs them, the list shows what will be tested and lets a reviewer drop nonsense early.', form: 'One row per test.', then: 'Let CI run them; this card then shows results.' },
    files: { q: 'Which test files fail?', cause: 'A failing file points to one area of the app.', form: 'Stacked bars per file: passed, failed, skipped (spec tests that pin today\'s behaviour and the intended one).', then: 'Open the failing file\'s tests below.' },
    tests: { q: 'Which tests failed, and with what message?', cause: 'The first failure message is usually enough to tell a real bug from a test problem.', form: 'One row per test, failures first.', then: 'Fix the bug or the test; a skipped spec test is a known risk, not a failure.' },
    requests: { q: 'Which requests did the tests actually send, as whom, with which outcome?', cause: 'It shows what the tests really exercised, independent of what they claim; untouched entities are untested whatever the test names say.', form: 'Entity × event pairs, most frequent first.', then: 'Compare with the Access map: users or operations never sent are blind spots.' },
    'results.ctrf.json': { data: 'Results in CTRF, one JSON shape every CI and dashboard can read.' },
    'generated.json': { data: 'The generated tests with their classes.' },
  },
  coverage: {
    'classes.svg': { q: 'How much of each category is tested, and how?', cause: 'Line coverage says which code ran; class coverage says which business cases are checked, which is what matters for a change.', form: 'Stacked bars per category: tested, generated, spec only, likely, failing, untested.', then: 'Pick from the largest grey part.' },
    next: { q: 'Which untested case should be tested next?', cause: 'Effort goes furthest on cases that are both risky and valuable.', form: 'Highest score (risk × value) first.', then: 'Write or generate the test; rerun to see the class turn green.' },
    never: { q: 'Which handler rules does no test ever run?', cause: 'A rule no test runs can break silently.', form: 'One row per rule, from the measured run.', then: 'Write a test that triggers each rule.' },
    'coverage.json': { data: 'Classes per status and the measured rules.' },
  },
  mutation: {
    files: { q: 'In which files do tests miss code changes?', cause: 'A test suite that passes when the code is changed proves little; mutation score measures that.', form: 'Bars per file, weakest first, 0-100%.', then: 'Strengthen tests for files under 60%.' },
    classes: { q: 'Which business classes have weak tests?', cause: 'Connects mutation results to the business cases, not just files.', form: 'One row per class, weakest first.', then: 'Add assertions to the tests of weak classes.' },
    survivors: { q: 'Which exact code changes went unnoticed?', cause: 'Each survivor is a concrete missing assertion.', form: 'One row per surviving mutant.', then: 'Write the assertion that would have caught it.' },
    'mutation-summary.json': { data: 'Score, files, classes and survivors from the nightly Stryker run.' },
    'report.html': { page: 'Stryker\'s own report (mutation-testing-elements): every mutant in the source.' },
  },
  // every product
  '*': {
    'browse.html': { page: 'Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows.' },
    'lists/': { data: 'All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts.' },
  },
}
