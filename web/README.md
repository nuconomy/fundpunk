# FundPunks Web App

The FundPunks web app is a Vite React interface for creating, browsing, funding, executing purchases for, and refunding campaigns.

## Live App

The app is currently available at [fundpunks.com](https://fundpunks.com). A decentralised IPFS version is served over ENS at [fundpunks.eth.limo](https://fundpunks.eth.limo).

The same campaign deep-link query strings work on both deployments.

Campaign launch and Etherscan verification steps are documented in the root [`README.md`](../README.md#launch-and-verify-a-campaign).

It lets users:

- switch between regular CryptoPunks campaigns and CryptoPunks V1 campaigns,
- create campaigns,
- contribute ETH,
- auto-load the first campaign launched by the factory as the featured campaign,
- select later factory campaigns as suggested campaigns,
- paste or directly link to a factory-created campaign,
- browse a small live listing carousel sourced from an untrusted Worker and verified against the relevant CryptoPunks contract,
- attempt a permissionless Punk purchase, and
- claim refunds after creator cancellation or execution expiry if no purchase succeeds.

Campaign deep links use the query string form:

```text
https://fundpunks.eth.limo/?campaign=0x...
```

CryptoPunks V1 campaign deep links can include the V1 mode:

```text
https://fundpunks.eth.limo/?mode=v1&campaign=0x...
```

The frontend only enables campaign actions for addresses listed by the configured FundPunks factory, so a deep link cannot turn the site into a donation page for an arbitrary contract.

## Setup

Use Node.js 22 LTS or another supported even-numbered Node version.

Install dependencies from this directory:

```bash
npm ci --ignore-scripts --legacy-peer-deps
cp .env.example .env
```

Set `.env` before building the static site:

```bash
VITE_FACTORY_ADDRESS=0x95d75D46A32C865CCdfa04490b0A9619bFBA9067
VITE_FEATURED_CAMPAIGN_ADDRESS=0xF6AB3893d5C397d53ef37E18b135d6a2d8b0c1AE
VITE_SUGGESTED_CAMPAIGN_ADDRESSES=
VITE_V1_FACTORY_ADDRESS=0x502424cce237e11af4b276805b67e777caa4706f
VITE_V1_FEATURED_CAMPAIGN_ADDRESS=0xfd4fc93dc9a9ef389b83a9690c7a524757295d14
VITE_V1_SUGGESTED_CAMPAIGN_ADDRESSES=
VITE_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
VITE_CRYPTOPUNKS_MARKET_WORKER_URL=https://fundpunks.nuconomy.workers.dev/market
VITE_V1_PUNKSMARKET_WORKER_URL=https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```

`VITE_FACTORY_ADDRESS` and `VITE_V1_FACTORY_ADDRESS` point to the deployed factories listed in the root README's Active Deployments section.

`VITE_FEATURED_CAMPAIGN_ADDRESS` and `VITE_V1_FEATURED_CAMPAIGN_ADDRESS` can be set to the first campaign for each mode so the static site can show it immediately even before reading the factory. `VITE_SUGGESTED_CAMPAIGN_ADDRESSES` and `VITE_V1_SUGGESTED_CAMPAIGN_ADDRESSES` are optional comma-separated lists.

`VITE_MAINNET_RPC_URL` is a browser-visible read-only RPC endpoint used for logged-out campaign stats. It is not treated as a secret. Transactions still go through the user's injected wallet. If a gateway or host blocks external RPC requests with Content Security Policy, the site can still show baked campaign addresses, but live balances/state require a host with an allowed `connect-src` policy or a small server-side proxy.

`VITE_CRYPTOPUNKS_MARKET_WORKER_URL` is optional. When set, the frontend asks a tiny Cloudflare Worker for current offered Punk candidates, then verifies every displayed listing with `punksOfferedForSale(punkId)` on the original CryptoPunks marketplace. If the Worker or RPC verification fails, the manual target and Punk ID inputs remain available.

`VITE_V1_PUNKSMARKET_WORKER_URL` is optional. When set, the frontend asks the V1 Worker for CryptoPunks V1 PunksMarket Listing candidates, then verifies every displayed listing with `punksOfferedForSale(punkId)` and `punkIndexToAddress(punkId)` on the original V1 CryptoPunks contract. The frontend requires the listing to be for PunksMarket, but the V1 campaign contract remains the final authority.

## Development

Run the local web app:

```bash
npm run dev
```

Run frontend checks:

```bash
npm run lint
npm run build
```

## Optional Market Workers

The listing carousel can use the optional Cloudflare Workers in `../workers/`.

Deploy them from the repository root:

```bash
npx wrangler login
npx wrangler deploy --config workers/cryptopunks-market/wrangler.toml
npx wrangler deploy --config workers/v1-punksmarket/wrangler.toml
```

After deploy, check the Workers directly:

```bash
curl https://fundpunks.nuconomy.workers.dev/market
curl https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```
