import { useEffect, useMemo, useState } from 'react'
import { createConfig, http, useAccount, useBalance, useConnect, useDisconnect, useEnsName, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
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
const MARKET_WORKER_URL = (import.meta.env.VITE_CRYPTOPUNKS_MARKET_WORKER_URL || '').trim()
const MARKET_CANDIDATE_LIMIT = 48
const CRYPTOPUNKS_MARKET_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB'
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

const cryptopunksMarketAbi = [
  {
    inputs: [{ name: 'punkIndex', type: 'uint256' }],
    name: 'punksOfferedForSale',
    outputs: [
      { name: 'isForSale', type: 'bool' },
      { name: 'punkIndex', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'minValue', type: 'uint256' },
      { name: 'onlySellTo', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
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

function normalizePunkId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id >= 0 && id <= 9999 ? id : undefined
}

function candidatePunkId(value) {
  if (value && typeof value === 'object') {
    return normalizePunkId(value.punkId ?? value.punkIndex ?? value.index ?? value.id)
  }

  return normalizePunkId(value)
}

function dedupePunkIds(values) {
  const seen = new Set()
  const ids = []

  for (const value of values) {
    const id = candidatePunkId(value)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

function normalizeMarketIndex(payload) {
  const data = payload?.data && !Array.isArray(payload.data) && typeof payload.data === 'object' ? payload.data : payload
  const rawCandidates = Array.isArray(data?.candidates)
    ? data.candidates
    : Array.isArray(data?.listings)
      ? data.listings
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : []
  const rawOfferedIds = Array.isArray(data?.offeredIds) ? data.offeredIds : []
  const candidateIds = dedupePunkIds(rawCandidates)
  const offeredIds = dedupePunkIds(rawOfferedIds)
  const fallbackCandidateIds = candidateIds.length > 0 ? candidateIds : offeredIds

  return {
    candidateIds: fallbackCandidateIds.slice(0, MARKET_CANDIDATE_LIMIT),
    fetchedAt: typeof data?.fetchedAt === 'string' ? data.fetchedAt : '',
    offeredCount: Number(data?.offeredCount ?? offeredIds.length),
  }
}

function getOfferTuple(readResult) {
  if (!readResult) return undefined
  if (readResult.status && readResult.status !== 'success') return undefined

  const result = typeof readResult === 'object' && 'result' in readResult ? readResult.result : readResult
  return Array.isArray(result) ? result : undefined
}

function formatEth(value) {
  if (value === undefined) return '...'
  return `${Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`
}

function formatEthInput(value) {
  return formatEther(value).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
}

function suggestedTargetFromFloor(value) {
  const floorEth = Number(formatEther(value))
  if (!Number.isFinite(floorEth) || floorEth <= 0) return ''

  const suggestedEth = Math.ceil(floorEth * 1.1 * 10) / 10
  return suggestedEth.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function shortAddress(value) {
  if (!value) return '...'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatDateTime(seconds) {
  if (!seconds) return '...'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(Number(seconds) * 1000))
}

function formatTimeRemaining(seconds, nowMs) {
  if (!seconds) return '...'

  const remainingSeconds = Math.max(0, Number(seconds) - Math.floor(nowMs / 1000))
  if (remainingSeconds === 0) return 'Expired'

  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)

  if (days > 1) return `${days} days`
  if (days === 1) return hours > 0 ? `1 day ${hours}h` : '1 day'
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function CampaignMetaRow({ label, value }) {
  const address = isAddress(value) ? value : undefined
  const ensName = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: Boolean(address && hasReadTransport) },
  })

  return (
    <div>
      <span>{label}</span>
      {ensName.data && <strong className="ens-name">{ensName.data}</strong>}
      <code>{value || '...'}</code>
    </div>
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
  const [budgetEdited, setBudgetEdited] = useState(false)
  const [fundDays, setFundDays] = useState('30')
  const [execDays, setExecDays] = useState('30')

  const [contribEth, setContribEth] = useState('0.1')
  const [buyPunkId, setBuyPunkId] = useState('')
  const [buyMaxEth, setBuyMaxEth] = useState('31')
  const [buyFormEdited, setBuyFormEdited] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [marketIndex, setMarketIndex] = useState(() => ({
    status: MARKET_WORKER_URL ? 'loading' : 'disabled',
    data: null,
    error: '',
  }))

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!MARKET_WORKER_URL) {
      setMarketIndex({ status: 'disabled', data: null, error: '' })
      return undefined
    }

    let cancelled = false
    let intervalId

    async function loadMarketIndex() {
      setMarketIndex((current) => ({
        ...current,
        status: current.data ? 'refreshing' : 'loading',
        error: '',
      }))

      try {
        const url = new URL(MARKET_WORKER_URL)
        url.searchParams.set('limit', String(MARKET_CANDIDATE_LIMIT))

        const response = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`Market worker returned ${response.status}`)

        const payload = await response.json()
        const normalized = normalizeMarketIndex(payload)

        if (!cancelled) {
          setMarketIndex({ status: 'ready', data: normalized, error: '' })
        }
      } catch (error) {
        if (!cancelled) {
          setMarketIndex((current) => ({
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'Market index failed',
          }))
        }
      }
    }

    loadMarketIndex()
    intervalId = window.setInterval(loadMarketIndex, 120000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

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
  const fundingDeadline = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'fundingDeadline', query: { enabled: campaignReadEnabled } })
  const executionDeadline = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'executionDeadline', query: { enabled: campaignReadEnabled } })
  const creator = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'creator', query: { enabled: campaignReadEnabled } })
  const creatorEnsName = useEnsName({
    address: isAddress(creator.data) ? creator.data : undefined,
    chainId: mainnet.id,
    query: { enabled: Boolean(isAddress(creator.data) && hasReadTransport) },
  })
  const market = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'cryptopunksMarket', query: { enabled: campaignReadEnabled } })
  const donation = useReadContract({ address: selectedCampaignAddr, abi: campaignAbi, functionName: 'donationRecipient', query: { enabled: campaignReadEnabled } })
  const campaignBalance = useBalance({
    address: selectedCampaignAddr,
    chainId: mainnet.id,
    query: { enabled: campaignReadEnabled },
  })
  const marketCandidateIds = useMemo(() => marketIndex.data?.candidateIds || [], [marketIndex.data])
  const marketReadContracts = useMemo(() => (
    marketCandidateIds.map((punkId) => ({
      address: CRYPTOPUNKS_MARKET_ADDRESS,
      abi: cryptopunksMarketAbi,
      functionName: 'punksOfferedForSale',
      args: [BigInt(punkId)],
    }))
  ), [marketCandidateIds])
  const offerReads = useReadContracts({
    allowFailure: true,
    contracts: marketReadContracts,
    query: {
      enabled: hasReadTransport && marketReadContracts.length > 0,
      refetchInterval: 60000,
    },
  })
  const verifiedPublicListings = useMemo(() => {
    const listings = []

    marketCandidateIds.forEach((punkId, index) => {
      const tuple = getOfferTuple(offerReads.data?.[index])
      if (!tuple) return

      const [isForSale, punkIndexOut, seller, minValue, onlySellTo] = tuple
      const verifiedPunkId = Number(punkIndexOut ?? punkId)
      const minValueWei = minValue === undefined || minValue === null ? 0n : BigInt(minValue)
      const sellTo = String(onlySellTo || ZERO_ADDRESS).toLowerCase()

      if (
        !isForSale ||
        verifiedPunkId !== punkId ||
        minValueWei <= 0n ||
        sellTo !== ZERO_ADDRESS
      ) {
        return
      }

      listings.push({ punkId, seller, minValue: minValueWei })
    })

    return listings.sort((a, b) => a.minValue < b.minValue ? -1 : a.minValue > b.minValue ? 1 : a.punkId - b.punkId)
  }, [marketCandidateIds, offerReads.data])
  const verifiedFloorListing = verifiedPublicListings[0]
  const affordableListings = useMemo(() => {
    if (!budget.data) return []
    return verifiedPublicListings.filter((listing) => listing.minValue <= budget.data).slice(0, 12)
  }, [budget.data, verifiedPublicListings])
  const selectedPunkId = normalizePunkId(buyPunkId)
  const selectedListing = useMemo(
    () => verifiedPublicListings.find((listing) => listing.punkId === selectedPunkId),
    [selectedPunkId, verifiedPublicListings],
  )
  const selectedFundingKnown = selectedListing
    ? campaignBalance.data?.value !== undefined && raised.data !== undefined && budget.data !== undefined
    : true
  const campaignSpendableWei = campaignBalance.data?.value !== undefined && raised.data !== undefined
    ? (campaignBalance.data.value < raised.data ? campaignBalance.data.value : raised.data)
    : undefined
  const selectedAboveBudget = Boolean(
    selectedListing && budget.data !== undefined && selectedListing.minValue > budget.data,
  )
  const selectedFundsShortfall = selectedListing && campaignSpendableWei !== undefined && campaignSpendableWei < selectedListing.minValue
    ? selectedListing.minValue - campaignSpendableWei
    : 0n
  const selectedBuyUnavailable = Boolean(
    selectedListing && (!selectedFundingKnown || selectedAboveBudget || selectedFundsShortfall > 0n),
  )
  const selectedProtocolDonationWei = selectedListing &&
    selectedFundingKnown &&
    !selectedAboveBudget &&
    selectedFundsShortfall === 0n &&
    campaignBalance.data.value > selectedListing.minValue
    ? campaignBalance.data.value - selectedListing.minValue
    : 0n
  const buyButtonDisabled = !campaignEnabled || selectedBuyUnavailable
  const progressPct = budget.data && budget.data > 0n && raised.data !== undefined
    ? Math.min(100, Number((raised.data * 10000n) / budget.data) / 100)
    : 0
  const missingWei = budget.data && raised.data !== undefined && budget.data > raised.data
    ? budget.data - raised.data
    : 0n
  const progressLabel = campaignReadEnabled && budget.data
    ? `${progressPct.toFixed(progressPct >= 10 ? 0 : 1)}%`
    : '...'
  const stateValue = Number(state.data ?? 0)
  const activeDeadline = stateValue === 1
    ? executionDeadline.data
    : stateValue === 0
      ? fundingDeadline.data
      : undefined
  const activeDeadlineLabel = stateValue === 1
    ? 'Buying window ends'
    : stateValue === 0
      ? 'Funding ends'
      : stateValue === 2
        ? 'Campaign status'
        : 'Refund status'
  const timeRemainingLabel = campaignReadEnabled && activeDeadline
    ? formatTimeRemaining(activeDeadline, nowMs)
    : stateValue === 2
      ? 'Resolved'
      : stateValue === 3
        ? 'Claimable'
        : '...'
  const deadlineDateLabel = campaignReadEnabled && activeDeadline
    ? formatDateTime(activeDeadline)
    : stateValue === 2
      ? 'Punk bought'
      : stateValue === 3
      ? 'Refunds open'
      : '...'
  const selectedCampaignIsFeatured = Boolean(
    featuredCampaign &&
    selectedCampaignAddr &&
    selectedCampaignAddr.toLowerCase() === featuredCampaign.toLowerCase(),
  )
  const creatorDisplayLabel = creatorEnsName.data || (isAddress(creator.data) ? shortAddress(creator.data) : '')
  const campaignHeading = selectedCampaignIsFeatured
    ? 'The first FundPunks campaign is live.'
    : 'This FundPunks campaign is live.'
  const campaignIntro = selectedCampaignIsFeatured
    ? 'You are viewing the launch campaign from the creator of FundPunks. Donate here, or paste any factory-created campaign address to inspect and support another Punk dream.'
    : creatorDisplayLabel
      ? `You are viewing a factory-created FundPunks campaign launched by ${creatorDisplayLabel}. Donate here, or paste another factory-created campaign address to inspect and support a different Punk dream.`
      : 'You are viewing a factory-created FundPunks campaign. Donate here, or paste another factory-created campaign address to inspect and support a different Punk dream.'

  useEffect(() => {
    if (!verifiedFloorListing || buyFormEdited) return

    setBuyPunkId(String(verifiedFloorListing.punkId))
    setBuyMaxEth(formatEthInput(verifiedFloorListing.minValue))
  }, [buyFormEdited, verifiedFloorListing])

  useEffect(() => {
    if (!verifiedFloorListing || budgetEdited) return

    setBudgetEth(suggestedTargetFromFloor(verifiedFloorListing.minValue))
  }, [budgetEdited, verifiedFloorListing])

  function fillBuyFormFromListing(listing) {
    setBuyFormEdited(true)
    setBuyPunkId(String(listing.punkId))
    setBuyMaxEth(formatEthInput(listing.minValue))
  }

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
            <span className="eyebrow">Launch campaign live</span>
            <h2>{campaignHeading}</h2>
            <p>{campaignIntro}</p>
          </div>

          <div className="campaign-selector" aria-label="Campaign selector">
            <div className="campaign-selector-heading">
              <span>{selectedCampaignIsFeatured ? 'Featured campaign' : 'Selected campaign'}</span>
              <strong>{campaignEnabled ? `Launched by ${creatorDisplayLabel || shortAddress(creator.data)}` : 'Waiting for factory deployment'}</strong>
            </div>
            <Field label="Campaign address">
              <input
                value={campaignAddr}
                onChange={(e) => setCampaignAddr(e.target.value)}
                placeholder={selectedCampaignAddr || featuredCampaign || '0x...'}
                spellCheck="false"
              />
            </Field>
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
            {!featuredCampaign && (
              <p className="campaign-empty">Once the factory is deployed, the first campaign it launched will load here automatically.</p>
            )}
          </div>
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
            <div className="deadline-strip" aria-label="Campaign timing">
              <div>
                <span>{activeDeadlineLabel}</span>
                <strong>{deadlineDateLabel}</strong>
              </div>
              <div>
                <span>Time left</span>
                <strong>{timeRemainingLabel}</strong>
              </div>
            </div>
          </div>

        </div>

        <form id="donate" className="action-box donate-box" onSubmit={(e) => { e.preventDefault(); contribute() }}>
          <div>
            <span className="eyebrow">Make it real</span>
            <h3>Send some ETH</h3>
            <p>Keep this FundPunk dream alive.</p>
          </div>
          <Field label="Amount">
            <input value={contribEth} onChange={(e) => setContribEth(e.target.value)} inputMode="decimal" />
          </Field>
          {!isConnected && (
            <p className="form-note">Connect your wallet first. Then donate and receive precisely nothing.</p>
          )}
          {isConnected ? (
            <button className="button primary" disabled={!campaignEnabled}>Fund This Punk</button>
          ) : (
            <button className="button primary" type="button" onClick={() => connect({ connector: injected() })}>Connect to Fund</button>
          )}
          <div className="address-list donation-meta">
            <CampaignMetaRow label="Selected campaign" value={selectedCampaignAddr} />
            <CampaignMetaRow label="Campaign creator wallet" value={creator.data} />
            <CampaignMetaRow label="Original CryptoPunks market" value={market.data} />
            <CampaignMetaRow label="Change goes to Protocol Guild" value={donation.data} />
          </div>
        </form>

        <form className="market-buy-box" onSubmit={(e) => { e.preventDefault(); executeBuy() }}>
          <div className="market-buy-heading">
            <div>
              <span className="eyebrow">Live market</span>
              <h3>Choose the Punk to buy.</h3>
              <p>Default to the floor to send more change to Protocol Guild, or pick any verified public listing inside the campaign target.</p>
            </div>
            <div className="market-floor">
              <span>Verified floor</span>
              <strong>{verifiedFloorListing ? formatEth(verifiedFloorListing.minValue) : '...'}</strong>
            </div>
          </div>

          <div className={`market-buy-grid ${verifiedFloorListing ? '' : 'no-floor'}`}>
            {verifiedFloorListing && (
              <button
                className={`floor-punk-card ${selectedListing?.punkId === verifiedFloorListing.punkId ? 'selected' : ''}`}
                type="button"
                onClick={() => fillBuyFormFromListing(verifiedFloorListing)}
                aria-label={`Use floor Punk ${verifiedFloorListing.punkId}`}
              >
                <img
                  src={`https://www.cryptopunks.app/api/punks/${verifiedFloorListing.punkId}/image`}
                  alt={`CryptoPunk #${verifiedFloorListing.punkId}`}
                  loading="eager"
                />
                <span>Default floor</span>
                <strong>#{verifiedFloorListing.punkId}</strong>
                <small>{formatEth(verifiedFloorListing.minValue)}</small>
              </button>
            )}

            <div className="target-punk-panel">
              <div className="target-punk-heading">
                <span>Inside campaign target</span>
                <p>These listings are verified public offers at or below the selected campaign target.</p>
              </div>

              {marketIndex.status === 'disabled' ? (
                <p className="form-note">Set VITE_CRYPTOPUNKS_MARKET_WORKER_URL to enable live listing suggestions.</p>
              ) : marketIndex.status === 'loading' || (marketReadContracts.length > 0 && !offerReads.data && offerReads.isFetching) ? (
                <p className="form-note">Loading live market candidates and verifying listings onchain...</p>
              ) : marketIndex.status === 'error' && !marketIndex.data ? (
                <p className="form-note warning-note">Live listings are unavailable.</p>
              ) : offerReads.isError ? (
                <p className="form-note warning-note">Live listing verification is unavailable.</p>
              ) : affordableListings.length > 0 ? (
                <div className="market-carousel" aria-label="Verified affordable listings">
                  {affordableListings.map((listing) => (
                    <button
                      key={listing.punkId}
                      className={`market-card ${selectedListing?.punkId === listing.punkId ? 'selected' : ''}`}
                      type="button"
                      onClick={() => fillBuyFormFromListing(listing)}
                    >
                      <img
                        src={`https://www.cryptopunks.app/api/punks/${listing.punkId}/image`}
                        alt={`CryptoPunk #${listing.punkId}`}
                        loading="lazy"
                      />
                      <span>#{listing.punkId}</span>
                      <strong>{formatEth(listing.minValue)}</strong>
                      <small>Fill buy form</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="form-note">
                  {budget.data
                    ? 'No verified public listings fit this campaign target right now.'
                    : 'Verified listings load against the selected campaign target.'}
                </p>
              )}

              <div className="buy-fields">
                <Field label="Punk ID">
                  <input
                    value={buyPunkId}
                    onChange={(e) => {
                      setBuyFormEdited(true)
                      setBuyPunkId(e.target.value)
                    }}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Max ETH">
                  <input
                    value={buyMaxEth}
                    onChange={(e) => {
                      setBuyFormEdited(true)
                      setBuyMaxEth(e.target.value)
                    }}
                    inputMode="decimal"
                  />
                </Field>
                <button
                  className="button secondary"
                  disabled={buyButtonDisabled}
                  title={selectedBuyUnavailable ? 'Campaign funds or target are below the selected listing.' : undefined}
                >
                  Buy the Punk
                </button>
              </div>

              {selectedListing ? (
                <p className={`selection-note ${selectedBuyUnavailable ? 'warning-note' : ''}`}>
                  {!selectedFundingKnown
                    ? `Checking campaign funds for Punk #${selectedListing.punkId}.`
                    : selectedAboveBudget
                      ? `Punk #${selectedListing.punkId} is above this campaign target. Estimated Protocol Guild donation: 0 ETH.`
                      : selectedFundsShortfall > 0n
                        ? `Punk #${selectedListing.punkId} needs ${formatEth(selectedFundsShortfall)} more before purchase. Estimated Protocol Guild donation: 0 ETH.`
                        : `Punk #${selectedListing.punkId} would send about ${formatEth(selectedProtocolDonationWei)} to Protocol Guild after purchase.`}
                </p>
              ) : (
                <p className="selection-note">Enter a Punk ID and max ETH, or choose a verified listing above.</p>
              )}
            </div>
          </div>
        </form>
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
            <input
              value={budgetEth}
              onChange={(e) => {
                setBudgetEdited(true)
                setBudgetEth(e.target.value)
              }}
              inputMode="decimal"
            />
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
        <div className="faq-layout">
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Questions worth asking before donating.</h2>
          </div>
          <div className="faq-list">
            <article>
              <span>01</span>
              <div>
                <h3>What do I get?</h3>
                <p>Nothing. No token, no fraction, no governance, no claim on the Punk, no financial return. You get to be part of a very public experiment.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Who gets the Punk?</h3>
                <p>The campaign creator. The first campaign is from the creator of FundPunks, asking the internet to help buy a Punk and prove the donation-only thesis in public.</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>What is a campaign?</h3>
                <p>A campaign is someone asking the crowd to help fund a Punk. The first campaign supports nuconomy.eth, creator of the contract. After that, absolutely anyone with gas fees and a dream can launch one.</p>
              </div>
            </article>
            <article>
              <span>04</span>
              <div>
                <h3>Can I get a refund?</h3>
                <p>Only if the creator cancels before purchase or no purchase succeeds by the execution deadline. Refunds go back to the contributor address, so use a wallet that can receive ETH.</p>
              </div>
            </article>
            <article>
              <span>05</span>
              <div>
                <h3>Is this audited?</h3>
                <p>No. This is reckless, but you were gifting money anyway. If the contract is hacked, we can both treat it as an expensive lesson.</p>
              </div>
            </article>
            <article>
              <span>06</span>
              <div>
                <h3>What happens to change?</h3>
                <p>If the Punk costs less than the ETH raised, the leftover ETH goes to <a href="https://protocol-guild.readthedocs.io/" target="_blank" rel="noreferrer">Protocol Guild</a>. If that donation fails, the whole buy reverts.</p>
              </div>
            </article>
          </div>
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
          <div>
            <span>Why them?</span>
            <p>Protocol Guild supports Ethereum protocol contributors: the people maintaining the infrastructure this experiment depends on.</p>
          </div>
          <div>
            <span>Where does change go?</span>
            <p>To the hardcoded recipient <code>{PROTOCOL_GUILD_ADDRESS}</code>. Creator, executor, and frontend cannot edit it.</p>
          </div>
          <div>
            <span>Who picks the Punk?</span>
            <p>Whoever executes the buy chooses the listed Punk, as long as its price fits the campaign budget, tracked balance, and their max price.</p>
          </div>
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
        <span>&quot;CryptoPunks fund code.&quot; No rights reserved.</span>
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
