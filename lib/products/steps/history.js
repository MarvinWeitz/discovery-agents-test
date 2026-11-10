// Product "Hotspots and change coupling": where the code changes most and which files change together,
// from `git log` of the app checkout. Idea from Adam Tornhill's "Your Code as a Crime Scene" (code-maat
// is GPL-3.0, so only the method is reused; the numbers come straight from git).
const { execFileSync } = require('child_process')

const OWN = /\.(cds|js|ts|mjs|cjs|xml|json|csv|hdbview|hdbtable|hdbcalculationview|sql|properties)$/
const NOISE = /(^|\/)(package-lock\.json|node_modules\/|\.github\/|gen\/|dist\/|mta_archives\/)|(^|\/)(_i18n|i18n)\/|\.java$|(^|\/)pom\.xml$|(^|\/)src\/(main|test)\/(java|resources)\//
// CAP Node.js only: Java files and Maven builds are out of scope

function log(root, folders) {
  const out = execFileSync('git', ['-C', root, 'log', '--no-merges', '--numstat', '--format=@%H|%an|%cI', '--', '.'], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
  const commits = []
  let cur = null
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) { const [h, a, d] = line.slice(1).split('|'); cur = { h, a, d, files: [] }; commits.push(cur); continue }
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (m && cur && OWN.test(m[3]) && !NOISE.test(m[3]) && (!folders.length || folders.some(f => m[3].startsWith(f)) || m[3] === 'package.json')) cur.files.push({ f: m[3], n: (+m[1] || 0) + (+m[2] || 0) })
  }
  return commits
}

module.exports = {
  id: 'history', title: 'Hotspots and change coupling', step: 'Git history', layer: 'run',
  does: 'Where the code changes most, which files change in the same commits, and how many people touch each file.',
  from: ['git log of the app checkout'],
  build(C) {
    const root = C.root()
    if (!root) return { status: 'empty', why: 'the app checkout is not next to this run, so git history was not read' }
    let commits
    // only the folders CAP uses (db, srv, app from cds.env), so a Java backend in the same repo stays out
    const folders = [...new Set(Object.values(C.project()?.folders || {}).map(f => String(f).replace(/\*.*$/, '')).filter(f => f && f !== './'))]
    try { commits = log(root, folders) } catch { return { status: 'empty', why: 'not a git checkout' } }
    if (!commits.length) return { status: 'empty', why: 'no commits' }
    const F = {}
    for (const c of commits) for (const { f, n } of c.files) { const x = F[f] ||= { file: f, commits: 0, lines: 0, authors: new Set(), last: c.d }; x.commits++; x.lines += n; x.authors.add(c.a); if (c.d > x.last) x.last = c.d }
    const files = Object.values(F).map(x => ({ ...x, authors: x.authors.size })).sort((a, b) => b.commits - a.commits)
    // change coupling: share of commits two files appear in together (min 3 shared commits, sets of < 30 files)
    const pair = {}
    for (const c of commits) { const fs = [...new Set(c.files.map(x => x.f))]; if (fs.length < 2 || fs.length > 30) continue; for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) { const k = [fs[i], fs[j]].sort().join('\u0000'); pair[k] = (pair[k] || 0) + 1 } }
    const coupling = Object.entries(pair).map(([k, n]) => { const [a, b] = k.split('\u0000'); return { a, b, shared: n, degree: Math.round(100 * n / Math.min(F[a].commits, F[b].commits)) } }).filter(p => p.shared >= 3 && p.degree >= 50).sort((x, y) => y.degree - x.degree || y.shared - x.shared)
    const maxC = files[0]?.commits || 1
    const heat = c => { const t = c / maxC; return t > .66 ? '#c2414b' : t > .33 ? '#c27c0e' : '#3f7fbf' }
    const hotspots = {
      title: 'Hotspots', noun: 'files', what: 'Every source file git saw change. In the picture size = lines changed, colour = number of commits (red the most).',
      columns: [{ key: 'file', label: 'File' }, { key: 'folder', label: 'Folder', facet: true }, { key: 'commits', label: 'Commits', num: true }, { key: 'lines', label: 'Lines changed', num: true }, { key: 'authors', label: 'Authors', num: true }, { key: 'last', label: 'Last change' }],
      rows: files.map(f => ({ file: f.file, folder: f.file.includes('/') ? f.file.split('/').slice(0, -1).join('/') : '.', commits: f.commits, lines: f.lines, authors: f.authors, last: f.last.slice(0, 10), _c: heat(f.commits), _n: `${f.commits} commits · ${f.authors} authors` })),
      sort: { key: 'commits', dir: 'desc' }, chart: { kind: 'tree', label: 'file', value: 'lines', title: 'Hotspots: size = lines changed, colour = number of commits' },
    }
    const pairs = {
      title: 'Change together', noun: 'pairs', what: 'Files that appear in the same commits at least half of the time: a change to one usually needs the other.',
      columns: [{ key: 'a', label: 'File A' }, { key: 'b', label: 'File B' }, { key: 'shared', label: 'Shared commits', num: true }, { key: 'degree', label: 'Coupling %', num: true }],
      rows: coupling.map(p => ({ a: p.a, b: p.b, shared: p.shared, degree: p.degree, _label: `${p.a.split('/').pop()} ↔ ${p.b.split('/').pop()}`, _n: `${p.degree}% · ${p.shared} commits` })),
      sort: { key: 'degree', dir: 'desc' }, chart: { kind: 'bars', label: '_label', value: 'degree', max: 100, unit: '%', tone: 'warn', title: 'Change coupling (share of commits together)' },
      empty: '_No pair of files changes together in at least 3 commits and half of the time._',
    }
    const md = [
      `${commits.length} commits · ${files.length} source files · ${new Set(commits.map(c => c.a)).size} authors · last change ${commits[0].d.slice(0, 10)}.`, '',
      '### Most changed', '', '{{list:hotspots}}',
      '### Change together', '', 'This is impact from history, next to the impact from the model.', '', '{{list:coupling}}',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'commits', value: commits.length }, { label: 'files changed', value: files.length }, { label: `hottest: ${files[0]?.file.split('/').pop()}`, value: files[0]?.commits || 0 }, { label: 'coupled pairs', value: coupling.length }],
      md, lists: { hotspots, coupling: pairs }, data: { 'hotspots.json': files, 'coupling.json': coupling },
    }
  },
}
