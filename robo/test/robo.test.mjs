import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLanceDay, splitChannels, channelType, lanceUrlFor } from '../lib/lance.mjs'
import { parseGeListing, parseGeAttendance } from '../lib/ge.mjs'
import { teamScore, findSame, teamTokens } from '../lib/nomes.mjs'
import { _test } from '../lib/http.mjs'

// Amostras sintéticas no mesmo formato das páginas reais.
const LANCE = `
<h3 class="x"><strong>Jogos de hoje – Segunda-feira (23/11)</strong></h3>
<h3 class="x"><strong>Brasileirão</strong></h3>
<p class="paragraph-html">19h30 – <strong><a href="#">Internacional</a></strong> x Vitória<br>Canais: Premiere</p>
<p class="paragraph-html"><strong>➡️<a href="#">Clique para assistir</a></strong></p>
<p class="paragraph-html">20h00 – Botafogo x São Paulo<br>Canais: Prime Video</p>
<p class="paragraph-html">21h – Santos x Grêmio<br>Canais: Sportv e Premiere</p>
<h3><strong>Série D</strong></h3>
<p>16h00 – Gama x Brasiliense<br>Canais: YouTube.com/@CazeTV, TV Brasil e Rádio Nacional</p>
`

test('Lance: extrai jogos, horário, competição e canais', () => {
  const g = parseLanceDay(LANCE, '2026-11-23')
  assert.equal(g.length, 4)
  assert.deepEqual(g[0], { date: '2026-11-23', time: '19:30', competition: 'Brasileirão', home: 'Internacional', away: 'Vitória', tv: [{ name: 'Premiere', type: 'ppv' }] })
  assert.equal(g[2].time, '21:00')
  assert.deepEqual(g[2].tv.map(t => t.name), ['Sportv', 'Premiere'])
  assert.equal(g[3].competition, 'Série D')
  assert.deepEqual(g[3].tv, [
    { name: 'CazéTV (YouTube)', type: 'youtube' },
    { name: 'TV Brasil', type: 'aberta' },
    { name: 'Rádio Nacional', type: 'radio' },
  ])
})

test('Lance: formato com "Clique para assistir no ..."', () => {
  const html = `<h3><strong>Brasileirão Série A</strong></h3>
<p>18h – Chapecoense x Palmeiras - <a href="#">Clique para assistir no Premiere com Prime Video!</a></p>
<h3>Champions League</h3><p>17h – Arsenal x Borussia Dortmund - Clique para assistir na HBO MAX com UOL PLAY</p>`
  const g = parseLanceDay(html, '2026-11-24')
  assert.equal(g.length, 2)
  assert.deepEqual(g[0], { date: '2026-11-24', time: '18:00', competition: 'Brasileirão Série A', home: 'Chapecoense', away: 'Palmeiras', tv: [{ name: 'Premiere', type: 'ppv' }] })
  assert.equal(g[1].away, 'Borussia Dortmund')
  assert.equal(g[1].tv[0].name, 'HBO Max')
})

test('ge: data com horário ("2026-11-21T16:30")', () => {
  const g = parseGeListing(GE_LISTING.replace('"2026-11-22"', '"2026-11-22T18:30"'), 'X')
  assert.equal(g[0].date, '2026-11-22')
})

test('Lance: tipos de canal', () => {
  assert.equal(channelType('Globo'), 'aberta')
  assert.equal(channelType('ESPN 4'), 'fechada')
  assert.equal(channelType('Disney+'), 'streaming')
  assert.deepEqual(splitChannels('ESPN, Disney+ e Band'), ['ESPN', 'Disney+', 'Band'])
})

test('Lance: URL pela listagem ou pelo padrão do dia da semana', async () => {
  const listing = '<a href="https://www.lance.com.br/onde-assistir/jogos-de-hoje-quem-joga-no-futebol-e-onde-assistir-ao-vivo-terca-feira-24-11-2026.html">x</a>'
  assert.match(await lanceUrlFor('2026-11-24', listing), /terca-feira-24-11-2026\.html$/)
  assert.match(await lanceUrlFor('2026-11-29', ''), /domingo-29-11-2026\.html$/)
})

const GE_LISTING = `..."jogos":[{"data_realizacao":"2026-11-22","equipes":{"mandante":{"escudo":"x","id":1,"nome_popular":"Atl\\u00e9tico-GO","sigla":"ACG"},"visitante":{"escudo":"y","id":2,"nome_popular":"Vila Nova","sigla":"VNO"}},"hora_realizacao":"18:30","sede":{"nome_popular":"Ant\\u00f4nio Accioly"},"transmissao":{"broadcast":{"id":"ENCERRADA"},"label":"saiba como foi","url":"https:\\/\\/ge.globo.com\\/go\\/futebol\\/brasileirao-serie-b\\/jogo\\/22-11-2026\\/atletico-go-vila-nova.ghtml"}}]...`

test('ge: lê jogos embutidos na página do campeonato', () => {
  const g = parseGeListing(GE_LISTING, 'Brasileirão Série B')
  assert.equal(g.length, 1)
  assert.deepEqual(g[0], {
    date: '2026-11-22', home: 'Atlético-GO', away: 'Vila Nova', competition: 'Brasileirão Série B',
    url: 'https://ge.globo.com/go/futebol/brasileirao-serie-b/jogo/22-11-2026/atletico-go-vila-nova.ghtml',
  })
})

test('ge: lê público e renda da ficha técnica', () => {
  assert.deepEqual(parseGeAttendance('{"text":"P\\u00fablico: 38.631","x":1},{"text":"Renda: R$ 4.446.565,71"}'),
    { paying: null, present: 38631, income: 4446565.71 })
  assert.deepEqual(parseGeAttendance('Público pagante: 35.002 · Público presente: 38.631 · Renda: R$ 900.000'),
    { paying: 35002, present: 38631, income: 900000 })
  assert.equal(parseGeAttendance('sem ficha'), null)
})

test('nomes: casa variações entre fontes e não confunde clubes', () => {
  assert.ok(teamScore('Athletico PR', 'Atletico Paranaense') >= 1)
  assert.ok(teamScore('Red Bull Bragantino', 'RB Bragantino') >= 1)
  assert.ok(teamScore('Remo-PA', 'Remo') >= 1)
  assert.ok(teamScore('Vasco da Gama', 'Vasco') >= 1)
  assert.deepEqual(teamTokens('Gama'), ['gama'])
  assert.ok(teamScore('Atlético-MG', 'Athletico PR') < 0.75)
  const list = [
    { date: '2026-11-23', home: 'Botafogo-SP', away: 'Remo' },
    { date: '2026-11-23', home: 'Botafogo', away: 'São Paulo' },
  ]
  assert.equal(findSame(list, '2026-11-23', 'Botafogo', 'Sao Paulo').away, 'São Paulo')
  assert.equal(findSame(list, '2026-11-24', 'Botafogo', 'Sao Paulo'), null)
})

test('robots.txt: respeita Disallow', () => {
  assert.deepEqual(_test.parseRobots('User-agent: *\nDisallow: /'), [{ allow: false, path: '/' }])
  const r = _test.parseRobots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /')
  assert.deepEqual(r, [{ allow: true, path: '/' }])
})
