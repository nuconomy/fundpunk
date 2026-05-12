// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICryptoPunksMarket {
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
    function buyPunk(uint256 punkIndex) external payable;
    function transferPunk(address to, uint256 punkIndex) external;
}

contract FundPunkCampaign is ReentrancyGuard {
    enum State { Funding, BuyingOpen, Bought, Refunding }

    address public immutable creator;
    address public constant cryptopunksMarket = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
    address public constant PROTOCOL_GUILD = 0x25941dC771bB64514Fc8abBce970307Fb9d477e9;
    uint256 public constant MAX_CAMPAIGN_DURATION = 365 days;
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
            (bool ok, ) = payable(contributor).call{value: excess}("");
            require(ok, "excess refund failed");
            emit ExcessContributionRefunded(contributor, excess);
        }
    }

    function attemptBuy(uint256 punkId, uint256 maxPriceWei) external nonReentrant {
        require(!bought, "already bought");
        require(!refundsEnabled, "refunding");
        require(block.timestamp <= executionDeadline, "exec expired");
        require(maxPriceWei > 0, "max=0");

        (bool success, uint256 priceWei) = _attemptPunkBuy(punkId, maxPriceWei);
        emit BuyAttempt(msg.sender, punkId, maxPriceWei, success);

        if (success) {
            bought = true;
            boughtPriceWei = priceWei;
            boughtPunkId = punkId;
            refundableContributionsWei = 0;

            ICryptoPunksMarket market = ICryptoPunksMarket(cryptopunksMarket);
            _transferBoughtPunkToCreator(market, punkId);
            emit Bought(punkId, priceWei, msg.sender, creator);

            uint256 leftover = address(this).balance;
            if (leftover > 0) {
                (bool ok, ) = payable(PROTOCOL_GUILD).call{value: leftover}("");
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
        ICryptoPunksMarket market = ICryptoPunksMarket(cryptopunksMarket);
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

        if (priceWei == 0) return (false, 0);
        if (
            priceWei > maxPriceWei ||
            priceWei > purchaseBudgetWei ||
            priceWei > refundableContributionsWei ||
            priceWei > address(this).balance
        ) {
            return (false, priceWei);
        }
        if (onlySellTo != address(0) && onlySellTo != address(this)) return (false, priceWei);

        try market.punkIndexToAddress(punkId) returns (address currentOwner) {
            if (currentOwner == address(0) || currentOwner != seller || currentOwner == address(this)) {
                return (false, priceWei);
            }
        } catch {
            return (false, priceWei);
        }

        try market.buyPunk{value: priceWei}(punkId) {
            // After value leaves this contract, unexpected ownership results must revert atomically.
            require(market.punkIndexToAddress(punkId) == address(this), "buy ownership failed");
            return (true, priceWei);
        } catch {
            return (false, priceWei);
        }
    }

    function transferBoughtPunkToCreator() external nonReentrant {
        require(bought, "not bought");
        ICryptoPunksMarket market = ICryptoPunksMarket(cryptopunksMarket);
        _transferBoughtPunkToCreator(market, boughtPunkId);
    }

    function _transferBoughtPunkToCreator(ICryptoPunksMarket market, uint256 punkId) internal {
        require(market.punkIndexToAddress(punkId) == address(this), "campaign not owner");

        market.transferPunk(creator, punkId);
        require(market.punkIndexToAddress(punkId) == creator, "creator not owner");
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
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund failed");

        emit RefundClaimed(msg.sender, amount);
    }

    function donateSurplus() external nonReentrant {
        uint256 surplus = surplusBalanceWei();
        require(surplus > 0, "no surplus");

        (bool ok, ) = payable(PROTOCOL_GUILD).call{value: surplus}("");
        require(ok, "surplus donate failed");

        emit SurplusDonated(surplus, PROTOCOL_GUILD);
    }

    receive() external payable nonReentrant {
        _recordContribution(msg.sender, msg.value);
    }
}
