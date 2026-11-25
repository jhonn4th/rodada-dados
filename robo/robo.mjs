#!/usr/bin/env node
// Robô do Rodada: monta o arquivo de "onde passa" e "público/renda" que o app lê.
//
// Fontes (ambas permitem robôs no robots.txt; o robô confere a cada execução):
//   - Lance!  -> canais de transmissão (página diária "Jogos de hoje ... onde assistir")
//   - ge      -> público e renda (ficha técnica da página de cada jogo)
// Fonte NÃO usada: borderôs em PDF da CBF (conteudo.cbf.com.br proíbe robôs no robots.txt).
//
// Uso:  node robo/robo.mjs [--saida caminho.json] [--dias-antes 1] [--dias-depois 2]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLance } from './lib/lance.mjs'
import { collectGeListings, fetchGeAttendance } from './lib/ge.mjs'
import { findSame } from './lib/nomes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]])
  return acc
}, []))
const OUT = resolve(args.saida ?? `${here}/saida/extras.json`)
const BEFORE = Number(args['dias-antes'] ?? 1)
const AFTER = Number(args['dias-depois'] ?? 2)
const KEEP_DAYS = 400
const MAX_ATT_TRIES = 8 // páginas sem público: desiste depois de algumas tentativas

const todayBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

async function load() {
  try { return JSON.parse(await readFile(OUT, 'utf8')) } catch { return { matches: [] } }
}

function upsert(list, g) {
  let e = findSame(list, g.date, g.home, g.away)
  if (!e) { e = { date: g.date, home: g.home, away: g.away, tv: [] }; list.push(e) }
  return e
}

async function main() {
  const t0 = Date.now()
  const today = todayBR()
  const data = await load()
  const matches = data.matches.filter(m => m.date >= addDays(today, -KEEP_DAYS))

  // 1) Onde passa (Lance!)
  const dates = []
  for (let i = -BEFORE; i <= AFTER; i++) dates.push(addDays(today, i))
  let tvCount = 0
  for (const g of await collectLance(dates)) {
    const e = upsert(matches, g)
    e.time = g.time
    e.competition ??= g.competition
    if (g.tv.length) { e.tv = g.tv; tvCount++ }
    e.tvSource = g.source
  }

  // 2) Público e renda (ge) — só jogos já disputados e ainda sem público
  let attCount = 0
  for (const g of await collectGeListings()) {
    if (g.date > today) continue
    const e = upsert(matches, g)
    e.competition ??= g.competition
    e.geUrl = g.url
    if (e.attendance || (e.attTries ?? 0) >= MAX_ATT_TRIES) continue
    try {
      const att = await fetchGeAttendance(g.url)
      e.attTries = (e.attTries ?? 0) + 1
      if (att) { e.attendance = att; attCount++; delete e.attTries }
    } catch (err) {
      console.warn(`[ge] ${g.url}: ${err.message}`)
    }
  }

  matches.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      tv: 'Lance! — lance.com.br/onde-assistir',
      attendance: 'ge — ficha técnica das páginas de jogo (ge.globo.com)',
    },
    matches,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8')
  console.log(`OK: ${matches.length} jogos no arquivo | ${tvCount} com canais atualizados | ${attCount} públicos novos | ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  console.log(`Arquivo: ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
