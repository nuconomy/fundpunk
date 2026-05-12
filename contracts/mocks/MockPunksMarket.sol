// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockPunksMarket {
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    mapping(uint256 => address) public punkIndexToAddress;
    mapping(uint256 => Offer) public punksOfferedForSale;
    mapping(uint256 => uint256) public punkPrice;
    address public wrongOwnerAfterBuy;

    function setPunkForSale(uint256 punkId, uint256 price) external {
        punkIndexToAddress[punkId] = address(this);
        punkPrice[punkId] = price;
        punksOfferedForSale[punkId] = Offer(true, punkId, address(this), price, address(0));
    }

    function setPunkForSaleTo(uint256 punkId, uint256 price, address onlySellTo) external {
        punkIndexToAddress[punkId] = address(this);
        punkPrice[punkId] = price;
        punksOfferedForSale[punkId] = Offer(true, punkId, address(this), price, onlySellTo);
    }

    function setWrongOwnerAfterBuy(address owner) external {
        wrongOwnerAfterBuy = owner;
    }

    function buyPunk(uint256 punkId) external payable {
        Offer memory offer = punksOfferedForSale[punkId];
        require(offer.isForSale, "not for sale");
        require(offer.punkIndex == punkId, "wrong punk");
        require(offer.seller == punkIndexToAddress[punkId], "seller mismatch");
        require(offer.onlySellTo == address(0) || offer.onlySellTo == msg.sender, "not allowed");
        require(msg.value >= offer.minValue, "price too low");
        punkIndexToAddress[punkId] = wrongOwnerAfterBuy == address(0) ? msg.sender : wrongOwnerAfterBuy;
        delete punksOfferedForSale[punkId];
    }

    function transferPunk(address to, uint256 punkId) external {
        require(punkIndexToAddress[punkId] == msg.sender, "not owner");
        punkIndexToAddress[punkId] = to;
        delete punksOfferedForSale[punkId];
    }
}
