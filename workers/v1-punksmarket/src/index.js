const INDEXER_URL = 'https://indexer.punksmarket.app'
const PUNKS_MARKET_ADDRESS = '0x64e507febf26521b73fbdfa533106b2042533218'
const CACHE_SECONDS = 120
const STALE_SECONDS = 120
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 120
const PAGE_SIZE = 1000

const ACTIVE_LISTINGS_QUERY = `
  query ActiveListings($onlySellTo: String!, $limit: Int!, $after: String) {
    v1Listings(where: { active: true, only_sell_to: $onlySellTo }, orderBy: "min_value_wei", orderDirection: "asc", limit: $limit, after: $after) {
      items {
        punk_id
        seller
        min_value_wei
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const OWNERS_QUERY = `
  query Owners($ids: [BigInt!]!) {
    v1Punks(where: { punk_id_in: $ids }, orderBy: "punk_id", orderDirection: "asc", limit: 1000) {
      items {
        punk_id
        owner
      }
    }
  }
`

const baseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Content-Type': 'application/json; charset=utf-8',
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders })
    }

    if (request.method !== 'GET') {
      return json({ success: false, error: 'Method not allowed' }, 405)
    }

    const url = new URL(request.url)
    if (!['/', '/market'].includes(url.pathname)) {
      return json({ success: false, error: 'Not found' }, 404)
    }

    const limit = readLimit(url.searchParams.get('limit'))
    const cacheKey = new Request(`${url.origin}/market?limit=${limit}`)
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached

    try {
      const listings = await fetchLivePunksMarketListings()
      const candidates = listings.slice(0, limit)
      const response = json({
        success: true,
        source: 'punksmarket.app',
        listingSet: 'CryptoPunks V1 PunksMarket Listings',
        onlySellTo: PUNKS_MARKET_ADDRESS,
        fetchedAt: new Date().toISOString(),
        cacheSeconds: CACHE_SECONDS,
        offeredCount: listings.length,
        listings: candidates,
        candidates,
      }, 200, {
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      })

      ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
      return response
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'V1 PunksMarket index failed',
      }, 502, {
        'Cache-Control': 'no-store',
      })
    }
  },
}

async function fetchLivePunksMarketListings() {
  const listings = []
  let after = null
  let hasNextPage = true

  while (hasNextPage) {
    const data = await queryIndexer(ACTIVE_LISTINGS_QUERY, {
      onlySellTo: PUNKS_MARKET_ADDRESS,
      limit: PAGE_SIZE,
      after,
    })

    const page = data?.v1Listings
    if (!page || !Array.isArray(page.items)) {
      throw new Error('Indexer returned invalid v1Listings data')
    }

    listings.push(...page.items)
    hasNextPage = Boolean(page.pageInfo?.hasNextPage)
    after = page.pageInfo?.endCursor || null
    if (hasNextPage && !after) throw new Error('Indexer pagination failed')
  }

  if (listings.length === 0) return []

  const ownerById = await fetchOwners(listings.map((row) => row.punk_id))

  return listings
    .filter((row) => {
      const punkId = normalizePunkId(row.punk_id)
      const priceWei = normalizeWei(row.min_value_wei)
      const seller = normalizeAddress(row.seller)
      const owner = normalizeAddress(ownerById.get(row.punk_id))
      return punkId !== undefined && priceWei && seller && seller === owner
    })
    .map((row) => ({
      punkId: normalizePunkId(row.punk_id),
      priceWei: normalizeWei(row.min_value_wei),
      sellerAddress: row.seller,
    }))
}

async function fetchOwners(ids) {
  const ownerById = new Map()

  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const chunk = ids.slice(i, i + PAGE_SIZE)
    const data = await queryIndexer(OWNERS_QUERY, { ids: chunk })
    const rows = data?.v1Punks?.items
    if (!Array.isArray(rows)) {
      throw new Error('Indexer returned invalid v1Punks data')
    }

    for (const row of rows) {
      if (row.owner) ownerById.set(row.punk_id, row.owner)
    }
  }

  return ownerById
}

async function queryIndexer(query, variables) {
  const response = await fetch(INDEXER_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FundPunks V1 PunksMarket listings worker',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`PunksMarket indexer returned ${response.status}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '))
  }
  if (!payload.data) throw new Error('PunksMarket indexer returned no data')

  return payload.data
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders,
      ...headers,
    },
  })
}

function readLimit(value) {
  const limit = Number(value || DEFAULT_LIMIT)
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

function normalizePunkId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : undefined
}

function normalizeWei(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return ''
  return value
}

function normalizeAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value.toLowerCase()
    : ''
}
