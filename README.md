# FundPunk

FundPunk is the contract system. FundPunks is the public website for donation-based crowdfunding campaigns to buy original CryptoPunks through the original CryptoPunks marketplace contract.

The premise is deliberately uncomfortable: no token, no fractional ownership, no art mint, no points, no expectation of return. Contributors give ETH to see whether a Punk can be crowdfunded as a pure gift. The first campaign is the creator asking the internet to help buy a Punk and prove the vision in public.

FundPunks was partially inspired by [Buy Me A Punk](https://buymeapunk.xyz/), but removes the mint. No collectible wrapper. No consolation JPEG. Just the chain recording whether people gave anyway.

Contributors donate ETH toward a campaign budget. Normal contributions are capped at the campaign budget; if the final contribution sends more than the remaining budget, the campaign records only the remaining amount and refunds the excess in the same transaction. Campaigns always use the original CryptoPunks marketplace contract:

`0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`

Campaigns must finish within one year of creation. The public frontend defaults to a 30-day funding window plus a 30-day execution window.

Anyone can execute a purchase of any listed CryptoPunk before the execution deadline if the exact on-chain listing price is:

- at or below the campaign budget,
- at or below the executor's transaction-level max price, and
- covered by the campaign's tracked contribution balance and current ETH balance.

The contract pays the exact listing price, receives the Punk from the CryptoPunks marketplace, immediately transfers the Punk to the campaign creator in the same transaction, and sends any leftover ETH from a successful purchase to [Protocol Guild](https://protocol-guild.readthedocs.io/).

[Protocol Guild](https://protocol-guild.readthedocs.io/) supports Ethereum protocol contributors. FundPunk sends successful-purchase change there as a small public-goods dividend from the campaign.

Hardcoded Protocol Guild leftover recipient:

`0x25941dC771bB64514Fc8abBce970307Fb9d477e9`

The marketplace and donation recipient addresses are hardcoded in the contracts so campaign creators and modified frontends cannot redirect purchases or surplus funds.

Deployed mainnet factory:

`0x95d75D46A32C865CCdfa04490b0A9619bFBA9067`

First mainnet campaign:

`0xF6AB3893d5C397d53ef37E18b135d6a2d8b0c1AE`

The factory architecture means anyone can create a campaign for a Punk forever, without needing the original creator's permission. The first campaign is personal; the mechanism is public.

## Status

This project is not production ready and has not been professionally audited. Do not use with real funds without a full smart-contract review, deployment review, and frontend review.

Current known limitations:

- The frontend reads `VITE_FACTORY_ADDRESS` for regular CryptoPunks campaigns and `VITE_V1_FACTORY_ADDRESS` for CryptoPunks V1 campaigns; set deployed factory addresses before building the static site.
- The project targets the original hardcoded CryptoPunks marketplace, not OpenSea or Seaport.

## CryptoPunks V1 PunksMarket Campaigns

This branch adds a separate V1 campaign system for the broken June 9th 2017 CryptoPunks contract. It does not replace the existing FundPunk factory or campaign contracts.

- `contracts/FundV1PunkFactory.sol`: deploys V1 campaign contracts and tracks created campaigns.
- `contracts/FundV1PunkCampaign.sol`: accepts contributions, buys only CryptoPunks V1 PunksMarket Listings, sends the bought V1 Punk to the campaign creator, handles refunds, and donates purchase surplus to Protocol Guild.

V1 campaigns hardcode two addresses:

- `0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`: the original broken CryptoPunks V1 contract. This contract holds the Punk ownership mapping and the original sale/listing functions.
- `0x64e507FEBF26521b73FbdfA533106B2042533218`: the PunksMarket adapter that safely settles PunksMarket-compatible V1 listings.

Sellers must list through the original V1 contract with `offerPunkForSaleToAddress(punkId, price, 0x64e507FEBF26521b73FbdfA533106B2042533218)`. Public V1 listings are intentionally rejected.

For more context on why PunksMarket-compatible listings are required and how PunksMarket settles them safely, see [punksmarket.app/about](https://punksmarket.app/about).

Run the V1 unit tests with the regular contract test command:

```bash
npx hardhat test
```

Run a local mainnet-fork rehearsal against a real CryptoPunks V1 PunksMarket Listing:

```bash
npx hardhat node --fork "$MAINNET_RPC_URL"
```

In another terminal:

```bash
PUNK_ID=1234 \
MAX_PRICE_ETH=10 \
PURCHASE_BUDGET_ETH=10 \
npx hardhat run scripts/fork-v1-rehearsal.cjs --network localhost
```

The rehearsal deploys a local V1 factory and campaign on the fork, verifies the selected V1 listing is a PunksMarket listing, contributes fork ETH, executes the campaign buy through PunksMarket, verifies the creator receives the Punk, verifies campaign balance is zero, and verifies leftover ETH is sent to Protocol Guild.

## Contracts

- `contracts/FundPunkFactory.sol`: deploys campaign contracts and tracks created campaigns.
- `contracts/FundPunkCampaign.sol`: accepts contributions, attempts CryptoPunk purchases through the hardcoded marketplace, transfers bought Punks, handles refunds, and donates purchase surplus to Protocol Guild.
- `contracts/mocks/MockPunksMarket.sol`: test mock for the original CryptoPunks sale/transfer flow.

## Web App

The FundPunks web app is a Vite React interface in `web/`.

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

`https://fundpunks.eth.limo/?campaign=0x...`

CryptoPunks V1 campaign deep links can include the V1 mode:

`https://fundpunks.eth.limo/?mode=v1&campaign=0x...`

The frontend only enables campaign actions for addresses listed by the configured FundPunk factory, so a deep link cannot turn the site into a donation page for an arbitrary contract.

## Setup

Use Node.js 22 LTS or another Hardhat-supported even-numbered Node version.

Install dependencies:

```bash
npm ci --ignore-scripts
cd web
npm ci --ignore-scripts --legacy-peer-deps
cp .env.example .env
cd ..
```

Set `web/.env` before building the static site:

```bash
VITE_FACTORY_ADDRESS=0x95d75D46A32C865CCdfa04490b0A9619bFBA9067
VITE_FEATURED_CAMPAIGN_ADDRESS=0xF6AB3893d5C397d53ef37E18b135d6a2d8b0c1AE
VITE_SUGGESTED_CAMPAIGN_ADDRESSES=
VITE_V1_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000
VITE_V1_FEATURED_CAMPAIGN_ADDRESS=
VITE_V1_SUGGESTED_CAMPAIGN_ADDRESSES=
VITE_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
VITE_CRYPTOPUNKS_MARKET_WORKER_URL=https://fundpunks.nuconomy.workers.dev/market
VITE_V1_PUNKSMARKET_WORKER_URL=https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```

`VITE_FEATURED_CAMPAIGN_ADDRESS` and `VITE_V1_FEATURED_CAMPAIGN_ADDRESS` can be set to the first campaign for each mode so the static site can show it immediately even before reading the factory. `VITE_SUGGESTED_CAMPAIGN_ADDRESSES` and `VITE_V1_SUGGESTED_CAMPAIGN_ADDRESSES` are optional comma-separated lists.

`VITE_MAINNET_RPC_URL` is a browser-visible read-only RPC endpoint used for logged-out campaign stats. It is not treated as a secret. Transactions still go through the user's injected wallet. If a gateway or host blocks external RPC requests with Content Security Policy, the site can still show baked campaign addresses, but live balances/state require a host with an allowed `connect-src` policy or a small server-side proxy.

`VITE_CRYPTOPUNKS_MARKET_WORKER_URL` is optional. When set, the frontend asks a tiny Cloudflare Worker for current offered Punk candidates, then verifies every displayed listing with `punksOfferedForSale(punkId)` on the original CryptoPunks marketplace. If the Worker or RPC verification fails, the manual target and Punk ID inputs remain available.

`VITE_V1_PUNKSMARKET_WORKER_URL` is optional. When set, the frontend asks the V1 Worker for CryptoPunks V1 PunksMarket Listing candidates, then verifies every displayed listing with `punksOfferedForSale(punkId)` and `punkIndexToAddress(punkId)` on the original V1 CryptoPunks contract. The frontend requires the listing to be for PunksMarket, but the V1 campaign contract remains the final authority.

Deploy the optional market Workers:

```bash
npx wrangler login
npx wrangler deploy --config workers/cryptopunks-market/wrangler.toml
npx wrangler deploy --config workers/v1-punksmarket/wrangler.toml
```

After deploy, check the Worker directly:

```bash
curl https://fundpunks.nuconomy.workers.dev/market
curl https://fundpunks-v1-punksmarket.nuconomy.workers.dev/market
```

Verify the factory after deployment:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
npx hardhat verify --network mainnet 0x95d75D46A32C865CCdfa04490b0A9619bFBA9067
```

Verify a campaign after it is created:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
CAMPAIGN_ADDRESS=0x... \
npx hardhat run scripts/verify-campaign.cjs --network mainnet
```

Each campaign is a separate contract deployed by the verified factory. Etherscan verification is still an offchain step, so new campaign creators should verify their campaign contract after launch.

Run contract tests:

```bash
npx hardhat test
```

Run a local mainnet-fork rehearsal against the real CryptoPunks contract:

```bash
npx hardhat node --fork "$MAINNET_RPC_URL"
```

In another terminal, deploy and create a local fork campaign, then run:

```bash
CAMPAIGN_ADDRESS=0x... \
PUNK_ID=7502 \
MAX_PRICE_ETH=30 \
npx hardhat run scripts/fork-rehearsal.cjs --network localhost
```

The rehearsal contributes fork ETH, attempts to buy the specified listed Punk through the real CryptoPunks marketplace on the fork, verifies the creator receives the Punk, verifies the campaign balance is zero, and verifies leftover ETH is sent to the hardcoded Protocol Guild recipient. It refuses non-local networks.

Run frontend checks:

```bash
cd web
npm run lint
npm run build
```

Deploy the factory:

```bash
npx hardhat run scripts/deploy.cjs --network mainnet
```

Run the local web app:

```bash
cd web
npm run dev
```

## Safety Notes

FundPunk campaigns do not issue ownership tokens, governance rights, claims on the Punk, refunds after a successful purchase, or financial returns.

If no purchase succeeds by the execution deadline, contributors can claim refunds after the execution deadline for their recorded contributions. There is no refund-claim expiry in the current contract.

Anyone can call `enableRefundsIfExpired()` after the execution deadline to explicitly mark the campaign as refunding and emit the refund event. This is only a convenience for interfaces and observers; `claimRefund()` will also enable refunds automatically for the first valid claimant after expiry.

Refunds are pull-based and sent to the original contributor address. If a contributor is a smart contract or wallet that cannot receive ETH, its refund claim will revert and its contribution can remain locked in V1. Contributors should use an address that can receive plain ETH refunds.

Before a purchase succeeds, the campaign creator can cancel early and immediately enable claimable refunds. This is intended as an emergency exit if a security issue, configuration issue, or other reason makes it unsafe to keep accepting contributions or attempting buys.

If a purchase succeeds, any leftover ETH is donated to the hardcoded Protocol Guild address.

The purchase path is atomic. A successful `attemptBuy` must complete the CryptoPunks purchase, transfer the Punk from the campaign contract to the creator, and donate leftover ETH to Protocol Guild. If any of those post-purchase steps fail, the whole transaction reverts and the purchase does not stick.

Plain ETH transfers to a campaign during funding are recorded as normal contributions and are subject to the same budget cap and excess-refund behavior. Plain ETH transfers outside the funding state revert. ETH that reaches the campaign without running contract code, such as forced ETH, is treated as untracked surplus: it does not increase the refundable contribution balance or the tracked purchase pool, and it can be donated to Protocol Guild without reducing contributor refunds.

## FAQ

### What do I get?

Nothing. No token, no claim, no governance, no financial upside. You get the memory of having done something extremely onchain.

### Is this audited?

No. This is reckless, but contributors are gifting money anyway. If the contract is hacked, everyone involved can treat it as an expensive lesson.

### Why Protocol Guild?

If a Punk is bought below the amount raised, the leftover ETH goes to [Protocol Guild](https://protocol-guild.readthedocs.io/), a well-known Ethereum public-goods recipient. The recipient is hardcoded as `0x25941dC771bB64514Fc8abBce970307Fb9d477e9`, so campaign creators and modified frontends cannot redirect the change.
