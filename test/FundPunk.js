const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");

describe("FundPunk V1B", function () {
  const CRYPTOPUNKS_MARKET = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB";
  const PROTOCOL_GUILD = "0x25941dC771bB64514Fc8abBce970307Fb9d477e9";

  async function deployFixture() {
    const [owner, a, b, donation] = await ethers.getSigners();

    const marketArtifact = await artifacts.readArtifact("MockPunksMarket");
    await ethers.provider.send("hardhat_setCode", [CRYPTOPUNKS_MARKET, marketArtifact.deployedBytecode]);
    const market = await ethers.getContractAt("MockPunksMarket", CRYPTOPUNKS_MARKET);
    await market.setWrongOwnerAfterBuy(ethers.ZeroAddress);

    const Factory = await ethers.getContractFactory("FundPunkFactory");
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

    const Campaign = await ethers.getContractFactory("FundPunkCampaign");
    const campaign = Campaign.attach(campaignAddr);

    return { owner, a, b, donation, market, factory, campaign };
  }

  it("accepts contributions and tracks totals", async function () {
    const { a, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.4") });
    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.contributions(a.address)).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.refundableContributionsWei()).to.equal(ethers.parseEther("0.4"));
  });

  it("records plain ETH transfers during funding as contributions", async function () {
    const { a, campaign } = await deployFixture();
    await a.sendTransaction({ to: campaign.target, value: ethers.parseEther("0.4") });

    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.contributions(a.address)).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.refundableContributionsWei()).to.equal(ethers.parseEther("0.4"));
  });

  it("rejects plain ETH transfers once funding is closed", async function () {
    const { a, b, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("1.1") });

    await expect(
      b.sendTransaction({ to: campaign.target, value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("not funding");
  });

  it("accepts the remaining budget and refunds contribution excess", async function () {
    const { a, b, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });

    const balBefore = await ethers.provider.getBalance(b.address);
    const tx = await campaign.connect(b).contribute({ value: ethers.parseEther("0.5") });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(b.address);

    expect(balAfter + gas).to.equal(balBefore - ethers.parseEther("0.4"));
    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("1.1"));
    expect(await campaign.contributions(b.address)).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.refundableContributionsWei()).to.equal(ethers.parseEther("1.1"));
    expect(await ethers.provider.getBalance(campaign.target)).to.equal(ethers.parseEther("1.1"));
  });

  it("accepts the remaining budget and refunds direct ETH transfer excess", async function () {
    const { a, b, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });

    const balBefore = await ethers.provider.getBalance(b.address);
    const tx = await b.sendTransaction({ to: campaign.target, value: ethers.parseEther("0.5") });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(b.address);

    expect(balAfter + gas).to.equal(balBefore - ethers.parseEther("0.4"));
    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("1.1"));
    expect(await campaign.contributions(b.address)).to.equal(ethers.parseEther("0.4"));
    expect(await campaign.refundableContributionsWei()).to.equal(ethers.parseEther("1.1"));
    expect(await ethers.provider.getBalance(campaign.target)).to.equal(ethers.parseEther("1.1"));
  });

  it("opens buying after the budget is reached", async function () {
    const { a, b, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.4") });
    await campaign.connect(b).contribute({ value: ethers.parseEther("0.7") });
    expect(await campaign.getState()).to.equal(1n);
  });

  it("can buy any punk below budget before full budget is raised", async function () {
    const { owner, a, b, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1"));

    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });
    await campaign.connect(b).contribute({ value: ethers.parseEther("0.3") }); // total 1.0, budget 1.1

    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1.1"));

    expect(await campaign.bought()).to.equal(true);
    expect(await campaign.boughtPunkId()).to.equal(777n);
    expect(await campaign.boughtPriceWei()).to.equal(ethers.parseEther("1"));
    expect(await market.punkIndexToAddress(777)).to.equal(owner.address);
    expect(await campaign.donationRecipient()).to.equal(PROTOCOL_GUILD);
  });

  it("donates leftover when raised funds exceed exact listing price", async function () {
    const { a, b, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1"));

    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });
    await campaign.connect(b).contribute({ value: ethers.parseEther("0.4") });

    const balBefore = await ethers.provider.getBalance(PROTOCOL_GUILD);
    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1.1"));
    const balAfter = await ethers.provider.getBalance(PROTOCOL_GUILD);

    expect(await campaign.bought()).to.equal(true);
    expect(await campaign.boughtPriceWei()).to.equal(ethers.parseEther("1"));
    expect(balAfter).to.equal(balBefore + ethers.parseEther("0.1"));
  });

  it("campaign creation cannot redirect core protocol addresses", async function () {
    const { factory, market, donation } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    const tx = await factory.createCampaign(
      ethers.parseEther("1.1"),
      now + 3600,
      now + 7200
    );
    const rc = await tx.wait();
    const event = rc.logs.find((l) => l.fragment && l.fragment.name === "CampaignCreated");
    const campaignAddr = event.args.campaign;

    expect(event.args.donationRecipient).to.equal(PROTOCOL_GUILD);
    expect(event.args.cryptopunksMarket).to.equal(CRYPTOPUNKS_MARKET);
    expect(event.args.donationRecipient).to.not.equal(donation.address);

    const Campaign = await ethers.getContractFactory("FundPunkCampaign");
    const campaign = Campaign.attach(campaignAddr);
    expect(await campaign.donationRecipient()).to.equal(PROTOCOL_GUILD);
    expect(await campaign.cryptopunksMarket()).to.equal(CRYPTOPUNKS_MARKET);
    expect(await campaign.cryptopunksMarket()).to.equal(market.target);
  });

  it("paginates created campaigns for long-lived factory reads", async function () {
    const { factory } = await deployFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    const second = await factory.createCampaign(ethers.parseEther("2"), now + 3600, now + 7200);
    const third = await factory.createCampaign(ethers.parseEther("3"), now + 3600, now + 7200);
    const secondEvent = (await second.wait()).logs.find((l) => l.fragment && l.fragment.name === "CampaignCreated");
    const thirdEvent = (await third.wait()).logs.find((l) => l.fragment && l.fragment.name === "CampaignCreated");

    expect(await factory.campaignsCount()).to.equal(3n);
    expect(await factory.campaignsRange(1, 10)).to.deep.equal([
      secondEvent.args.campaign,
      thirdEvent.args.campaign,
    ]);
    expect(await factory.campaignsRange(99, 10)).to.deep.equal([]);
  });

  it("does not buy a punk above the caller or campaign cap", async function () {
    const { a, b, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1.2"));

    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });
    await campaign.connect(b).contribute({ value: ethers.parseEther("0.4") });

    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1.1"));

    expect(await campaign.bought()).to.equal(false);
    expect(await campaign.getState()).to.equal(1n);
    expect(await market.punkIndexToAddress(777)).to.equal(market.target);
  });

  it("does not use forced ETH as part of the purchase pool", async function () {
    const { a, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1"));
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });

    const balance = await ethers.provider.getBalance(campaign.target);
    await ethers.provider.send("hardhat_setBalance", [
      campaign.target,
      `0x${(balance + ethers.parseEther("0.3")).toString(16)}`,
    ]);

    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1"));

    expect(await campaign.bought()).to.equal(false);
    expect(await market.punkIndexToAddress(777)).to.equal(market.target);
    expect(await campaign.surplusBalanceWei()).to.equal(ethers.parseEther("0.3"));
  });

  it("reverts if the market buy returns without the campaign owning the punk", async function () {
    const { a, b, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1"));
    await market.setWrongOwnerAfterBuy(b.address);
    await campaign.connect(a).contribute({ value: ethers.parseEther("1") });

    await expect(campaign.connect(a).attemptBuy(777, ethers.parseEther("1"))).to.be.revertedWith(
      "buy ownership failed"
    );

    expect(await campaign.bought()).to.equal(false);
    expect(await market.punkIndexToAddress(777)).to.equal(market.target);
  });

  it("does not buy a punk reserved for another buyer", async function () {
    const { a, b, campaign, market } = await deployFixture();
    await market.setPunkForSaleTo(777, ethers.parseEther("1"), b.address);

    await campaign.connect(a).contribute({ value: ethers.parseEther("0.7") });
    await campaign.connect(b).contribute({ value: ethers.parseEther("0.4") });

    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1.1"));

    expect(await campaign.bought()).to.equal(false);
    expect(await campaign.getState()).to.equal(1n);
    expect(await market.punkIndexToAddress(777)).to.equal(market.target);
  });

  it("does not refund at funding deadline because floor can still drop before execution deadline", async function () {
    const { a, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.2") });

    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine", []);

    expect(await campaign.getState()).to.equal(1n);
    await expect(campaign.connect(a).claimRefund()).to.be.revertedWith("not refunding");
  });

  it("lets the creator cancel early and enable immediate refunds", async function () {
    const { owner, a, b, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("0.2"));
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.2") });

    await expect(campaign.connect(b).cancelAndEnableRefunds()).to.be.revertedWith("not creator");

    await campaign.connect(owner).cancelAndEnableRefunds();
    expect(await campaign.getState()).to.equal(3n);

    await expect(
      campaign.connect(b).contribute({ value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("not funding");
    await expect(
      b.sendTransaction({ to: campaign.target, value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("not funding");
    await expect(campaign.connect(b).attemptBuy(777, ethers.parseEther("0.2"))).to.be.revertedWith(
      "refunding"
    );

    const balBefore = await ethers.provider.getBalance(a.address);
    const tx = await campaign.connect(a).claimRefund();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(a.address);

    expect(balAfter + gas).to.equal(balBefore + ethers.parseEther("0.2"));
    expect(await campaign.refundableContributionsWei()).to.equal(0n);
  });

  it("does not let the creator cancel after a successful purchase", async function () {
    const { owner, a, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("0.2"));
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.2") });

    await campaign.connect(a).attemptBuy(777, ethers.parseEther("0.2"));

    await expect(campaign.connect(owner).cancelAndEnableRefunds()).to.be.revertedWith("already bought");
  });

  it("enables refunds after execution deadline if no purchase happened", async function () {
    const { a, campaign } = await deployFixture();
    await campaign.connect(a).contribute({ value: ethers.parseEther("0.2") });

    await ethers.provider.send("evm_increaseTime", [8000]);
    await ethers.provider.send("evm_mine", []);

    await campaign.enableRefundsIfExpired();
    const balBefore = await ethers.provider.getBalance(a.address);
    const tx = await campaign.connect(a).claimRefund();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(a.address);
    expect(balAfter + gas).to.be.greaterThan(balBefore);
    expect(await campaign.refundableContributionsWei()).to.equal(0n);
  });

  it("donates untracked surplus during refunding without reducing refunds", async function () {
    const { a, campaign } = await deployFixture();
    const contribution = ethers.parseEther("0.2");
    const surplus = ethers.parseEther("0.3");

    await campaign.connect(a).contribute({ value: contribution });

    const balance = await ethers.provider.getBalance(campaign.target);
    await ethers.provider.send("hardhat_setBalance", [
      campaign.target,
      `0x${(balance + surplus).toString(16)}`,
    ]);

    expect(await campaign.surplusBalanceWei()).to.equal(surplus);

    await ethers.provider.send("evm_increaseTime", [8000]);
    await ethers.provider.send("evm_mine", []);

    const guildBefore = await ethers.provider.getBalance(PROTOCOL_GUILD);
    await campaign.donateSurplus();
    const guildAfter = await ethers.provider.getBalance(PROTOCOL_GUILD);

    expect(guildAfter).to.equal(guildBefore + surplus);
    expect(await campaign.refundableContributionsWei()).to.equal(contribution);

    await campaign.connect(a).claimRefund();
    expect(await campaign.refundableContributionsWei()).to.equal(0n);
  });

  it("donates forced surplus that arrives after a successful purchase", async function () {
    const { a, campaign, market } = await deployFixture();
    await market.setPunkForSale(777, ethers.parseEther("1"));
    await campaign.connect(a).contribute({ value: ethers.parseEther("1") });
    await campaign.connect(a).attemptBuy(777, ethers.parseEther("1"));

    await ethers.provider.send("hardhat_setBalance", [
      campaign.target,
      `0x${ethers.parseEther("0.3").toString(16)}`,
    ]);

    const guildBefore = await ethers.provider.getBalance(PROTOCOL_GUILD);
    await campaign.donateSurplus();
    const guildAfter = await ethers.provider.getBalance(PROTOCOL_GUILD);

    expect(guildAfter).to.equal(guildBefore + ethers.parseEther("0.3"));
    expect(await ethers.provider.getBalance(campaign.target)).to.equal(0n);
  });
});
