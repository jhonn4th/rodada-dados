// "Onde passa": página diária do Lance! "Jogos de hoje: quem joga no futebol e onde assistir ao vivo".
// Formato observado: <h3>Competição</h3> seguido de <p>19h30 – Mandante x Visitante<br>Canais: A e B</p>.

import { getText } from './http.mjs'

const BASE = 'https://www.lance.com.br/onde-assistir'
const WEEKDAY = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado']

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

const stripTags = (html) => decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ')

/** Classifica o canal no mesmo vocabulário do app. */
export function channelType(name) {
  const n = name.toLowerCase()
  if (/youtube|cazé|caze|@/.test(n)) return 'youtube'
  if (/premiere|pay-per-view|ppv/.test(n)) return 'ppv'
  if (/^(globo|tv globo|record|band|sbt|redetv|tv brasil|tv cultura|rede vida)\b/.test(n)) return 'aberta'
  if (/sportv|espn|tnt|xsports|bandsports|band sports|fox|space|goat$/.test(n)) return 'fechada'
  if (/r[aá]dio/.test(n)) return 'radio'
  return 'streaming'
}

/** "YouTube.com/@CazeTV" -> "CazéTV (YouTube)" */
function cleanChannel(c) {
  const t = c.trim().replace(/\.$/, '')
  const yt = t.match(/youtube\.com\/@?([\w.-]+)/i)
  if (yt) {
    const handle = yt[1]
    return `${/^cazetv$/i.test(handle) ? 'CazéTV' : handle} (YouTube)`
  }
  return t
}

/** "HBO MAX" -> "HBO Max" (mantém siglas curtas como ESPN, SBT). */
const ACRONYMS = new Set(['HBO', 'ESPN', 'SBT', 'TNT', 'UOL', 'DAZN', 'TV', 'CBF', 'GE', 'NBA', 'BAND'])
function prettyName(s) {
  return s.trim().split(/\s+/).map(w =>
    (w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !ACRONYMS.has(w)) ? w[0] + w.slice(1).toLowerCase() : w,
  ).join(' ')
}

export function splitChannels(text) {
  return text
    .split(/,|\s+e\s+|;/i)
    .map(cleanChannel)
    .filter(c => c && !/^(n[aã]o (ter[aá]|h[aá])|sem transmiss)/i.test(c))
}

/** Extrai os jogos de uma página diária. `date` = 'YYYY-MM-DD'. */
export function parseLanceDay(html, date) {
  const out = []
  let competition = null
  for (const m of html.matchAll(/<(h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase()
    const text = stripTags(m[2]).trim()
    if (!text) continue
    if (tag === 'h3') {
      if (!/^jogos de hoje/i.test(text)) competition = text
      continue
    }
    // Formato 1: "19h30 – A x B\nCanais: X e Y"
    // Formato 2: "18h – A x B - Clique para assistir no Premiere com Prime Video!"
    const game = text.match(/^(\d{1,2})h(\d{2})?\s*[–—-]\s*(.+?)\s+x\s+(.+?)(?:\s+[–—-]\s+(.+?))?\s*(?:\n|$)/i)
    if (!game) continue
    const canais = text.match(/Canais?:\s*(.+)/i)?.[1]
    const viaLink = game[5]?.match(/assistir\s+(?:ao vivo\s+)?(?:no|na|nos|nas|pelo|pela|em)\s+(.+?)(?:\s+com\s+.+?)?\s*[!.]*$/i)?.[1]
    const names = canais ? splitChannels(canais) : viaLink ? [prettyName(viaLink)] : []
    if (!names.length) continue
    out.push({
      date,
      time: `${game[1].padStart(2, '0')}:${game[2] || '00'}`,
      competition,
      home: game[3].trim(),
      away: game[4].trim(),
      tv: names.map(name => ({ name, type: channelType(name) })),
    })
  }
  return out
}

function isoToParts(iso) {
  const [y, m, d] = iso.split('-')
  return { y, m, d }
}

/** Descobre a URL da página diária (pela listagem; se não achar, monta pelo padrão). */
export async function lanceUrlFor(iso, listingHtml) {
  const { y, m, d } = isoToParts(iso)
  const re = new RegExp(`https?://www\\.lance\\.com\\.br/onde-assistir/jogos-de-hoje[^"'\\s]*-${d}-${m}-${y}\\.html`, 'i')
  const rel = new RegExp(`/onde-assistir/jogos-de-hoje[^"'\\s]*-${d}-${m}-${y}\\.html`, 'i')
  const found = listingHtml?.match(re)?.[0] || (listingHtml?.match(rel)?.[0] && 'https://www.lance.com.br' + listingHtml.match(rel)[0])
  if (found) return found
  const wd = WEEKDAY[new Date(`${iso}T12:00:00-03:00`).getUTCDay()]
  return `${BASE}/jogos-de-hoje-quem-joga-no-futebol-e-onde-assistir-ao-vivo-${wd}-${d}-${m}-${y}.html`
}

export async function collectLance(dates) {
  const listing = await getText(BASE).catch(() => null)
  const all = []
  for (const iso of dates) {
    const url = await lanceUrlFor(iso, listing)
    const html = await getText(url).catch(e => { console.warn(`[lance] ${iso}: ${e.message}`); return null })
    if (!html) { console.log(`[lance] ${iso}: página não encontrada`); continue }
    const games = parseLanceDay(html, iso).map(g => ({ ...g, source: url }))
    console.log(`[lance] ${iso}: ${games.length} jogos com canal`)
    all.push(...games)
  }
  return all
}
