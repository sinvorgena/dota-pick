/**
 * Browser console script — run on https://stratz.com after Steam login.
 * Pulls vs-hero matchups separately for each position (1..5), so we can
 * show a "lane winrate" that's specific to the role our hero is played in
 * (e.g. WR of pos-1 PA vs Lina, distinct from pure global PA-vs-Lina WR).
 *
 * Output schema:
 *   { "1": { "<heroId>": [{ hero_id, games_played, wins }] }, "2": {...}, ... }
 *
 * Usage: same as fetch-stratz-meta.js — paste in console, save the
 * downloaded `stratz-position-matchups.json` to `src/data/`.
 */

;(async () => {
  function getCookieToken() {
    try {
      const m = document.cookie.match(/user=([^;]+)/)
      if (!m) return null
      return JSON.parse(decodeURIComponent(m[1])).token || null
    } catch { return null }
  }

  const TOKEN = getCookieToken()
  if (!TOKEN) {
    console.error('[stratz-pos-matchups] Not logged in — log into stratz.com first')
    return
  }

  const API = 'https://api.stratz.com/graphql'

  async function gql(query) {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ query }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
    const json = await resp.json()
    if (json.errors) throw new Error(JSON.stringify(json.errors))
    return json
  }

  const POSITIONS = [
    { id: 'POSITION_1', pos: 1 },
    { id: 'POSITION_2', pos: 2 },
    { id: 'POSITION_3', pos: 3 },
    { id: 'POSITION_4', pos: 4 },
    { id: 'POSITION_5', pos: 5 },
  ]

  const result = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }

  for (const { id, pos } of POSITIONS) {
    console.log(`[stratz-pos-matchups] Position ${pos}...`)
    try {
      const json = await gql(`query {
        heroStats {
          matchUp(
            bracketBasicIds: [DIVINE_IMMORTAL]
            positionIds: [${id}]
            take: 150
          ) {
            heroId
            vs {
              heroId2
              matchCount
              winCount
            }
          }
        }
      }`)
      const stats = json.data?.heroStats?.matchUp ?? []
      for (const entry of stats) {
        result[pos][entry.heroId] = (entry.vs ?? []).map((v) => ({
          hero_id: v.heroId2,
          games_played: v.matchCount,
          wins: v.winCount,
        }))
      }
      console.log(`  pos ${pos}: ${stats.length} heroes`)
    } catch (e) {
      console.error(`  pos ${pos} failed:`, e.message)
    }
  }

  const totalHeroes = Object.values(result).reduce((s, m) => s + Object.keys(m).length, 0)
  console.log(`[stratz-pos-matchups] Done — ${totalHeroes} hero-position entries`)

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'stratz-position-matchups.json'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
})()
