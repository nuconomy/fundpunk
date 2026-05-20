# CryptoPunks V1 PunksMarket Listings Worker

Tiny untrusted index for the FundPunks V1 frontend.

The Worker fetches active CryptoPunks V1 PunksMarket listings from the public `https://indexer.punksmarket.app` GraphQL endpoint, filters out rows where the recorded seller is no longer the indexed owner, caches the response briefly, and returns the same candidate shape used by the existing FundPunks frontend. It holds no secrets and does not execute transactions. The frontend must still verify any displayed Punk against the original V1 CryptoPunks contract with `punksOfferedForSale(punkId)`.

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
