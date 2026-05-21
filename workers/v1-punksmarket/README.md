# CryptoPunks V1 PunksMarket Listings Worker

Tiny untrusted index for the FundPunks V1 frontend.

The Worker fetches active CryptoPunks V1 PunksMarket listings from the public `https://indexer.punksmarket.app` GraphQL endpoint, filters out rows where the recorded seller is no longer the indexed owner, caches the response briefly, and returns the same candidate shape used by the existing FundPunks frontend. It holds no secrets and does not execute transactions. The frontend must still verify any displayed Punk against the original V1 CryptoPunks contract with `punksOfferedForSale(punkId)`.

Frontend configuration for this Worker is documented in [`../../web/README.md`](../../web/README.md).

## Response Shape

`GET /market?limit=60` returns JSON shaped like:

```json
{
  "success": true,
  "source": "punksmarket.app",
  "listingSet": "CryptoPunks V1 PunksMarket Listings",
  "onlySellTo": "0x64e507febf26521b73fbdfa533106b2042533218",
  "fetchedAt": "2026-05-21T00:00:00.000Z",
  "cacheSeconds": 120,
  "offeredCount": 123,
  "listings": [
    {
      "punkId": 123,
      "priceWei": "1000000000000000000",
      "sellerAddress": "0x0000000000000000000000000000000000000000"
    }
  ],
  "candidates": [
    {
      "punkId": 123,
      "priceWei": "1000000000000000000",
      "sellerAddress": "0x0000000000000000000000000000000000000000"
    }
  ]
}
```

`limit` defaults to `60` and is clamped from `1` to `120`. Responses are cached with `Cache-Control: public, max-age=120, stale-while-revalidate=120`, keyed by limit.

The Worker is intentionally advisory. The frontend rechecks displayed candidates onchain with `punksOfferedForSale(punkId)` and `punkIndexToAddress(punkId)`, and the campaign contract performs the final purchase checks.

Deploy from the repo root:

```bash
npx wrangler deploy --config workers/v1-punksmarket/wrangler.toml
```

Check it directly:

```bash
curl https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```

Set the static frontend env var before building:

```bash
VITE_V1_PUNKSMARKET_WORKER_URL=https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```
