import { useMemo, useState } from 'react'
import { createConfig, http, useAccount, useConnect, useDisconnect, useReadContract, useWriteContract } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatEther, parseEther } from 'viem'
import heroPunk from './assets/hero.png'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || ZERO_ADDRESS
const PROTOCOL_GUILD_ADDRESS = '0x25941dC771bB64514Fc8abBce970307Fb9d477e9'

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
  { inputs: [], name: 'surplusBalanceWei', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
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
  transports: { [mainnet.id]: http() },
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

function AppInner() {
  const [campaignAddr, setCampaignAddr] = useState('')
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
    query: { enabled: factoryReady },
  })

  const factoryCampaignList = useMemo(() => {
    const seen = new Set()
    const campaigns = []

    for (const address of factoryCampaigns.data || []) {
      if (!isAddress(address)) continue
      const key = address.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        campaigns.push(address)
      }
    }

    return campaigns
  }, [factoryCampaigns.data])

  const featuredCampaign = factoryCampaignList[0]
  const suggestedCampaigns = factoryCampaignList.slice(1)
  const selectedCampaignAddr = isAddress(campaignAddr) ? campaignAddr : featuredCampaign || ''
  const campaignEnabled = isAddress(selectedCampaignAddr)

  const budget = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'purchaseBudgetWei', query: { enabled: campaignEnabled } })
  const raised = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'totalRaised', query: { enabled: campaignEnabled } })
  const state = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'getState', query: { enabled: campaignEnabled } })
  const creator = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'creator', query: { enabled: campaignEnabled } })
  const market = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'cryptopunksMarket', query: { enabled: campaignEnabled } })
  const donation = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'donationRecipient', query: { enabled: campaignEnabled } })
  const surplus = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'surplusBalanceWei', query: { enabled: campaignEnabled } })

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
          <div className="kicker">No token. No upside. No pretending.</div>
          <h1>Buy me a Punk. Get absolutely nothing.</h1>
          <p className="lede">
            FundPunks is donation-only crowdfunding for original CryptoPunks. The first campaign is the proof:
            can people help one builder get a Punk with zero promise of ownership, profit, mint, merch, points, or wink-wink future utility?
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#donate">Donate to the experiment</a>
            <a className="button secondary" href="#faq">Read the brutal FAQ</a>
          </div>
        </div>

        <div className="hero-visual" aria-label="FundPunks campaign card">
          <div className="punk-frame">
            <img src={heroPunk} alt="Stacked pixel-art FundPunks tile" />
            <div className="punk-caption">
              <span>The thesis</span>
              <strong>Generosity, but make it onchain.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="thesis-band" aria-label="Project thesis">
        <div>
          <span className="eyebrow">Inspired by Buy Me A Punk</span>
          <p>
            No art mint this time. No collector pass. No economic wrapper. Just a factory anyone can use forever
            to ask the internet for help buying a Punk, in public, with the change going to public goods.
          </p>
        </div>
        <a className="button dark" href="https://buymeapunk.xyz/" target="_blank" rel="noreferrer">See the cousin</a>
      </section>

      <section id="campaign" className="campaign-layout">
        <div className="campaign-panel">
          <div className="section-heading">
            <span className="eyebrow">The machine</span>
            <h2>Campaign console</h2>
            <p>Start with the featured campaign, switch to another factory campaign, or paste an address if you are living manually.</p>
          </div>

          <div className="campaign-picker" aria-label="Live campaigns">
            <div className="campaign-picker-heading">
              <span>Featured campaign</span>
              <strong>{featuredCampaign ? 'First out of the factory' : 'Waiting for factory deployment'}</strong>
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

          <Field label="Paste a different campaign address">
            <input
              value={campaignAddr}
              onChange={(e) => setCampaignAddr(e.target.value)}
              placeholder={selectedCampaignAddr || '0x...'}
              spellCheck="false"
            />
          </Field>

          <div className="status-grid">
            <div className="metric">
              <span>State</span>
              <strong>{campaignEnabled ? stateName(state.data) : 'Paste address'}</strong>
            </div>
            <div className="metric">
              <span>Raised</span>
              <strong>{formatEth(raised.data)}</strong>
            </div>
            <div className="metric">
              <span>Budget</span>
              <strong>{formatEth(budget.data)}</strong>
            </div>
            <div className="metric">
              <span>Surplus</span>
              <strong>{formatEth(surplus.data)}</strong>
            </div>
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
              <p>Your reward is the warm silence of the chain recording your generosity.</p>
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
              <span className="eyebrow">Strike</span>
              <h3>Attempt buy</h3>
              <p>Anyone can execute if the listed Punk fits the budget, balance, and max price.</p>
            </div>
            <Field label="Punk ID">
              <input value={buyPunkId} onChange={(e) => setBuyPunkId(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Max ETH">
              <input value={buyMaxEth} onChange={(e) => setBuyMaxEth(e.target.value)} inputMode="decimal" />
            </Field>
            <button className="button secondary" disabled={!campaignEnabled}>Attempt buy</button>
          </form>

          <div className="action-box danger-zone">
            <div>
              <span className="eyebrow">Exit hatch</span>
              <h3>Refund path</h3>
              <p>Creator cancel before purchase, expiry refunds after execution, surplus sweep for untracked ETH.</p>
            </div>
            <div className="button-row">
              <button className="button dark" onClick={cancelCampaign} disabled={!campaignEnabled}>Creator cancel</button>
              <button className="button ghost" onClick={enableRefunds} disabled={!campaignEnabled}>Enable expired refunds</button>
              <button className="button ghost" onClick={claimRefund} disabled={!campaignEnabled}>Claim refund</button>
              <button className="button ghost" onClick={donateSurplus} disabled={!campaignEnabled}>Donate surplus</button>
            </div>
          </div>
        </div>
      </section>

      <section className="factory-section" aria-label="Factory">
        <div className="section-heading">
          <span className="eyebrow">Forever machine</span>
          <h2>Anyone can launch the next campaign.</h2>
          <p>
            The factory is the democratic bit: one contract pattern, many Punk campaigns, no permission slip from the first person bold enough to ask.
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

      <section id="faq" className="faq-section">
        <div className="section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>Questions you should ask before donating.</h2>
        </div>
        <div className="faq-grid">
          <article className="faq-card-pink">
            <h3>What do I get?</h3>
            <p>Nothing. No token, no fraction, no governance, no claim on the Punk, no financial return. You get the memory of having done something extremely onchain.</p>
          </article>
          <article>
            <h3>Who gets the Punk?</h3>
            <p>The campaign creator. The first campaign is the creator asking for help getting a Punk and proving the donation-only thesis in public.</p>
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
            <p>A campaign is one person asking the crowd to donate toward a Punk. Anyone with gas fees and a dream can launch one. The first campaign is from the creator of this tool, trying to prove the whole ridiculous idea in public.</p>
          </article>
        </div>
      </section>

      <section className="guild-feature" aria-label="Protocol Guild">
        <div>
          <span className="eyebrow">Choose the Punk</span>
          <h2>Blow the budget, or floor it for the future.</h2>
          <p>
            Whoever executes the buy picks the listed Punk. Spend the full budget and the creator gets the grail. Snipe a cheaper floor Punk and
            the change goes to{' '}
            <a href="https://protocol-guild.readthedocs.io/" target="_blank" rel="noreferrer">Protocol Guild</a>.
            Frugality becomes public goods, and the recipient is hardcoded so nobody can reroute the victory crumbs.
          </p>
        </div>
        <div className="guild-points">
          <article>
            <span>Why them?</span>
            <p>Protocol Guild supports Ethereum protocol contributors: the people maintaining the rails this whole stunt rides on.</p>
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
          <span className="eyebrow">Still here?</span>
          <h2>Fund the experiment. Receive nothing.</h2>
          <p>No token, no upside, no future anything. Just click the button and donate.</p>
        </div>
        <a className="button primary" href="#donate">Donate Now. Get Nothing</a>
      </section>

      <footer className="site-footer">
        <span>
          A social experiment by{' '}
          <a href="https://x.com/nuconomy" target="_blank" rel="noreferrer">@nuconomy.eth</a>.
        </span>
        <span>No rights reserved. No refunds after glory.</span>
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
