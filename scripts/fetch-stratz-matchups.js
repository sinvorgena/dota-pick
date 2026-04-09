/**
 * Browser console script — run on https://stratz.com
 * Auto-extracts session token from cookies. Just paste & run.
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
  if (!TOKEN) { console.error('[stratz] Not logged in — log into stratz.com with Steam first'); return }

  const API = 'https://api.stratz.com/graphql'

  async function gql(query) {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ query }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
    }
    const json = await resp.json()
    if (json.errors) throw new Error(JSON.stringify(json.errors))
    return json
  }

  console.log('[stratz] Fetching ALL matchup data (Divine+Immortal, take:150)...')

  try {
    const json = await gql(`query {
      heroStats {
        matchUp(bracketBasicIds: [DIVINE_IMMORTAL], take: 150, skip: 0) {
          heroId
          vs {
            heroId2
            matchCount
            winCount
          }
        }
      }
    }`)
    const stats = json.data?.heroStats?.matchUp
    if (stats?.length > 0) {
      const result = {}
      for (const entry of stats) {
        result[entry.heroId] = (entry.vs || []).map((v) => ({
          hero_id: v.heroId2,
          games_played: v.matchCount,
          wins: v.winCount,
        }))
      }
      const hc = Object.keys(result).length
      const tp = Object.values(result).reduce((s, a) => s + a.length, 0)
      const counts = Object.values(result).filter(a => a.length > 0).map(a => a.length)
      console.log(`[stratz] Done! ${hc} heroes, ${tp} pairs (avg ${(tp/hc).toFixed(0)} per hero, min ${Math.min(...counts)}, max ${Math.max(...counts)})`)

      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'stratz-matchups.json'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      console.error('[stratz] No data returned')
    }
  } catch (e) {
    console.error('[stratz] Failed:', e.message)
  }
})()
