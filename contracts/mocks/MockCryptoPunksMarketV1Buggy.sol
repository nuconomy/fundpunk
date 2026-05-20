// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockCryptoPunksMarketV1Buggy {
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    mapping(uint256 => address) public punkIndexToAddress;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => Offer) public punksOfferedForSale;
    mapping(address => uint256) public pendingWithdrawals;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex);
    event PunkOffered(uint256 indexed punkIndex, uint256 minValue, address indexed toAddress);
    event PunkBought(
        uint256 indexed punkIndex,
        uint256 value,
        address indexed fromAddress,
        address indexed toAddress
    );
    event PunkNoLongerForSale(uint256 indexed punkIndex);

    function setInitialOwner(address to, uint256 punkIndex) external {
        punkIndexToAddress[punkIndex] = to;
        balanceOf[to] += 1;
    }

    function offerPunkForSale(uint256 punkIndex, uint256 minSalePriceInWei) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: true,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: minSalePriceInWei,
            onlySellTo: address(0)
        });
        emit PunkOffered(punkIndex, minSalePriceInWei, address(0));
    }

    function offerPunkForSaleToAddress(
        uint256 punkIndex,
        uint256 minSalePriceInWei,
        address toAddress
    ) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: true,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: minSalePriceInWei,
            onlySellTo: toAddress
        });
        emit PunkOffered(punkIndex, minSalePriceInWei, toAddress);
    }

    function punkNoLongerForSale(uint256 punkIndex) public {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: false,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: 0,
            onlySellTo: address(0)
        });
        emit PunkNoLongerForSale(punkIndex);
    }

    function buyPunk(uint256 punkIndex) external payable {
        Offer storage offer = punksOfferedForSale[punkIndex];
        require(offer.isForSale, "not for sale");
        require(offer.onlySellTo == address(0) || offer.onlySellTo == msg.sender, "not allowed");
        require(msg.value >= offer.minValue, "insufficient value");
        require(offer.seller == punkIndexToAddress[punkIndex], "seller != owner");

        address trueSeller = offer.seller;
        punkIndexToAddress[punkIndex] = msg.sender;
        balanceOf[trueSeller] -= 1;
        balanceOf[msg.sender] += 1;
        emit Transfer(trueSeller, msg.sender, 1);

        punkNoLongerForSale(punkIndex);

        // The V1 bug: after punkNoLongerForSale mutates the storage offer,
        // offer.seller is now the buyer, not trueSeller.
        pendingWithdrawals[offer.seller] += msg.value;
        emit PunkBought(punkIndex, msg.value, offer.seller, msg.sender);
    }

    function transferPunk(address to, uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punkIndexToAddress[punkIndex] = to;
        balanceOf[msg.sender] -= 1;
        balanceOf[to] += 1;
        emit Transfer(msg.sender, to, 1);
        emit PunkTransfer(msg.sender, to, punkIndex);
    }

    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
