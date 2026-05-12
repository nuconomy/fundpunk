const hre = require("hardhat");

const CRYPTOPUNKS_MARKET = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB";
const PROTOCOL_GUILD = "0x25941dC771bB64514Fc8abBce970307Fb9d477e9";

const punksAbi = [
  "function punkIndexToAddress(uint256 punkIndex) view returns (address)",
  "function punksOfferedForSale(uint256 punkIndex) view returns (bool isForSale, uint256 punkIndexOut, address seller, uint256 minValue, address onlySellTo)",
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function getListedPunk(market, campaignAddress, punkId, maxPriceWei) {
  const offer = await market.punksOfferedForSale(punkId);
  if (!offer.isForSale) throw new Error(`Punk ${punkId} is not listed for sale`);
  if (offer.punkIndexOut !== BigInt(punkId)) throw new Error(`Punk ${punkId} offer returned mismatched id`);
  if (offer.minValue === 0n) throw new Error(`Punk ${punkId} has a zero-price offer`);
  if (offer.minValue > maxPriceWei) {
    throw new Error(`Punk ${punkId} costs ${hre.ethers.formatEther(offer.minValue)} ETH, above MAX_PRICE_ETH`);
  }
  if (offer.onlySellTo !== hre.ethers.ZeroAddress && offer.onlySellTo.toLowerCase() !== campaignAddress.toLowerCase()) {
    throw new Error(`Punk ${punkId} is reserved for ${offer.onlySellTo}`);
  }

  const owner = await market.punkIndexToAddress(punkId);
  if (owner.toLowerCase() !== offer.seller.toLowerCase()) throw new Error(`Punk ${punkId} seller does not match owner`);
  if (owner.toLowerCase() === campaignAddress.toLowerCase()) throw new Error(`Campaign already owns Punk ${punkId}`);

  return { punkId, priceWei: offer.minValue, seller: offer.seller };
}

async function main() {
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    throw new Error("Run this only against a local fork, e.g. --network localhost");
  }

  const campaignAddress = requiredEnv("CAMPAIGN_ADDRESS");
  const punkId = Number(requiredEnv("PUNK_ID"));
  if (!Number.isInteger(punkId) || punkId < 0 || punkId > 9999) {
    throw new Error("PUNK_ID must be an integer from 0 to 9999");
  }

  const maxPriceWei = hre.ethers.parseEther(process.env.MAX_PRICE_ETH || "30");

  const [executor, contributor] = await hre.ethers.getSigners();
  const campaign = await hre.ethers.getContractAt("FundPunkCampaign", campaignAddress);
  const market = new hre.ethers.Contract(CRYPTOPUNKS_MARKET, punksAbi, hre.ethers.provider);

  const creator = await campaign.creator();
  const budget = await campaign.purchaseBudgetWei();
  const contribution = budget < maxPriceWei ? budget : maxPriceWei;
  const listed = await getListedPunk(market, campaignAddress, punkId, maxPriceWei);

  console.log("Campaign:", campaignAddress);
  console.log("Creator:", creator);
  console.log("Executor:", executor.address);
  console.log("Contributor:", contributor.address);
  console.log("Punk:", listed.punkId);
  console.log("Price:", hre.ethers.formatEther(listed.priceWei), "ETH");
  console.log("Contributing:", hre.ethers.formatEther(contribution), "ETH");

  const guildBefore = await hre.ethers.provider.getBalance(PROTOCOL_GUILD);
  await (await campaign.connect(contributor).contribute({ value: contribution })).wait();
  await (await campaign.connect(executor).attemptBuy(listed.punkId, maxPriceWei)).wait();
  const guildAfter = await hre.ethers.provider.getBalance(PROTOCOL_GUILD);

  const ownerAfter = await market.punkIndexToAddress(listed.punkId);
  const bought = await campaign.bought();
  const campaignBalance = await hre.ethers.provider.getBalance(campaignAddress);
  const leftover = contribution - listed.priceWei;

  console.log("Bought:", bought);
  console.log("Owner after:", ownerAfter);
  console.log("Campaign balance:", hre.ethers.formatEther(campaignBalance), "ETH");
  console.log("Guild received:", hre.ethers.formatEther(guildAfter - guildBefore), "ETH");

  if (!bought) throw new Error("Campaign did not mark bought");
  if (ownerAfter.toLowerCase() !== creator.toLowerCase()) throw new Error("Creator does not own bought Punk");
  if (campaignBalance !== 0n) throw new Error("Campaign balance should be zero after successful buy");
  if (guildAfter - guildBefore !== leftover) throw new Error("Protocol Guild did not receive exact leftover");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
