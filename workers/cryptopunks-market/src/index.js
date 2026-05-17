const CRYPTOPUNKS_API_URL = 'https://www.cryptopunks.app/api/punks'
const CACHE_SECONDS = 120
const STALE_SECONDS = 120
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 120

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
      const [offeredIdsPayload, floorPunkPayload, indexPayload] = await Promise.all([
        fetchCryptoPunksAction('offered-ids'),
        fetchCryptoPunksAction('floor-punk'),
        fetchCryptoPunksAction('index'),
      ])
      const offeredIds = extractPunkIds(offeredIdsPayload)
      const indexOfferedIds = extractIndexOfferedIds(indexPayload)
      const floorOffer = extractFloorOffer(floorPunkPayload)
      const candidates = dedupeOffers([
        floorOffer,
        ...indexOfferedIds.map((punkId) => ({ punkId })),
        ...offeredIds.map((punkId) => ({ punkId })),
      ]).slice(0, limit)
      const response = json({
        success: true,
        source: 'cryptopunks.app',
        fetchedAt: new Date().toISOString(),
        cacheSeconds: CACHE_SECONDS,
        offeredCount: offeredIds.length,
        offeredIds,
        floor: floorOffer
          ? {
              punkId: floorOffer.punkId,
              apiOfferWei: floorOffer.apiOfferWei,
            }
          : null,
        candidates,
      }, 200, {
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      })

      ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
      return response
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Market index failed',
      }, 502, {
        'Cache-Control': 'no-store',
      })
    }
  },
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

async function fetchCryptoPunksAction(action) {
  const url = new URL(CRYPTOPUNKS_API_URL)
  url.searchParams.set('action', action)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FundPunks market index worker',
    },
  })

  if (!response.ok) {
    throw new Error(`CryptoPunks API action ${action} returned ${response.status}`)
  }

  return response.json()
}

function readLimit(value) {
  const limit = Number(value || DEFAULT_LIMIT)
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

function extractPunkIds(payload) {
  const values = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : []

  return dedupePunkIds(values)
}

function extractIndexOfferedIds(payload) {
  return dedupePunkIds(payload?.data?.offered || payload?.offered || [])
}

function extractFloorOffer(payload) {
  const value = payload?.data?.currentPunkOffers?.items?.[0] || payload?.data || payload
  return normalizeOffer(value)
}

function dedupePunkIds(values) {
  return dedupeOffers(values.map((value) => ({ punkId: normalizePunkId(value) }))).map((offer) => offer.punkId)
}

function dedupeOffers(values) {
  const seen = new Set()
  const offers = []

  for (const value of values) {
    if (!value || value.punkId === undefined || seen.has(value.punkId)) continue
    seen.add(value.punkId)
    offers.push(value)
  }

  return offers
}

function normalizeOffer(value) {
  const punkId = normalizePunkId(value?.punkId ?? value?.punkIndex ?? value?.index ?? value?.id)
  if (punkId === undefined) return undefined

  const apiOfferWei = normalizeWei(value?.offerValue ?? value?.minValue ?? value?.priceWei)

  return {
    punkId,
    ...(apiOfferWei ? { apiOfferWei } : {}),
    ...(typeof value?.sellerAddress === 'string' ? { sellerAddress: value.sellerAddress } : {}),
    ...(typeof value?.seller === 'string' ? { sellerAddress: value.seller } : {}),
  }
}

function normalizePunkId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : undefined
}

function normalizeWei(value) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return ''
  return value
}
