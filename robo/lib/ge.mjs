// Público e renda: ficha técnica publicada na página de cada jogo no ge.globo.
// As páginas de campeonato trazem, embutido no HTML, um JSON com os jogos da rodada
// (data, mandante, visitante e o link da página do jogo).

import { getText } from './http.mjs'

export const GE_COMPETITIONS = {
  'brasileirao-serie-a': 'Brasileirão Série A',
  'brasileirao-serie-b': 'Brasileirão Série B',
  'brasileirao-serie-c': 'Brasileirão Série C',
  'brasileirao-serie-d': 'Brasileirão Série D',
  'copa-do-brasil': 'Copa do Brasil',
}

const unescapeJson = (s) => { try { return JSON.parse(`"${s}"`) } catch { return s } }

/** Jogos listados numa página de campeonato do ge. */
export function parseGeListing(html, competition) {
  const out = []
  const re = /"data_realizacao":"(\d{4}-\d{2}-\d{2})(?:T[\d:]+)?","equipes":\{"mandante":\{[^{}]*?"nome_popular":"((?:[^"\\]|\\.)+)"[^{}]*\},"visitante":\{[^{}]*?"nome_popular":"((?:[^"\\]|\\.)+)"[^{}]*\}[\s\S]{0,1500}?"url":"(https:(?:\\\/|[^"])+?\.ghtml)"/g
  for (const m of html.matchAll(re)) {
    out.push({
      date: m[1],
      home: unescapeJson(m[2]),
      away: unescapeJson(m[3]),
      competition,
      url: unescapeJson(m[4]),
    })
  }
  // um mesmo jogo pode aparecer em mais de um bloco da página
  return [...new Map(out.map(g => [g.url, g])).values()]
}

const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))

/**
 * Lê "Público: 38.631", "Público pagante: 35.002", "Público presente: 38.631",
 * "Renda: R$ 4.446.565,71" da página do jogo (texto aparece dentro de JSON, às vezes escapado).
 */
export function parseGeAttendance(html) {
  const text = html.replace(/\\u00fa/gi, 'ú').replace(/\\u00e7/gi, 'ç').replace(/\\u00e3/gi, 'ã')
  const pick = (re) => { const m = text.match(re); return m ? num(m[1]) : null }
  const paying = pick(/P[úu]blico pagante:?\s*([\d.]+)/i)
  const present = pick(/P[úu]blico (?:presente|total):?\s*([\d.]+)/i) ?? pick(/P[úu]blico:\s*([\d.]+)/i)
  const income = pick(/Renda(?: bruta)?:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i)
  if (paying == null && present == null && income == null) return null
  return { paying, present: present ?? paying, income }
}

export async function collectGeListings() {
  const all = []
  for (const [slug, name] of Object.entries(GE_COMPETITIONS)) {
    const html = await getText(`https://ge.globo.com/futebol/${slug}/`).catch(e => { console.warn(`[ge] ${slug}: ${e.message}`); return null })
    if (!html) continue
    const games = parseGeListing(html, name)
    console.log(`[ge] ${slug}: ${games.length} jogos na página`)
    all.push(...games)
  }
  return all
}

export async function fetchGeAttendance(url) {
  const html = await getText(url)
  return html ? parseGeAttendance(html) : null
}
