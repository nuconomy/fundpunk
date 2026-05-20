const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");

describe("FundV1Punk directed listings", function () {
  const CRYPTOPUNKS_V1_MARKET = "0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D";
  const PUNKSMARKET = "0x64e507FEBF26521b73FbdfA533106B2042533218";
  const PROTOCOL_GUILD = "0x25941dC771bB64514Fc8abBce970307Fb9d477e9";

  async function deployFixture() {
    await ethers.provider.send("hardhat_reset", []);

    const [creator, contributor, executor, seller, other] = await ethers.getSigners();

    const v1Artifact = await artifacts.readArtifact("MockCryptoPunksMarketV1Buggy");
    await ethers.provider.send("hardhat_setCode", [
      CRYPTOPUNKS_V1_MARKET,
      v1Artifact.deployedBytecode,
    ]);
    const v1Market = await ethers.getContractAt(
      "MockCryptoPunksMarketV1Buggy",
      CRYPTOPUNKS_V1_MARKET
    );

    const adapterArtifact = await artifacts.readArtifact("MockV1PunksMarketDirectedBuyer");
    await ethers.provider.send("hardhat_setCode", [
      PUNKSMARKET,
      adapterArtifact.deployedBytecode,
    ]);
    const punksMarket = await ethers.getContractAt("MockV1PunksMarketDirectedBuyer", PUNKSMARKET);
    await punksMarket.setWrongRecipient(ethers.ZeroAddress);

    const Factory = await ethers.getContractFactory("FundV1PunkFactory");
    const factory = await Factory.deploy();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const fundingDeadline = now + 3600;
    const executionDeadline = now + 7200;

    const tx = await factory.createCampaign(
      ethers.parseEther("1.1"),
      fundingDeadline,
      executionDeadline
    );

    const rc = await tx.wait();
    const event = rc.logs.find((l) => l.fragment && l.fragment.name === "CampaignCreated");
    const campaignAddr = event.args.campaign;

    const Campaign = await ethers.getContractFactory("FundV1PunkCampaign");
    const campaign = Campaign.attach(campaignAddr);

    return {
      creator,
      contributor,
      executor,
      seller,
      other,
      v1Market,
      punksMarket,
      factory,
      campaign,
    };
  }

  async function offerDirected(v1Market, seller, punkId, priceWei) {
    await v1Market.setInitialOwner(seller.address, punkId);
    await v1Market.connect(seller).offerPunkForSaleToAddress(punkId, priceWei, PUNKSMARKET);
  }

  it("creates campaigns with the V1 market and directed adapter fixed", async function () {
    const { campaign, factory } = await deployFixture();

    expect(await campaign.cryptopunksMarket()).to.equal(CRYPTOPUNKS_V1_MARKET);
    expect(await campaign.directedPunksMarket()).to.equal(PUNKSMARKET);
    expect(await campaign.donationRecipient()).to.equal(PROTOCOL_GUILD);
    expect(await factory.campaignsCount()).to.equal(1n);
  });

  it("buys a directed V1 listing through PunksMarket and sends the Punk to the creator", async function () {
    const { creator, contributor, executor, seller, campaign, v1Market } = await deployFixture();
    const punkId = 1234;
    const price = ethers.parseEther("1");

    await offerDirected(v1Market, seller, punkId, price);
    await campaign.connect(contributor).contribute({ value: ethers.parseEther("1.1") });

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    const guildBefore = await ethers.provider.getBalance(PROTOCOL_GUILD);

    await campaign.connect(executor).attemptBuy(punkId, ethers.parseEther("1.1"));

    expect(await campaign.bought()).to.equal(true);
    expect(await campaign.boughtPunkId()).to.equal(BigInt(punkId));
    expect(await campaign.boughtPriceWei()).to.equal(price);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(creator.address);
    expect(await ethers.provider.getBalance(campaign.target)).to.equal(0n);
    expect(await ethers.provider.getBalance(seller.address)).to.equal(sellerBefore + price);
    expect(await ethers.provider.getBalance(PROTOCOL_GUILD)).to.equal(guildBefore + ethers.parseEther("0.1"));
  });

  it("does not buy a public V1 listing", async function () {
    const { contributor, executor, seller, campaign, v1Market } = await deployFixture();
    const punkId = 2345;
    const price = ethers.parseEther("1");

    await v1Market.setInitialOwner(seller.address, punkId);
    await v1Market.connect(seller).offerPunkForSale(punkId, price);
    await campaign.connect(contributor).contribute({ value: price });

    await campaign.connect(executor).attemptBuy(punkId, price);

    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(seller.address);
    expect(await ethers.provider.getBalance(campaign.target)).to.equal(price);
  });

  it("does not buy a V1 listing directed anywhere other than PunksMarket", async function () {
    const { contributor, executor, seller, campaign, v1Market } = await deployFixture();
    const punkId = 3456;
    const price = ethers.parseEther("1");

    await v1Market.setInitialOwner(seller.address, punkId);
    await v1Market.connect(seller).offerPunkForSaleToAddress(punkId, price, campaign.target);
    await campaign.connect(contributor).contribute({ value: price });

    await campaign.connect(executor).attemptBuy(punkId, price);

    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(seller.address);
  });

  it("does not buy above the caller cap, campaign budget, or tracked funds", async function () {
    const { contributor, executor, seller, campaign, v1Market } = await deployFixture();
    const punkId = 4567;
    const price = ethers.parseEther("1");

    await offerDirected(v1Market, seller, punkId, price);
    await campaign.connect(contributor).contribute({ value: ethers.parseEther("0.7") });

    await campaign.connect(executor).attemptBuy(punkId, price);
    expect(await campaign.bought()).to.equal(false);

    await campaign.connect(contributor).contribute({ value: ethers.parseEther("0.4") });
    await campaign.connect(executor).attemptBuy(punkId, ethers.parseEther("0.9"));
    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(seller.address);

    const expensivePunkId = 4568;
    await offerDirected(v1Market, seller, expensivePunkId, ethers.parseEther("1.2"));
    await campaign.connect(executor).attemptBuy(expensivePunkId, ethers.parseEther("1.3"));
    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(expensivePunkId)).to.equal(seller.address);
  });

  it("does not let the creator sell their own V1 Punk to the campaign", async function () {
    const { creator, contributor, executor, campaign, v1Market } = await deployFixture();
    const punkId = 5678;
    const price = ethers.parseEther("1");

    await v1Market.setInitialOwner(creator.address, punkId);
    await v1Market.connect(creator).offerPunkForSaleToAddress(punkId, price, PUNKSMARKET);
    await campaign.connect(contributor).contribute({ value: price });

    await campaign.connect(executor).attemptBuy(punkId, price);

    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(creator.address);
  });

  it("reverts atomically if the adapter returns without creator ownership", async function () {
    const { contributor, executor, seller, other, campaign, v1Market, punksMarket } =
      await deployFixture();
    const punkId = 6789;
    const price = ethers.parseEther("1");

    await offerDirected(v1Market, seller, punkId, price);
    await punksMarket.setWrongRecipient(other.address);
    await campaign.connect(contributor).contribute({ value: price });

    await expect(campaign.connect(executor).attemptBuy(punkId, price)).to.be.revertedWith(
      "creator not owner"
    );

    expect(await campaign.bought()).to.equal(false);
    expect(await v1Market.punkIndexToAddress(punkId)).to.equal(seller.address);
  });

  it("lets contributors claim refunds after execution expiry if no V1 purchase succeeds", async function () {
    const { contributor, campaign } = await deployFixture();
    const contribution = ethers.parseEther("0.2");

    await campaign.connect(contributor).contribute({ value: contribution });

    await ethers.provider.send("evm_increaseTime", [8000]);
    await ethers.provider.send("evm_mine", []);

    await campaign.enableRefundsIfExpired();
    const before = await ethers.provider.getBalance(contributor.address);
    const tx = await campaign.connect(contributor).claimRefund();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const after = await ethers.provider.getBalance(contributor.address);

    expect(after + gas).to.equal(before + contribution);
    expect(await campaign.refundableContributionsWei()).to.equal(0n);
  });
});
