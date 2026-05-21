# FundPunks - Trustless CryptoPunk Fundraising

FundPunks is a trustless fundraising protocol for buying CryptoPunks. Anyone can launch a campaign. Anyone can donate. Once there is enough ETH for a Punk, anyone can execute the buy onchain. The campaign creator gets the Punk. Public goods get any change. If no purchase succeeds, contributors can claim a refund.

The project includes smart contracts, frontend, deployment tooling, and documentation. It was partially inspired by [Buy Me A Punk](https://buymeapunk.xyz/) but is a completely orginal development by nuconomy.eth

## Design Constraints

FundPunks is intentionally narrow:

- Gift-only contributions: no token, no fractional ownership, no art mint, no points, no governance, and no expectation of return.
- Public campaign creation: anyone can launch a campaign through the factory without permission from the original project creator.
- Budget-capped funding: contributions are accepted only up to the campaign budget. If the final contribution sends more than the remaining budget, the campaign records only the remaining amount and refunds the excess in the same transaction.
- Hardcoded dependencies: campaigns always use the marketplace contracts and Protocol Guild recipient listed in [Active Deployments](#active-deployments), so campaign creators and modified frontends cannot redirect purchases or surplus funds.
- Time-bounded campaigns: campaigns must finish within one year of creation. The public frontend defaults to a 30-day funding window plus a 30-day execution window.
- Permissionless execution: anyone can try to execute a Punk purchase before the execution deadline if the listing price is at or below the campaign budget, at or below the executor's transaction-level max price, and covered by the campaign's tracked contribution balance and current ETH balance.
- Atomic purchase settlement: a successful purchase pays the exact listing price, receives or settles the Punk, sends the Punk to the campaign creator, and donates any leftover ETH to [Protocol Guild](https://protocol-guild.readthedocs.io/). If any required post-purchase step fails, the transaction reverts.
- Refund path: if no purchase succeeds before the execution deadline, or if the creator cancels before a purchase, contributors can claim refunds for their recorded contributions.

[Protocol Guild](https://protocol-guild.readthedocs.io/) supports Ethereum protocol contributors. FundPunks sends successful-purchase change there as a small public-goods dividend from each campaign.

## Active Deployments

The addresses below are the Ethereum mainnet contracts and recipients currently used by FundPunks.

### FundPunks Contracts

| Role | Address | Notes |
| --- | --- | --- |
| FundPunks factory | [0x95d75D46A32C865CCdfa04490b0A9619bFBA9067](https://etherscan.io/address/0x95d75D46A32C865CCdfa04490b0A9619bFBA9067) | Deploys regular CryptoPunks campaigns. |
| First FundPunks campaign | [0xF6AB3893d5C397d53ef37E18b135d6a2d8b0c1AE](https://etherscan.io/address/0xF6AB3893d5C397d53ef37E18b135d6a2d8b0c1AE) | First regular CryptoPunks campaign. |
| FundPunks V1 factory | [0x502424cce237e11af4b276805b67e777caa4706f](https://etherscan.io/address/0x502424cce237e11af4b276805b67e777caa4706f) | Deploys CryptoPunks V1 campaigns. |
| First FundPunks V1 campaign | [0xfd4fc93dc9a9ef389b83a9690c7a524757295d14](https://etherscan.io/address/0xfd4fc93dc9a9ef389b83a9690c7a524757295d14) | First CryptoPunks V1 campaign. |

### Third-Party Dependencies

| Role | Address | Notes |
| --- | --- | --- |
| CryptoPunks marketplace | [0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB](https://etherscan.io/address/0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB) | Original CryptoPunks marketplace used by `FundPunkCampaign`. |
| CryptoPunks V1 contract | [0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D](https://etherscan.io/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | Original broken CryptoPunks V1 contract used for ownership and listings. |
| PunksMarket directed buyer | [0x64e507FEBF26521b73FbdfA533106B2042533218](https://etherscan.io/address/0x64e507FEBF26521b73FbdfA533106B2042533218) | Adapter that safely settles PunksMarket-compatible V1 listings. |
| Protocol Guild recipient | [0x25941dC771bB64514Fc8abBce970307Fb9d477e9](https://etherscan.io/address/0x25941dC771bB64514Fc8abBce970307Fb9d477e9) | Hardcoded recipient for successful-purchase leftovers and surplus donations. |

## Status

FundPunks is deployed and active on Ethereum mainnet. The contracts have been tested locally, reviewed with multiple frontier AI models, and exercised through local mainnet-fork simulations before deployment.

The project has not received an independent human smart-contract audit. AI review and local simulation are useful checks, but they are not substitutes for a professional audit. Review the contracts, deployment addresses, and frontend configuration, and only risk what you can afford to lose.

## Supported Campaign Types

FundPunks supports separate campaign contracts for original CryptoPunks and CryptoPunks V1. Both modes use the same contribution, purchase, refund, and surplus-donation model, but settle purchases through different marketplace contracts.

### Original CryptoPunks

Original CryptoPunks campaigns use `contracts/FundPunkFactory.sol` and `contracts/FundPunkCampaign.sol`.

`FundPunkCampaign` buys through the original CryptoPunks marketplace listed in [Active Deployments](#active-deployments). It accepts public listings and private listings directed to the campaign contract, verifies the seller still owns the Punk, buys the Punk into the campaign contract, transfers it to the campaign creator, then donates all leftover ETH to Protocol Guild.

### CryptoPunks V1

CryptoPunks V1 campaigns use `contracts/FundV1PunkFactory.sol` and `contracts/FundV1PunkCampaign.sol`.

`FundV1PunkCampaign` buys through the PunksMarket directed buyer against the original V1 CryptoPunks contract listed in [Active Deployments](#active-deployments). It only accepts listings directed to the PunksMarket adapter, rejects invalid Punk IDs and creator-owned seller listings, buys directly to the campaign creator, then donates all leftover ETH to Protocol Guild.

Sellers must list through the original V1 contract with `offerPunkForSaleToAddress(punkId, price, 0x64e507FEBF26521b73FbdfA533106B2042533218)`. Public V1 listings are intentionally rejected.

For more context on why PunksMarket-compatible listings are required and how PunksMarket settles them safely, see [punksmarket.app/about](https://punksmarket.app/about).

## Contracts

- `contracts/FundPunkFactory.sol`: deploys campaign contracts and tracks created campaigns.
- `contracts/FundPunkCampaign.sol`: accepts contributions, attempts CryptoPunk purchases through the hardcoded marketplace, transfers bought Punks, handles refunds, and donates purchase surplus to Protocol Guild.
- `contracts/FundV1PunkFactory.sol`: deploys V1 campaign contracts and tracks created campaigns.
- `contracts/FundV1PunkCampaign.sol`: accepts contributions, buys only CryptoPunks V1 listings directed to the PunksMarket adapter, sends the bought V1 Punk to the campaign creator, handles refunds, and donates purchase surplus to Protocol Guild.
- `contracts/mocks/MockPunksMarket.sol`: test mock for the original CryptoPunks sale/transfer flow.

### Key Factory Functions

Both factory contracts expose the same campaign registry interface.

- `createCampaign(uint256 purchaseBudgetWei, uint64 fundingDeadline, uint64 executionDeadline)`: deploys a new campaign with `msg.sender` as the campaign creator, records it in the factory registry, and emits `CampaignCreated`. The execution deadline must be no more than `365 days` from creation.
- `allCampaigns()`: returns the full list of campaign addresses created by the factory. This is useful for small offchain reads, but can become expensive as the registry grows.
- `campaignsRange(uint256 start, uint256 count)`: returns a paginated slice of campaign addresses for frontends and indexers.
- `campaignsCount()`: returns the total number of campaigns created by the factory.

### Key Campaign Functions

`FundPunkCampaign` and `FundV1PunkCampaign` share the same contribution, purchase, refund, and surplus flow, with different marketplace settlement logic.

- `getState()`: derives the current campaign state as `Funding`, `BuyingOpen`, `Bought`, or `Refunding`. A campaign moves out of funding when the budget is reached or the funding deadline passes, becomes refundable after the execution deadline or creator cancellation, and becomes bought after a successful purchase.
- `contribute()`: accepts ETH while the campaign is in `Funding`, records the accepted amount in `contributions[msg.sender]`, increases `totalRaised` and `refundableContributionsWei`, and refunds any amount above the remaining campaign budget in the same transaction.
- `receive()`: treats plain ETH transfers during funding exactly like `contribute()`. Plain transfers outside the funding state revert.
- `attemptBuy(uint256 punkId, uint256 maxPriceWei)`: lets anyone try to execute a listed Punk purchase before the execution deadline. The listing price must be nonzero, at or below `maxPriceWei`, at or below `purchaseBudgetWei`, covered by `refundableContributionsWei`, and covered by the campaign's ETH balance. Failed market checks emit `BuyAttempt` with `success = false` instead of consuming campaign funds.
- `cancelAndEnableRefunds()`: lets the creator cancel a campaign before a successful purchase and immediately enable contributor refunds.
- `enableRefundsIfExpired()`: explicitly marks an expired, unbought campaign as refunding and emits `RefundsEnabled`. This is optional because the first successful `claimRefund()` after expiry also enables refunds.
- `claimRefund()`: lets contributors withdraw their recorded contribution after creator cancellation or execution expiry. Refunds are pull-based and sent back to the original contributor address.
- `surplusBalanceWei()`: returns ETH held by the campaign that is not part of the tracked refundable contribution pool. This mainly covers forced or otherwise unattributed ETH.
- `donateSurplus()`: sends any untracked surplus to the hardcoded Protocol Guild address without reducing contributor refunds.
- `donationRecipient()`: returns the hardcoded Protocol Guild recipient used for successful-purchase leftovers and surplus donations.

Regular CryptoPunks campaigns have one additional recovery helper:

- `transferBoughtPunkToCreator()`: retries the post-purchase transfer to the campaign creator if the regular CryptoPunk was bought and the campaign contract still owns it.

See [Supported Campaign Types](#supported-campaign-types) for the marketplace settlement differences between original CryptoPunks and CryptoPunks V1 campaigns.

## Web App

The FundPunks web app is a Vite React interface in `web/`. It lets users create campaigns, contribute ETH, attempt permissionless Punk purchases, and claim refunds for regular CryptoPunks and CryptoPunks V1 campaigns.

The app is currently available at [fundpunks.com](https://fundpunks.com). A decentralised IPFS version is served over ENS at [fundpunks.eth.limo](https://fundpunks.eth.limo).

Frontend setup, environment variables, local development, build checks, deep links, and optional market Worker deployment are documented in [`web/README.md`](web/README.md).

## Launch And Verify A Campaign

You can launch a fundraising campaign from [fundpunks.com](https://fundpunks.com) or the decentralised IPFS/ENS version at [fundpunks.eth.limo](https://fundpunks.eth.limo).

1. Choose the campaign mode: original CryptoPunks or CryptoPunks V1.
2. Enter the purchase budget, funding deadline, and execution deadline.
3. Submit the factory transaction from your wallet.
4. Save the campaign address from the site, the transaction receipt, or the factory `CampaignCreated` event.
5. Verify the new campaign contract on Etherscan.

Regular CryptoPunks campaigns can be verified with:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
CAMPAIGN_ADDRESS=0x... \
npx hardhat run scripts/verify-campaign.cjs --network mainnet
```

CryptoPunks V1 campaigns can be verified with:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
CAMPAIGN_ADDRESS=0x... \
npx hardhat run scripts/verify-v1-campaign.cjs --network mainnet
```

Each campaign is a separate contract deployed by the relevant verified factory. Etherscan verification is an offchain step, so new campaign creators should verify their campaign contract after launch. V1 campaigns can only buy PunksMarket-compatible V1 listings directed to the PunksMarket adapter.

## Development

Use Node.js 22 LTS or another Hardhat-supported even-numbered Node version.

Install contract dependencies:

```bash
npm ci --ignore-scripts
```

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

Run a local mainnet-fork rehearsal against a real CryptoPunks V1 PunksMarket listing:

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

The V1 rehearsal deploys a local V1 factory and campaign on the fork, verifies the selected V1 listing is a PunksMarket listing, contributes fork ETH, executes the campaign buy through PunksMarket, verifies the creator receives the Punk, verifies campaign balance is zero, and verifies leftover ETH is sent to Protocol Guild.

Deploy the factories:

```bash
npx hardhat run scripts/deploy.cjs --network mainnet
npx hardhat run scripts/deploy-v1.cjs --network mainnet
```

Verify the factories after deployment:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
npx hardhat verify --network mainnet 0x95d75D46A32C865CCdfa04490b0A9619bFBA9067

MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
npx hardhat verify --network mainnet 0x502424cce237e11af4b276805b67e777caa4706f
```

Verify campaign contracts after they are created:

```bash
MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
CAMPAIGN_ADDRESS=0x... \
npx hardhat run scripts/verify-campaign.cjs --network mainnet

MAINNET_RPC_URL=https://... \
ETHERSCAN_API_KEY=... \
CAMPAIGN_ADDRESS=0x... \
npx hardhat run scripts/verify-v1-campaign.cjs --network mainnet
```

## Safety Notes

A successful purchase is final for contributors: there are no ownership rights, claims on the Punk, financial returns, or refunds after a successful buy.

If no purchase succeeds by the execution deadline, contributors can claim refunds after the execution deadline for their recorded contributions. There is no refund-claim expiry in the current contracts.

Anyone can call `enableRefundsIfExpired()` after the execution deadline to explicitly mark the campaign as refunding and emit the refund event. This is only a convenience for interfaces and observers; `claimRefund()` will also enable refunds automatically for the first valid claimant after expiry.

Refunds are pull-based and sent to the original contributor address. If a contributor is a smart contract or wallet that cannot receive ETH, its refund claim will revert and its contribution can remain locked in V1. Contributors should use an address that can receive plain ETH refunds.

Before a purchase succeeds, the campaign creator can cancel early and immediately enable claimable refunds. This is intended as an emergency exit if a security issue, configuration issue, or other reason makes it unsafe to keep accepting contributions or attempting buys.

Plain ETH transfers to a campaign during funding are recorded as normal contributions and are subject to the same budget cap and excess-refund behavior. Plain ETH transfers outside the funding state revert. ETH that reaches the campaign without running contract code, such as forced ETH, is treated as untracked surplus: it does not increase the refundable contribution balance or the tracked purchase pool, and it can be donated to Protocol Guild without reducing contributor refunds.

## FAQ

### What do I get?

Nothing. No token, no claim, no governance, no financial upside. You get the memory of having done something extremely onchain.

### Is this audited?

There has been no independent human smart-contract audit. See [Status](#status) for the current review and deployment context.

### Why Protocol Guild?

If a Punk is bought below the amount raised, the leftover ETH goes to [Protocol Guild](https://protocol-guild.readthedocs.io/), a well-known Ethereum public-goods recipient. The recipient is hardcoded to the address listed in [Active Deployments](#active-deployments), so campaign creators and modified frontends cannot redirect the change.
