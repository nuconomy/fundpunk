# CryptoPunks Market Worker

Tiny untrusted index for the FundPunks frontend.

The Worker fetches the official CryptoPunks API server-side, caches the response briefly, and returns offered Punk IDs plus a small sorted candidate list. It holds no secrets and does not execute transactions. The frontend must still verify any displayed Punk against the CryptoPunks marketplace contract with `punksOfferedForSale(punkId)`.

Frontend configuration for this Worker is documented in [`../../web/README.md`](../../web/README.md).

## Response Shape

`GET /market?limit=60` returns JSON shaped like:

```json
{
  "success": true,
  "source": "cryptopunks.app",
  "fetchedAt": "2026-05-21T00:00:00.000Z",
  "cacheSeconds": 120,
  "offeredCount": 123,
  "offeredIds": [123, 456],
  "floor": {
    "punkId": 123,
    "apiOfferWei": "1000000000000000000"
  },
  "candidates": [
    {
      "punkId": 123,
      "apiOfferWei": "1000000000000000000"
    }
  ]
}
```

`limit` defaults to `60` and is clamped from `1` to `120`. Responses are cached with `Cache-Control: public, max-age=120, stale-while-revalidate=120`, keyed by limit.

The Worker is intentionally advisory. The frontend rechecks displayed candidates onchain with `punksOfferedForSale(punkId)` before showing them as executable listings, and the campaign contract performs the final purchase checks.

1. Log in to Cloudflare from this machine:

```bash
npx wrangler login
```

2. Deploy from the repo root:

```bash
npx wrangler deploy --config workers/cryptopunks-market/wrangler.toml
```

The Worker should be available at:

`https://fundpunks.nuconomy.workers.dev/market`

3. Check it directly:

```bash
curl https://fundpunks.nuconomy.workers.dev/market
```

4. Set the static frontend env var before building:

```bash
VITE_CRYPTOPUNKS_MARKET_WORKER_URL=https://fundpunks.nuconomy.workers.dev/market
```
