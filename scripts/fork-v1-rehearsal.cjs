const hre = require("hardhat");

const CRYPTOPUNKS_V1_MARKET = "0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D";
const PUNKSMARKET = "0x64e507FEBF26521b73FbdfA533106B2042533218";
const PROTOCOL_GUILD = "0x25941dC771bB64514Fc8abBce970307Fb9d477e9";

const v1PunksAbi = [
  "function punkIndexToAddress(uint256 punkIndex) view returns (address)",
  "function punksOfferedForSale(uint256 punkIndex) view returns (bool isForSale, uint256 punkIndexOut, address seller, uint256 minValue, address onlySellTo)",
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parsePunkId() {
  const punkId = Number(requiredEnv("PUNK_ID"));
  if (!Number.isInteger(punkId) || punkId < 0 || punkId > 9999) {
    throw new Error("PUNK_ID must be an integer from 0 to 9999");
  }
  return punkId;
}

async function getDirectedV1Listing(v1Market, punkId, maxPriceWei, budgetWei) {
  const offer = await v1Market.punksOfferedForSale(punkId);
  if (!offer.isForSale) throw new Error(`V1 Punk ${punkId} is not listed for sale`);
  if (offer.punkIndexOut !== BigInt(punkId)) throw new Error(`V1 Punk ${punkId} offer returned mismatched id`);
  if (offer.minValue === 0n) throw new Error(`V1 Punk ${punkId} has a zero-price offer`);
  if (offer.onlySellTo.toLowerCase() !== PUNKSMARKET.toLowerCase()) {
    throw new Error(`V1 Punk ${punkId} is directed to ${offer.onlySellTo}, not PunksMarket`);
  }
  if (offer.minValue > maxPriceWei) {
    throw new Error(`V1 Punk ${punkId} costs ${hre.ethers.formatEther(offer.minValue)} ETH, above MAX_PRICE_ETH`);
  }
  if (offer.minValue > budgetWei) {
    throw new Error(`V1 Punk ${punkId} costs ${hre.ethers.formatEther(offer.minValue)} ETH, above campaign budget`);
  }

  const owner = await v1Market.punkIndexToAddress(punkId);
  if (owner.toLowerCase() !== offer.seller.toLowerCase()) {
    throw new Error(`V1 Punk ${punkId} seller does not match owner`);
  }

  return { punkId, priceWei: offer.minValue, seller: offer.seller };
}

async function deployCampaign(budgetWei) {
  const Factory = await hre.ethers.getContractFactory("FundV1PunkFactory");
  const factory = await Factory.deploy(await feeOverrides());
  await factory.waitForDeployment();

  const now = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);
  const fundingDeadline = now + 24n * 60n * 60n;
  const executionDeadline = fundingDeadline + 24n * 60n * 60n;

  const tx = await factory.createCampaign(
    budgetWei,
    fundingDeadline,
    executionDeadline,
    await feeOverrides()
  );
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "CampaignCreated");

  if (!event) throw new Error("CampaignCreated event not found");

  const campaign = await hre.ethers.getContractAt("FundV1PunkCampaign", event.args.campaign);
  return { factory, campaign };
}

async function feeOverrides() {
  const block = await hre.ethers.provider.getBlock("latest");
  const priority = hre.ethers.parseUnits("1", "gwei");
  const base = block.baseFeePerGas || priority;

  return {
    maxPriorityFeePerGas: priority,
    maxFeePerGas: base * 4n + priority,
  };
}

async function main() {
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    throw new Error("Run this only against a local fork, e.g. --network localhost");
  }

  const punkId = parsePunkId();
  const maxPriceWei = hre.ethers.parseEther(process.env.MAX_PRICE_ETH || "30");
  const budgetWei = hre.ethers.parseEther(process.env.PURCHASE_BUDGET_ETH || process.env.MAX_PRICE_ETH || "30");

  const [deployer, contributor, executor] = await hre.ethers.getSigners();
  const v1Market = new hre.ethers.Contract(CRYPTOPUNKS_V1_MARKET, v1PunksAbi, hre.ethers.provider);
  const listed = await getDirectedV1Listing(v1Market, punkId, maxPriceWei, budgetWei);

  const { factory, campaign } = await deployCampaign(budgetWei);
  const campaignAddress = await campaign.getAddress();
  const creator = await campaign.creator();

  console.log("Factory:", await factory.getAddress());
  console.log("Campaign:", campaignAddress);
  console.log("Deployer:", deployer.address);
  console.log("Creator:", creator);
  console.log("Contributor:", contributor.address);
  console.log("Executor:", executor.address);
  console.log("V1 Punk:", listed.punkId);
  console.log("Seller:", listed.seller);
  console.log("Directed market:", PUNKSMARKET);
  console.log("Price:", hre.ethers.formatEther(listed.priceWei), "ETH");
  console.log("Budget:", hre.ethers.formatEther(budgetWei), "ETH");

  const guildBefore = await hre.ethers.provider.getBalance(PROTOCOL_GUILD);
  await (await campaign.connect(contributor).contribute({
    value: budgetWei,
    ...(await feeOverrides()),
  })).wait();
  await (await campaign.connect(executor).attemptBuy(
    listed.punkId,
    maxPriceWei,
    await feeOverrides()
  )).wait();
  const guildAfter = await hre.ethers.provider.getBalance(PROTOCOL_GUILD);

  const ownerAfter = await v1Market.punkIndexToAddress(listed.punkId);
  const bought = await campaign.bought();
  const campaignBalance = await hre.ethers.provider.getBalance(campaignAddress);
  const leftover = budgetWei - listed.priceWei;

  console.log("Bought:", bought);
  console.log("Owner after:", ownerAfter);
  console.log("Campaign balance:", hre.ethers.formatEther(campaignBalance), "ETH");
  console.log("Protocol Guild received:", hre.ethers.formatEther(guildAfter - guildBefore), "ETH");

  if (!bought) throw new Error("Campaign did not mark bought");
  if (ownerAfter.toLowerCase() !== creator.toLowerCase()) throw new Error("Creator does not own bought V1 Punk");
  if (campaignBalance !== 0n) throw new Error("Campaign balance should be zero after successful buy");
  if (guildAfter - guildBefore !== leftover) throw new Error("Protocol Guild did not receive exact leftover");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
