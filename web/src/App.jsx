import { useMemo, useState } from 'react'
import { createConfig, http, useAccount, useConnect, useDisconnect, useReadContract, useWriteContract } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatEther, parseEther } from 'viem'
import heroPunk from './assets/prepunk.png'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || ZERO_ADDRESS
const MAINNET_RPC_URL = import.meta.env.VITE_MAINNET_RPC_URL || 'https://ethereum-rpc.publicnode.com'
const FEATURED_CAMPAIGN_ADDRESS = import.meta.env.VITE_FEATURED_CAMPAIGN_ADDRESS || ''
const SUGGESTED_CAMPAIGN_ADDRESSES = import.meta.env.VITE_SUGGESTED_CAMPAIGN_ADDRESSES || ''
const PROTOCOL_GUILD_ADDRESS = '0x25941dC771bB64514Fc8abBce970307Fb9d477e9'
const hasReadTransport = Boolean(MAINNET_RPC_URL)

const factoryAbi = [
  {
    inputs: [
      { name: 'purchaseBudgetWei', type: 'uint256' },
      { name: 'fundingDeadline', type: 'uint64' },
      { name: 'executionDeadline', type: 'uint64' },
    ],
    name: 'createCampaign',
    outputs: [{ name: 'campaign', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allCampaigns',
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
]

const campaignAbi = [
  { inputs: [], name: 'purchaseBudgetWei', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalRaised', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'fundingDeadline', outputs: [{ type: 'uint64' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'executionDeadline', outputs: [{ type: 'uint64' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getState', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'creator', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'cryptopunksMarket', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'donationRecipient', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'contribute', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'punkId', type: 'uint256' }, { name: 'maxPriceWei', type: 'uint256' }], name: 'attemptBuy', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claimRefund', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'enableRefundsIfExpired', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'cancelAndEnableRefunds', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'donateSurplus', outputs: [], stateMutability: 'nonpayable', type: 'function' },
]

const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: { [mainnet.id]: http(MAINNET_RPC_URL) },
})

const qc = new QueryClient()

function ethToWei(v) {
  return parseEther(String(v || '0'))
}

function stateName(v) {
  return ['Funding', 'Buying open', 'Bought', 'Refunding'][Number(v ?? 0)] || 'Unknown'
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function formatEth(value) {
  if (value === undefined) return '...'
  return `${Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`
}

function shortAddress(value) {
  if (!value) return '...'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function getInitialCampaignAddress() {
  if (typeof window === 'undefined') return ''

  const candidate = new URLSearchParams(window.location.search).get('campaign') || ''
  return isAddress(candidate) ? candidate : ''
}

function AppInner() {
  const [campaignAddr, setCampaignAddr] = useState(getInitialCampaignAddress)
  const [budgetEth, setBudgetEth] = useState('31')
  const [fundDays, setFundDays] = useState('30')
  const [execDays, setExecDays] = useState('30')

  const [contribEth, setContribEth] = useState('0.1')
  const [buyPunkId, setBuyPunkId] = useState('')
  const [buyMaxEth, setBuyMaxEth] = useState('31')

  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { writeContractAsync } = useWriteContract()

  const factoryReady = isAddress(FACTORY_ADDRESS) && FACTORY_ADDRESS !== ZERO_ADDRESS

  const factoryCampaigns = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'allCampaigns',
    query: { enabled: factoryReady && hasReadTransport },
  })

  const configuredCampaigns = useMemo(() => {
    const candidates = [
      FEATURED_CAMPAIGN_ADDRESS,
      ...SUGGESTED_CAMPAIGN_ADDRESSES.split(','),
    ]

    return candidates.map((value) => value.trim()).filter(isAddress)
  }, [])

  const factoryCampaignList = useMemo(() => {
    const seen = new Set()
    const campaigns = []

    for (const address of [...configuredCampaigns, ...(factoryCampaigns.data || [])]) {
      if (!isAddress(address)) continue
      const key = address.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        campaigns.push(address)
      }
    }

    return campaigns
  }, [configuredCampaigns, factoryCampaigns.data])

  const featuredCampaign = factoryCampaignList[0]
  const suggestedCampaigns = factoryCampaignList.slice(1)
  const factoryCampaignSet = useMemo(
    () => new Set(factoryCampaignList.map((address) => address.toLowerCase())),
    [factoryCampaignList],
  )
  const requestedCampaignAddr = isAddress(campaignAddr) ? campaignAddr : ''
  const requestedCampaignIsKnown = requestedCampaignAddr
    ? factoryCampaignSet.has(requestedCampaignAddr.toLowerCase())
    : false
  const selectedCampaignAddr = requestedCampaignAddr
    ? (requestedCampaignIsKnown ? requestedCampaignAddr : '')
    : featuredCampaign || ''
  const requestedCampaignUnknown = Boolean(
    requestedCampaignAddr && !requestedCampaignIsKnown && factoryCampaigns.data,
  )
  const requestedCampaignChecking = Boolean(
    requestedCampaignAddr && !requestedCampaignIsKnown && !factoryCampaigns.data,
  )
  const campaignEnabled = isAddress(selectedCampaignAddr)
  const campaignReadEnabled = campaignEnabled && hasReadTransport

  const budget = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'purchaseBudgetWei', query: { enabled: campaignReadEnabled } })
  const raised = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'totalRaised', query: { enabled: campaignReadEnabled } })
  const state = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'getState', query: { enabled: campaignReadEnabled } })
  const creator = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'creator', query: { enabled: campaignReadEnabled } })
  const market = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'cryptopunksMarket', query: { enabled: campaignReadEnabled } })
  const donation = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'donationRecipient', query: { enabled: campaignReadEnabled } })
  const progressPct = budget.data && budget.data > 0n && raised.data !== undefined
    ? Math.min(100, Number((raised.data * 10000n) / budget.data) / 100)
    : 0
  const missingWei = budget.data && raised.data !== undefined && budget.data > raised.data
    ? budget.data - raised.data
    : 0n
  const progressLabel = campaignReadEnabled && budget.data
    ? `${progressPct.toFixed(progressPct >= 10 ? 0 : 1)}%`
    : '...'

  async function createCampaign() {
    const now = Math.floor(Date.now() / 1000)
    const fundingDeadline = now + Number(fundDays) * 86400
    const executionDeadline = fundingDeadline + Number(execDays) * 86400

    await writeContractAsync({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'createCampaign',
      args: [
        ethToWei(budgetEth),
        BigInt(fundingDeadline),
        BigInt(executionDeadline),
      ],
    })
  }

  async function contribute() {
    await writeContractAsync({
      address: selectedCampaignAddr,
      abi: campaignAbi,
      functionName: 'contribute',
      value: ethToWei(contribEth),
    })
  }

  async function executeBuy() {
    await writeContractAsync({
      address: selectedCampaignAddr,
      abi: campaignAbi,
      functionName: 'attemptBuy',
      args: [BigInt(buyPunkId), ethToWei(buyMaxEth)],
    })
  }

  async function claimRefund() {
    await writeContractAsync({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'claimRefund' })
  }

  async function enableRefunds() {
    await writeContractAsync({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'enableRefundsIfExpired' })
  }

  async function cancelCampaign() {
    await writeContractAsync({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'cancelAndEnableRefunds' })
  }

  async function donateSurplus() {
    await writeContractAsync({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'donateSurplus' })
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main">
        <a className="brand" href="#top" aria-label="FundPunks home">
          <span className="brand-mark" aria-hidden="true">FP</span>
          <span>FundPunks</span>
        </a>
        <div className="wallet">
          {isConnected ? (
            <>
              <span className="wallet-address">{shortAddress(address)}</span>
              <button className="button ghost" onClick={() => disconnect()}>Disconnect</button>
            </>
          ) : (
            <button className="button primary" onClick={() => connect({ connector: injected() })}>Connect wallet</button>
          )}
        </div>
      </nav>

      <section id="top" className="hero-section">
        <div className="hero-copy">
          <div className="kicker">Permissionless finance at its finest</div>
          <h1>Now anyone can ask the internet for a Punk.</h1>
          <p className="lede">
            FundPunks is fully onchain, donation-only crowdfunding for CryptoPunks. Anyone can launch a campaign; I&apos;m going first.
            If a campaign hits its target, anyone can trigger the buy onchain, and any change goes to public goods.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#donate">Donate to the first campaign</a>
            <a className="button secondary" href="#factory">Launch your own</a>
          </div>
        </div>

        <div className="hero-visual" aria-label="FundPunks campaign card">
          <div className="punk-frame">
            <img src={heroPunk} alt="Original pixel-art Punk silhouette" />
            <div className="punk-caption">
              <span>Pre-Punk · noun</span>
              <strong>State of being before the first FundPunk hits.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="thesis-band" aria-label="Project thesis">
        <div>
          <span className="eyebrow">Why this exists</span>
          <blockquote>
            <p>
              Recently I saw someone had raised over 33 ETH from 836 strangers to crowdfund a CryptoPunk. It was novel, it was onchain, but it still took a full day for the creator to actually buy the Punk.
            </p>
            <p>
              So I created an onchain way for anyone to crowdfund a CryptoPunk and as soon as the target balance is achieved anyone can force trigger the buy with any change going to public goods.
            </p>
          </blockquote>
          <span className="quote-credit">
            - <a href="https://x.com/nuconomy" target="_blank" rel="noreferrer">@nuconomy.eth</a>, on Farcaster after seeing{' '}
            <a href="https://buymeapunk.xyz/" target="_blank" rel="noreferrer">Buy Me A Punk</a>
          </span>
        </div>
      </section>

      <section id="campaign" className="campaign-layout">
        <div className="campaign-panel">
          <div className="section-heading">
            <span className="eyebrow">Launch campaign</span>
            <h2>The first FundPunks campaign is live.</h2>
            <p>I&apos;m using it to ask the internet to help fund a Punk for nuconomy.eth. Donate here, or paste any factory-created campaign address to inspect and support someone else&apos;s Punk dream.</p>
          </div>

          <div className="campaign-picker" aria-label="Live campaigns">
            <div className="campaign-picker-heading">
              <span>Featured campaign</span>
              <strong>{featuredCampaign ? 'Created by nuconomy.eth' : 'Waiting for factory deployment'}</strong>
            </div>

            {featuredCampaign ? (
              <button
                className={`campaign-choice featured ${selectedCampaignAddr.toLowerCase() === featuredCampaign.toLowerCase() ? 'selected' : ''}`}
                onClick={() => setCampaignAddr(featuredCampaign)}
              >
                <span>Featured</span>
                <strong>{shortAddress(featuredCampaign)}</strong>
              </button>
            ) : (
              <p className="campaign-empty">Once the factory is deployed, the first campaign it launched will load here automatically.</p>
            )}

            {suggestedCampaigns.length > 0 && (
              <div className="suggested-campaigns">
                <span>Suggested campaigns</span>
                <div>
                  {suggestedCampaigns.map((address, index) => (
                    <button
                      key={address}
                      className={`campaign-choice ${selectedCampaignAddr.toLowerCase() === address.toLowerCase() ? 'selected' : ''}`}
                      onClick={() => setCampaignAddr(address)}
                    >
                      <span>Campaign {index + 2}</span>
                      <strong>{shortAddress(address)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Field label="Paste a FundPunks campaign address">
            <input
              value={campaignAddr}
              onChange={(e) => setCampaignAddr(e.target.value)}
              placeholder={selectedCampaignAddr || featuredCampaign || '0x...'}
              spellCheck="false"
            />
          </Field>
          {requestedCampaignChecking && (
            <p className="form-note">Checking this campaign against the verified factory...</p>
          )}
          {requestedCampaignUnknown && (
            <p className="form-note warning-note">This address is not listed by the verified FundPunks factory, so campaign actions are disabled.</p>
          )}

            <div className="status-grid">
              <div className="metric">
                <span>State</span>
                <strong>{campaignEnabled ? (campaignReadEnabled ? stateName(state.data) : 'Connect wallet') : 'Paste address'}</strong>
              </div>
            <div className="metric">
              <span>Raised</span>
              <strong>{formatEth(raised.data)}</strong>
            </div>
            <div className="metric">
              <span>Target</span>
              <strong>{formatEth(budget.data)}</strong>
            </div>
          </div>

          <div className="funding-progress" aria-label="Funding progress">
            <div className="progress-heading">
              <h3>Progress to Punk</h3>
              <p>Target: <strong>{formatEth(budget.data)}</strong></p>
            </div>
            <div className="progress-meter">
              <div className="progress-track">
                <span style={{ width: `${progressPct}%` }} />
              </div>
              <strong>{progressLabel}</strong>
            </div>
            <p className="progress-copy">
              {missingWei > 0n
                ? `Still missing ${formatEth(missingWei)} before anyone can try to buy a listed Punk.`
                : campaignReadEnabled
                  ? 'Target met. Anyone onchain can try to buy a listed Punk that fits the campaign limits.'
                  : 'Live progress loads from mainnet.'}
            </p>
          </div>

          <div className="address-list">
            <div>
              <span>Selected campaign</span>
              <code>{selectedCampaignAddr || '...'}</code>
            </div>
            <div>
              <span>Creator receives the Punk</span>
              <code>{creator.data || '...'}</code>
            </div>
            <div>
              <span>Original CryptoPunks market</span>
              <code>{market.data || '...'}</code>
            </div>
            <div>
              <span>Change goes to Protocol Guild</span>
              <code>{donation.data || '...'}</code>
            </div>
          </div>
        </div>

        <div className="actions-stack">
          <form id="donate" className="action-box" onSubmit={(e) => { e.preventDefault(); contribute() }}>
            <div>
              <span className="eyebrow">Give</span>
              <h3>Donate ETH</h3>
              <p>Your reward is the chain recording that you helped.</p>
            </div>
            <Field label="Amount">
              <input value={contribEth} onChange={(e) => setContribEth(e.target.value)} inputMode="decimal" />
            </Field>
            {!isConnected && (
              <p className="form-note">Connect your wallet first. Then donate and receive precisely nothing.</p>
            )}
            {isConnected ? (
              <button className="button primary" disabled={!campaignEnabled}>Donate Now. Get Nothing</button>
            ) : (
              <button className="button primary" type="button" onClick={() => connect({ connector: injected() })}>Connect to Donate</button>
            )}
          </form>

          <form className="action-box" onSubmit={(e) => { e.preventDefault(); executeBuy() }}>
            <div>
              <span className="eyebrow">Got funds?</span>
              <h3>Buy the Punk</h3>
              <p>Anyone can execute the buy if a listed Punk fits the budget, balance, and max price.</p>
            </div>
            <Field label="Punk ID">
              <input value={buyPunkId} onChange={(e) => setBuyPunkId(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Max ETH">
              <input value={buyMaxEth} onChange={(e) => setBuyMaxEth(e.target.value)} inputMode="decimal" />
            </Field>
            <button className="button secondary" disabled={!campaignEnabled}>Buy the Punk</button>
          </form>

        </div>
      </section>

      <section id="factory" className="factory-section" aria-label="Factory">
        <div className="section-heading">
          <span className="eyebrow">Perpetual Punk Funding Machine</span>
          <h2>Anyone can launch the next campaign.</h2>
          <p>
            One factory, many FundPunk campaigns. Bring your CryptoPunk dreams, set the terms, and let the crowd decide.
          </p>
        </div>
        <form className="factory-form" onSubmit={(e) => { e.preventDefault(); createCampaign() }}>
          <Field label="Purchase budget ETH">
            <input value={budgetEth} onChange={(e) => setBudgetEth(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Funding window days">
            <input value={fundDays} onChange={(e) => setFundDays(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Execution window days">
            <input value={execDays} onChange={(e) => setExecDays(e.target.value)} inputMode="numeric" />
          </Field>
          <button className="button primary" disabled={!factoryReady}>Create campaign</button>
        </form>
        {!factoryReady && <p className="deploy-note">Factory address is still a placeholder. Vision: loud. Deployment: pending.</p>}
      </section>

      <details className="danger-zone control-panel">
        <summary>
          <div>
            <span className="eyebrow">Hidden control panel</span>
            <h3>Need to get the money?</h3>
            <p>Refunds, creator cancel, and other contract levers are tucked down here for people reading the machinery.</p>
          </div>
          <span className="control-panel-toggle" aria-hidden="true">
            <span className="when-closed">Open hatch</span>
            <span className="when-open">Close hatch</span>
          </span>
        </summary>
        <div className="control-panel-body">
          <p className="form-note">Creator cancel before purchase, expiry refunds after execution, surplus sweep for untracked ETH.</p>
          <div className="button-row">
            <button className="button dark" onClick={cancelCampaign} disabled={!campaignEnabled}>Creator cancel</button>
            <button className="button ghost" onClick={enableRefunds} disabled={!campaignEnabled}>Enable expired refunds</button>
            <button className="button ghost" onClick={claimRefund} disabled={!campaignEnabled}>Claim refund</button>
            <button className="button ghost" onClick={donateSurplus} disabled={!campaignEnabled}>Donate surplus</button>
          </div>
        </div>
      </details>

      <section id="faq" className="faq-section">
        <div className="section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>Questions worth asking before donating.</h2>
        </div>
        <div className="faq-grid">
          <article className="faq-card-pink">
            <h3>What do I get?</h3>
            <p>Nothing. No token, no fraction, no governance, no claim on the Punk, no financial return. You get to be part of a very public experiment.</p>
          </article>
          <article>
            <h3>Who gets the Punk?</h3>
            <p>The campaign creator. The first campaign is from the creator of FundPunks, asking the internet to help buy a Punk and prove the donation-only thesis in public.</p>
          </article>
          <article className="faq-card-blue">
            <h3>What happens to change?</h3>
            <p>
              If the Punk costs less than the ETH raised, the leftover ETH goes to{' '}
              <a href="https://protocol-guild.readthedocs.io/" target="_blank" rel="noreferrer">Protocol Guild</a>.
              If that donation fails, the whole buy reverts.
            </p>
          </article>
          <article>
            <h3>Is this audited?</h3>
            <p>No. This is reckless, but you were gifting money anyway. If the contract is hacked, we can both treat it as an expensive lesson.</p>
          </article>
          <article>
            <h3>Can I get a refund?</h3>
            <p>Only if the creator cancels before purchase or no purchase succeeds by the execution deadline. Refunds go back to the contributor address, so use a wallet that can receive ETH.</p>
          </article>
          <article className="faq-card-yellow">
            <h3>What is a campaign?</h3>
            <p>A campaign is someone asking the crowd to help fund a Punk. The first campaign supports nuconomy.eth, creator of the contract. After that, absolutely anyone with gas fees and a dream can launch one.</p>
          </article>
        </div>
      </section>

      <section className="guild-feature" aria-label="Protocol Guild">
        <div>
          <span className="eyebrow">Choose the Punk</span>
          <h2>Blow the budget, or floor it for the future.</h2>
          <p>
            Anyone onchain can execute the buy, whether they donated or not, and that executor picks the listed Punk. Spend the full budget and the creator gets the Punk. Snipe a cheaper floor Punk and
            the change goes to{' '}
            <a href="https://protocol-guild.readthedocs.io/" target="_blank" rel="noreferrer">Protocol Guild</a>.
            Frugality helps public goods, and the recipient is hardcoded so nobody can reroute it.
          </p>
        </div>
        <div className="guild-points">
          <article>
            <span>Why them?</span>
            <p>Protocol Guild supports Ethereum protocol contributors: the people maintaining the infrastructure this experiment depends on.</p>
          </article>
          <article>
            <span>Where does change go?</span>
            <p>To the hardcoded recipient <code>{PROTOCOL_GUILD_ADDRESS}</code>. Creator, executor, and frontend cannot edit it.</p>
          </article>
          <article>
            <span>Who picks the Punk?</span>
            <p>Whoever executes the buy chooses the listed Punk, as long as its price fits the campaign budget, tracked balance, and their max price.</p>
          </article>
        </div>
      </section>

      <section className="bottom-cta" aria-label="Donate call to action">
        <div>
          <span className="eyebrow">Pick a side</span>
          <h2>Fund the first campaign.<br />Launch the next.</h2>
          <p>
            Help prove generosity, selflessness, and good humans still exist in crypto.<br />
            Or just bring your gas fees and make your own unreasonable ask ;)
          </p>
        </div>
        <div className="bottom-actions">
          <a className="button primary" href="#donate">Donate to the first campaign</a>
          <a className="button secondary" href="#factory">Launch your own</a>
        </div>
      </section>

      <footer className="site-footer">
        <span>
          A social experiment by{' '}
          <a href="https://x.com/nuconomy" target="_blank" rel="noreferrer">@nuconomy.eth</a>.
        </span>
        <span>
          <a href="https://github.com/nuconomy/fundpunk" target="_blank" rel="noreferrer">GitHub</a>
        </span>
        <span>No rights reserved. No upside implied.</span>
      </footer>
    </main>
  )
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <AppInner />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
