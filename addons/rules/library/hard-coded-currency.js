// Drafted from agent finding A12 (cap-sflight): the analytics view sums all FlightPrices as 'USD'.
// Pattern: a CDS projection or handler puts a literal ISO currency code where a currency column goes.
const ISO = 'USD|EUR|GBP|JPY|CHF|CNY|INR|AUD|CAD|SEK|NOK|DKK|PLN|CZK|BRL|MXN|ZAR|SGD|HKD|KRW'
module.exports = {
  key: 'hard-coded-currency',
  title: 'Currency hard-coded where amounts are aggregated or returned',
  status: 'draft',
  from: 'agent finding A12 (cap-sflight, 2026-10-29)',
  i: 2, l: 3, lay: 'Service',
  test: 'Seed amounts in two currencies; assert the result converts or groups by currency instead of labelling all with one code.',
  detect({ files }) {
    const out = []
    const re = new RegExp(`['"](${ISO})['"]\\s*(?:as\\s+(\\w*[Cc]urrency\\w*)|,|\\)|;)`)
    for (const f of files.filter(f => /\.(cds|js|ts)$/.test(f.path))) {
      f.text.split('\n').forEach((ln, i) => {
        if (/^\s*(\/\/|\*|@)/.test(ln) || /@(title|description|Common\.Label)|\bdefault\b/.test(ln)) return
        const m = ln.match(re)
        if (!m || (!m[2] && !/currency/i.test(ln))) return
        out.push({ ev: `${f.path}:${i + 1}`, t: `'${m[1]}' hard-coded as ${m[2] || 'currency'}`, d: `${f.path}:${i + 1} sets the currency to the literal '${m[1]}'. Amounts in other currencies are then labelled (and summed) as ${m[1]}.` })
      })
    }
    return out
  }
}
