// Normalização de nomes de clubes para casar fontes diferentes
// ("Athletico PR" / "Atletico Paranaense", "Red Bull Bragantino" / "RB Bragantino", "Remo-PA" / "Remo").
// A MESMA lógica existe no app em TeamNames.kt — mantenha as duas iguais.

const DROP = new Set(['fc', 'ec', 'sc', 'ac', 'cr', 'se', 'afc', 'saf', 'clube', 'de', 'da', 'do', 'dos', 'das',
  'futebol', 'esporte', 'esportes', 'regatas', 'red', 'bull', 'rb', 'associacao', 'atletica', 'club', 'the'])

const ALIAS = {
  athletico: 'atletico', atlético: 'atletico',
  paranaense: 'pr', mineiro: 'mg', goianiense: 'go',
}

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Conjunto de "palavras" significativas do nome do clube. */
export function teamTokens(name) {
  const raw = stripAccents(String(name || '').toLowerCase())
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = []
  for (const t of raw) {
    if (DROP.has(t)) continue
    const a = t in ALIAS ? ALIAS[t] : t
    if (a) out.push(a)
  }
  // "Vasco da Gama" -> "vasco" (sem apagar o Gama-DF, que é outro clube)
  if (out.includes('vasco')) return ['vasco']
  return [...new Set(out)]
}

/** 0..1 — quanto dois nomes parecem ser o mesmo clube (1.05 = idênticos). */
export function teamScore(a, b) {
  const A = teamTokens(a), B = teamTokens(b)
  if (!A.length || !B.length) return 0
  const inter = A.filter(t => B.includes(t)).length
  const score = inter / Math.min(A.length, B.length)
  const exact = A.length === B.length && inter === A.length
  return exact ? 1.05 : score
}

export function matchKey(date, home, away) {
  return `${date}|${teamTokens(home).join('-')}|${teamTokens(away).join('-')}`
}

/** Procura em `list` a entrada da mesma data com mandante e visitante equivalentes. */
export function findSame(list, date, home, away, minScore = 0.75) {
  let best = null, bestScore = 0
  for (const e of list) {
    if (e.date !== date) continue
    const h = teamScore(e.home, home), v = teamScore(e.away, away)
    if (h < minScore || v < minScore) continue
    if (h + v > bestScore) { best = e; bestScore = h + v }
  }
  return best
}
