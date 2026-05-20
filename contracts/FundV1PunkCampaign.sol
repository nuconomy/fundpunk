// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICryptoPunksV1Market {
    function punkIndexToAddress(uint256 punkIndex) external view returns (address);
    function punksOfferedForSale(uint256 punkIndex)
        external
        view
        returns (
            bool isForSale,
            uint256 punkIndexOut,
            address seller,
            uint256 minValue,
            address onlySellTo
        );
}

interface IPunksMarketDirectedBuyer {
    function buyPunk(uint16 punkId, uint96 expectedListingWei, address recipient) external payable;
}

contract FundV1PunkCampaign is ReentrancyGuard {
    enum State { Funding, BuyingOpen, Bought, Refunding }

    address public immutable creator;
    address public constant cryptopunksMarket = 0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D;
    address public constant directedPunksMarket = 0x64e507FEBF26521b73FbdfA533106B2042533218;
    address public constant PROTOCOL_GUILD = 0x25941dC771bB64514Fc8abBce970307Fb9d477e9;
    uint256 public constant MAX_CAMPAIGN_DURATION = 365 days;
    uint256 public constant PUNK_COUNT = 10_000;
    uint8 public constant REFUND_REASON_CREATOR_CANCELLED = 1;
    uint8 public constant REFUND_REASON_EXPIRED = 2;

    uint256 public immutable purchaseBudgetWei;
    uint64 public immutable fundingDeadline;
    uint64 public immutable executionDeadline;

    mapping(address => uint256) public contributions;
    uint256 public totalRaised;
    // Source of truth for purchase/refund funds. Raw ETH balance may include forced, unattributed surplus.
    uint256 public refundableContributionsWei;

    bool public bought;
    bool public refundsEnabled;
    uint256 public boughtPriceWei;
    uint256 public boughtPunkId;

    event Contributed(address indexed contributor, uint256 amount, uint256 totalRaised);
    event BuyAttempt(address indexed caller, uint256 indexed punkId, uint256 maxPriceWei, bool success);
    event Bought(uint256 indexed punkId, uint256 priceWei, address indexed executor, address recipient);
    event LeftoverDonated(uint256 amount, address indexed recipient);
    event SurplusDonated(uint256 amount, address indexed recipient);
    event ExcessContributionRefunded(address indexed contributor, uint256 amount);
    event RefundsEnabled(uint8 reasonCode);
    event RefundClaimed(address indexed contributor, uint256 amount);

    constructor(
        uint256 _purchaseBudgetWei,
        uint64 _fundingDeadline,
        uint64 _executionDeadline,
        address _creator
    ) {
        require(_purchaseBudgetWei > 0, "budget=0");
        require(_fundingDeadline > block.timestamp, "funding deadline");
        require(_executionDeadline > _fundingDeadline, "exec <= funding");
        require(_executionDeadline <= block.timestamp + MAX_CAMPAIGN_DURATION, "duration > max");
        require(_creator != address(0), "creator=0");

        creator = _creator;

        purchaseBudgetWei = _purchaseBudgetWei;
        fundingDeadline = _fundingDeadline;
        executionDeadline = _executionDeadline;
    }

    function getState() public view returns (State) {
        if (bought) return State.Bought;
        if (refundsEnabled) return State.Refunding;
        if (block.timestamp > executionDeadline) return State.Refunding;
        if (totalRaised >= purchaseBudgetWei || block.timestamp > fundingDeadline) return State.BuyingOpen;
        return State.Funding;
    }

    function contribute() external payable nonReentrant {
        _recordContribution(msg.sender, msg.value);
    }

    function _recordContribution(address contributor, uint256 amount) internal {
        require(getState() == State.Funding, "not funding");
        require(block.timestamp <= fundingDeadline, "deadline passed");
        require(amount > 0, "value=0");

        uint256 remaining = purchaseBudgetWei - totalRaised;
        uint256 accepted = amount > remaining ? remaining : amount;
        uint256 excess = amount - accepted;

        contributions[contributor] += accepted;
        totalRaised += accepted;
        refundableContributionsWei += accepted;

        emit Contributed(contributor, accepted, totalRaised);

        if (excess > 0) {
            (bool ok,) = payable(contributor).call{value: excess}("");
            require(ok, "excess refund failed");
            emit ExcessContributionRefunded(contributor, excess);
        }
    }

    function attemptBuy(uint256 punkId, uint256 maxPriceWei) external nonReentrant {
        require(!bought, "already bought");
        require(!refundsEnabled, "refunding");
        require(block.timestamp <= executionDeadline, "exec expired");
        require(maxPriceWei > 0, "max=0");
        require(punkId < PUNK_COUNT, "invalid punk");

        (bool success, uint256 priceWei) = _attemptPunkBuy(punkId, maxPriceWei);
        emit BuyAttempt(msg.sender, punkId, maxPriceWei, success);

        if (success) {
            bought = true;
            boughtPriceWei = priceWei;
            boughtPunkId = punkId;
            refundableContributionsWei = 0;

            emit Bought(punkId, priceWei, msg.sender, creator);

            uint256 leftover = address(this).balance;
            if (leftover > 0) {
                (bool ok,) = payable(PROTOCOL_GUILD).call{value: leftover}("");
                require(ok, "leftover donate failed");
                emit LeftoverDonated(leftover, PROTOCOL_GUILD);
            }
        }
    }

    function donationRecipient() external pure returns (address) {
        return PROTOCOL_GUILD;
    }

    function surplusBalanceWei() public view returns (uint256) {
        uint256 balance = address(this).balance;
        if (balance <= refundableContributionsWei) return 0;
        return balance - refundableContributionsWei;
    }

    function _attemptPunkBuy(uint256 punkId, uint256 maxPriceWei) internal returns (bool, uint256) {
        ICryptoPunksV1Market market = ICryptoPunksV1Market(cryptopunksMarket);
        uint256 priceWei;
        address seller;
        address onlySellTo;

        try market.punksOfferedForSale(punkId) returns (
            bool isForSale,
            uint256 punkIndexOut,
            address offerSeller,
            uint256 minValue,
            address offerOnlySellTo
        ) {
            if (!isForSale || punkIndexOut != punkId) return (false, 0);
            priceWei = minValue;
            seller = offerSeller;
            onlySellTo = offerOnlySellTo;
        } catch {
            return (false, 0);
        }

        if (priceWei == 0 || priceWei > type(uint96).max) return (false, priceWei);
        if (
            priceWei > maxPriceWei ||
            priceWei > purchaseBudgetWei ||
            priceWei > refundableContributionsWei ||
            priceWei > address(this).balance
        ) {
            return (false, priceWei);
        }
        if (onlySellTo != directedPunksMarket) return (false, priceWei);
        if (seller == address(0) || seller == creator) return (false, priceWei);

        try market.punkIndexToAddress(punkId) returns (address currentOwner) {
            if (currentOwner == address(0) || currentOwner != seller || currentOwner == address(this)) {
                return (false, priceWei);
            }
        } catch {
            return (false, priceWei);
        }

        IPunksMarketDirectedBuyer directedMarket = IPunksMarketDirectedBuyer(directedPunksMarket);
        try directedMarket.buyPunk{value: priceWei}(uint16(punkId), uint96(priceWei), creator) {
            // After value leaves this contract, unexpected ownership results must revert atomically.
            require(market.punkIndexToAddress(punkId) == creator, "creator not owner");
            return (true, priceWei);
        } catch {
            return (false, priceWei);
        }
    }

    function enableRefundsIfExpired() external {
        State st = getState();
        if (st == State.Refunding && !refundsEnabled) {
            refundsEnabled = true;
            emit RefundsEnabled(REFUND_REASON_EXPIRED);
        }
        require(refundsEnabled || st == State.Refunding, "not refundable");
    }

    function cancelAndEnableRefunds() external nonReentrant {
        require(msg.sender == creator, "not creator");
        require(!bought, "already bought");
        require(!refundsEnabled, "already refunding");

        refundsEnabled = true;
        emit RefundsEnabled(REFUND_REASON_CREATOR_CANCELLED);
    }

    function claimRefund() external nonReentrant {
        if (!refundsEnabled) {
            State st = getState();
            require(st == State.Refunding, "not refunding");
            refundsEnabled = true;
            emit RefundsEnabled(REFUND_REASON_EXPIRED);
        }

        uint256 amount = contributions[msg.sender];
        require(amount > 0, "no contribution");

        contributions[msg.sender] = 0;
        refundableContributionsWei -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund failed");

        emit RefundClaimed(msg.sender, amount);
    }

    function donateSurplus() external nonReentrant {
        uint256 surplus = surplusBalanceWei();
        require(surplus > 0, "no surplus");

        (bool ok,) = payable(PROTOCOL_GUILD).call{value: surplus}("");
        require(ok, "surplus donate failed");

        emit SurplusDonated(surplus, PROTOCOL_GUILD);
    }

    receive() external payable nonReentrant {
        _recordContribution(msg.sender, msg.value);
    }
}
