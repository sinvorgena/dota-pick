/**
 * Node.js script — fetches Stratz matchup data using session token from browser.
 *
 * Usage:
 *   node scripts/fetch-stratz-node.cjs
 *
 * Output: src/data/stratz-matchups.json
 */

const fs = require('fs')
const path = require('path')

// Session token from stratz.com cookie (user.token) — issued after Steam login
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdWJqZWN0IjoiYTZhMGZlMmQtMWFmZi00NDhlLTgyN2EtYmYwZDg1ZGRiYjk2IiwiU3RlYW1JZCI6IjMxNDkzMzgyNyIsIkFQSVVzZXIiOiJ0cnVlIiwibmJmIjoxNzc1NDc3NzUwLCJleHAiOjE4MDcwMTM3NTAsImlhdCI6MTc3NTQ3Nzc1MCwiaXNzIjoiaHR0cHM6Ly9hcGkuc3RyYXR6LmNvbSJ9.NvLoBt5r80WQf9eDkgXlDpDWHYIZCt-Oqz48J2YCtsA'

const API = 'https://api.stratz.com/graphql'
const OUT = path.join(__dirname, '..', 'src', 'data', 'stratz-matchups.json')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

async function gql(query) {
  const resp = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': UA,
      Accept: 'application/json',
    },
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

;(async () => {
  console.log('[stratz] Testing connection...')
  try {
    const test = await gql('{ constants { heroes(ids: [1]) { id } } }')
    if (!test.data) throw new Error('No data')
    console.log('[stratz] Connection OK!')
  } catch (e) {
    console.error('[stratz] Connection failed:', e.message)
    process.exit(1)
  }

  console.log('[stratz] Fetching matchup data (Divine+Immortal)...')

  // --- Attempt 1: bulk ---
  try {
    const json = await gql(`query {
      heroStats {
        matchUp(bracketBasicIds: [DIVINE_IMMORTAL]) {
          heroId
          vs { heroId2 winsAverage gameCount }
        }
      }
    }`)
    const stats = json.data?.heroStats?.matchUp
    if (stats?.length > 0) {
      const result = {}
      for (const entry of stats) {
        result[entry.heroId] = (entry.vs || []).map((v) => ({
          hero_id: v.heroId2,
          games_played: v.gameCount,
          wins: Math.round(v.winsAverage * v.gameCount),
        }))
      }
      save(result)
      return
    }
    console.warn('[stratz] Bulk returned empty, trying per-hero...')
  } catch (e) {
    console.warn('[stratz] Bulk failed:', e.message, '— trying per-hero...')
  }

  // --- Attempt 2: per-hero ---
  const heroListJson = await gql('{ constants { heroes { id } } }')
  const heroIds = heroListJson.data.constants.heroes
    .map((h) => h.id)
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
  console.log(`[stratz] ${heroIds.length} heroes, fetching in batches of 5...`)

  const result = {}
  const BATCH = 5

  for (let i = 0; i < heroIds.length; i += BATCH) {
    const batch = heroIds.slice(i, i + BATCH)
    try {
      const fragments = batch.map(
        (id) => `hero_${id}: heroVsHeroMatchup(heroId: ${id}, bracketBasicIds: [DIVINE_IMMORTAL]) {
          advantage { heroId2 winsAverage gameCount }
        }`,
      )
      const bJson = await gql(`query { ${fragments.join('\n')} }`)
      for (const id of batch) {
        const data = bJson.data?.[`hero_${id}`]?.advantage || []
        result[id] = data.map((v) => ({
          hero_id: v.heroId2,
          games_played: v.gameCount,
          wins: Math.round(v.winsAverage * v.gameCount),
        }))
      }
    } catch (e) {
      console.warn(`[stratz] Batch ${i} failed, trying individually...`)
      for (const id of batch) {
        try {
          const json = await gql(`query {
            heroVsHeroMatchup(heroId: ${id}, bracketBasicIds: [DIVINE_IMMORTAL]) {
              advantage { heroId2 winsAverage gameCount }
            }
          }`)
          const data = json.data?.heroVsHeroMatchup?.advantage || []
          result[id] = data.map((v) => ({
            hero_id: v.heroId2,
            games_played: v.gameCount,
            wins: Math.round(v.winsAverage * v.gameCount),
          }))
        } catch (e2) {
          console.warn(`[stratz] Hero ${id} failed: ${e2.message}`)
          result[id] = []
        }
        await sleep(300)
      }
    }
    console.log(`[stratz] ${Math.min(i + BATCH, heroIds.length)}/${heroIds.length}`)
    if (i + BATCH < heroIds.length) await sleep(400)
  }

  save(result)

  function save(data) {
    const heroCount = Object.keys(data).length
    const totalPairs = Object.values(data).reduce((s, arr) => s + arr.length, 0)
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2))
    console.log(`[stratz] Saved to ${OUT}`)
    console.log(`[stratz] ${heroCount} heroes, ${totalPairs} matchup pairs`)
  }
})()
