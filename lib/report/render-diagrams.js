// Renders the Mermaid blocks of a Markdown report to PNG + SVG files and replaces each block
// with an image link, so the report displays in viewers that do not render Mermaid.
// The Mermaid source is kept next to the image as a .mmd file.
// Step 6 · Walkthrough: docs/walkthrough/06-slices.md
const fs = require('fs')
const path = require('path')

function loadPlaywright() {
  const candidates = ['playwright', '/opt/node-tools/node_modules/playwright']
  for (const c of candidates) { try { return require(c) } catch {} }
  return null
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diagram'

async function renderDiagrams(mdFile) {
  const pw = loadPlaywright()
  if (!pw) return { rendered: 0, skipped: 'playwright not available' }
  const dir = path.join(path.dirname(mdFile), 'diagrams')
  fs.mkdirSync(dir, { recursive: true })
  const md = fs.readFileSync(mdFile, 'utf8')

  const browser = await pw.chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
  await page.setContent('<html><body style="margin:0;background:#fff"><div id="d"></div></body></html>')
  await page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') })
  await page.evaluate(() => mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { useMaxWidth: false } }))

  let heading = 'diagram', n = 0, out = ''
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const h = l.match(/^#{2,4}\s+(.*)/)
    if (h) heading = h[1]
    if (l.trim() !== '```mermaid') { out += l + '\n'; continue }
    let src = ''
    for (i++; i < lines.length && lines[i].trim() !== '```'; i++) src += lines[i] + '\n'
    const name = `${String(++n).padStart(2, '0')}-${slug(heading)}`
    const svg = await page.evaluate(async ([s, id]) => {
      const { svg } = await mermaid.render(id, s)
      document.getElementById('d').innerHTML = svg
      return svg
    }, [src, `m${n}`])
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg)
    fs.writeFileSync(path.join(dir, `${name}.mmd`), src)
    await (await page.$('#d svg')).screenshot({ path: path.join(dir, `${name}.png`) })
    out += `![${heading}](diagrams/${name}.png)\n\n<sub>Source: [diagrams/${name}.mmd](diagrams/${name}.mmd) · [SVG](diagrams/${name}.svg)</sub>\n`
  }
  await browser.close()
  fs.writeFileSync(mdFile, out.replace(/\n+$/, '\n'))
  return { rendered: n }
}

module.exports = { renderDiagrams }
