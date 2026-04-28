/**
 * Browser console script — run on https://stratz.com after Steam login.
 * Auto-extracts session token from cookies, queries the GraphQL API for
 * top heroes per position (Divine+Immortal bracket), and downloads
 * `meta-stats.json` ready to drop into `src/data/`.
 *
 * Usage:
 *   1. Open https://stratz.com and log in with Steam
 *   2. Open DevTools console
 *   3. Paste the contents of this file & press Enter
 *   4. Save the downloaded `meta-stats.json` to `src/data/meta-stats.json`
 *
 * Output schema:
 *   { "1": [{ shortName, matchCount, winCount }], "2": [...], ... "5": [...] }
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
    console.error('[stratz-meta] Not logged in — log into stratz.com with Steam first')
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

  // Map Stratz positionId → our 1..5
  const POSITIONS = [
    { id: 'POSITION_1', pos: 1 },
    { id: 'POSITION_2', pos: 2 },
    { id: 'POSITION_3', pos: 3 },
    { id: 'POSITION_4', pos: 4 },
    { id: 'POSITION_5', pos: 5 },
  ]

  // Fetch the static hero map first — Stratz returns numeric heroIds, but our
  // codebase keys everything by shortName (= OpenDota internal name).
  console.log('[stratz-meta] Fetching hero list...')
  const heroJson = await gql(`query { constants { heroes { id shortName } } }`)
  const heroes = heroJson.data?.constants?.heroes ?? []
  const idToShort = new Map(heroes.map((h) => [h.id, h.shortName]))
  console.log(`[stratz-meta] ${idToShort.size} heroes mapped`)

  const result = { 1: [], 2: [], 3: [], 4: [], 5: [] }

  // Pull win/match counts per hero per position over the last week,
  // bracket = Divine+Immortal. Aggregate over `week` since Stratz bins
  // results — we sum to get a single matchCount/winCount per hero.
  for (const { id, pos } of POSITIONS) {
    console.log(`[stratz-meta] Position ${pos}...`)
    const json = await gql(`query {
      heroStats {
        winWeek(
          bracketIds: [DIVINE, IMMORTAL]
          positionIds: [${id}]
          take: 10000
        ) {
          heroId
          matchCount
          winCount
        }
      }
    }`)
    const rows = json.data?.heroStats?.winWeek ?? []
    // Aggregate by heroId (rows come per-week)
    const agg = new Map()
    for (const r of rows) {
      const cur = agg.get(r.heroId) ?? { matchCount: 0, winCount: 0 }
      cur.matchCount += r.matchCount
      cur.winCount += r.winCount
      agg.set(r.heroId, cur)
    }
    const entries = []
    for (const [heroId, stat] of agg.entries()) {
      const shortName = idToShort.get(heroId)
      if (!shortName) continue
      entries.push({ shortName, matchCount: stat.matchCount, winCount: stat.winCount })
    }
    // Sort by matchCount desc — most-picked first, that's "the meta"
    entries.sort((a, b) => b.matchCount - a.matchCount)
    // Cap at top 50 per position — covers the long tail of niche picks too
    result[pos] = entries.slice(0, 50)
    console.log(`pos ${pos}: ${result[pos].length} heroes`)
  }

  const total = Object.values(result).reduce((s, a) => s + a.length, 0)
  console.log(`[stratz-meta] Done — ${total} entries across 5 positions`)

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'meta-stats.json'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
})()
