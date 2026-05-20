// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FundV1PunkCampaign} from "./FundV1PunkCampaign.sol";

contract FundV1PunkFactory {
    uint256 public constant MAX_CAMPAIGN_DURATION = 365 days;

    address[] public campaigns;

    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        uint256 purchaseBudgetWei,
        uint64 fundingDeadline,
        uint64 executionDeadline,
        address cryptopunksMarket,
        address directedPunksMarket,
        address donationRecipient
    );

    function createCampaign(
        uint256 purchaseBudgetWei,
        uint64 fundingDeadline,
        uint64 executionDeadline
    ) external returns (address campaign) {
        require(executionDeadline <= block.timestamp + MAX_CAMPAIGN_DURATION, "duration > max");

        FundV1PunkCampaign c = new FundV1PunkCampaign(
            purchaseBudgetWei,
            fundingDeadline,
            executionDeadline,
            msg.sender
        );

        campaign = address(c);
        campaigns.push(campaign);

        emit CampaignCreated(
            campaign,
            msg.sender,
            purchaseBudgetWei,
            fundingDeadline,
            executionDeadline,
            c.cryptopunksMarket(),
            c.directedPunksMarket(),
            c.PROTOCOL_GUILD()
        );
    }

    function allCampaigns() external view returns (address[] memory) {
        return campaigns;
    }

    function campaignsRange(uint256 start, uint256 count) external view returns (address[] memory result) {
        if (start >= campaigns.length) return new address[](0);

        uint256 remaining = campaigns.length - start;
        uint256 size = count > remaining ? remaining : count;

        result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = campaigns[start + i];
        }
    }

    function campaignsCount() external view returns (uint256) {
        return campaigns.length;
    }
}
