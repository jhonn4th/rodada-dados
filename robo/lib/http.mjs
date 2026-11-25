// Acesso educado aos sites: identifica o robô, respeita robots.txt, espaça as requisições.

export const USER_AGENT = 'RodadaBot/0.1 (+robo do app Rodada; consulta horaria; respeita robots.txt)'
const DELAY_MS = Number(process.env.ROBO_DELAY_MS ?? 1500)

const robotsCache = new Map()
let last = 0

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function politeFetch(url) {
  const wait = last + DELAY_MS - Date.now()
  if (wait > 0) await sleep(wait)
  last = Date.now()
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' }, redirect: 'follow' })
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * attempt); continue }
      return res
    } catch (e) {
      if (attempt === 3) throw e
      await sleep(2000 * attempt)
    }
  }
  throw new Error(`falhou: ${url}`)
}

/** Regras do robots.txt aplicáveis a nós (grupo "*" ou "RodadaBot"). */
function parseRobots(txt) {
  const groups = []
  let cur = null
  for (const line of txt.split(/\r?\n/)) {
    const l = line.replace(/#.*/, '').trim()
    if (!l) continue
    const [k, ...rest] = l.split(':')
    const key = k.trim().toLowerCase(), val = rest.join(':').trim()
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(val.toLowerCase())
    } else if ((key === 'disallow' || key === 'allow') && cur) {
      cur.rules.push({ allow: key === 'allow', path: val })
    }
  }
  const mine = groups.find(g => g.agents.some(a => a.includes('rodadabot'))) || groups.find(g => g.agents.includes('*'))
  return mine ? mine.rules : []
}

export async function allowedByRobots(url) {
  const u = new URL(url)
  if (!robotsCache.has(u.origin)) {
    let rules = []
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`)
      const type = res.headers.get('content-type') || ''
      if (res.ok && type.includes('text/plain')) rules = parseRobots(await res.text())
      else if (res.status === 401 || res.status === 403) rules = [{ allow: false, path: '/' }]
    } catch { /* sem robots.txt acessível: sem restrições declaradas */ }
    robotsCache.set(u.origin, rules)
  }
  const path = u.pathname + u.search
  // regra mais específica (maior caminho) vence
  let verdict = true, len = -1
  for (const r of robotsCache.get(u.origin)) {
    if (!r.path) continue
    if (path.startsWith(r.path) && r.path.length > len) { verdict = r.allow; len = r.path.length }
  }
  return verdict
}

/** GET de texto, só se o robots.txt do site permitir. Retorna null se proibido ou 404. */
export async function getText(url) {
  if (!(await allowedByRobots(url))) {
    console.warn(`[robots] ignorado (proibido pelo robots.txt): ${url}`)
    return null
  }
  const res = await politeFetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`)
  return res.text()
}

export const _test = { parseRobots }
