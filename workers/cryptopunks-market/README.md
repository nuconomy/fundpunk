# CryptoPunks Market Worker

Tiny untrusted index for the FundPunks frontend.

The Worker fetches the official CryptoPunks API server-side, caches the response briefly, and returns offered Punk IDs plus a small sorted candidate list. It holds no secrets and does not execute transactions. The frontend must still verify any displayed Punk against the CryptoPunks marketplace contract with `punksOfferedForSale(punkId)`.

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
