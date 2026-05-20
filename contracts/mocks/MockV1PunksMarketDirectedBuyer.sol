// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockCryptoPunksV1Market {
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
    function withdraw() external;
    function transferPunk(address to, uint256 punkIndex) external;
}

contract MockV1PunksMarketDirectedBuyer {
    uint256 internal constant PUSH_GAS = 95_000;
    IMockCryptoPunksV1Market public constant PUNKS_V1 =
        IMockCryptoPunksV1Market(0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D);

    mapping(address => uint256) public balances;
    address public wrongRecipient;

    event PunkPurchased(
        uint256 indexed punkId,
        address indexed seller,
        address indexed recipient,
        address caller,
        uint96 listingWei
    );
    event Credited(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    function setWrongRecipient(address recipient) external {
        wrongRecipient = recipient;
    }

    receive() external payable {
        require(msg.sender == address(PUNKS_V1), "unexpected sender");
    }

    function buyPunk(uint16 punkId, uint96 expectedListingWei, address recipient)
        external
        payable
    {
        require(recipient != address(0), "zero recipient");
        require(msg.value == expectedListingWei, "incorrect payment");

        (bool isForSale,, address listingSeller, uint256 minValue, address onlySellTo) =
            PUNKS_V1.punksOfferedForSale(punkId);
        require(isForSale, "not for sale");
        require(listingSeller != address(0), "zero seller");
        require(onlySellTo == address(this), "not directed");
        require(PUNKS_V1.punkIndexToAddress(punkId) == listingSeller, "seller mismatch");
        require(minValue == expectedListingWei, "price mismatch");

        PUNKS_V1.buyPunk{value: expectedListingWei}(punkId);
        PUNKS_V1.withdraw();

        address finalRecipient = wrongRecipient == address(0) ? recipient : wrongRecipient;
        PUNKS_V1.transferPunk(finalRecipient, punkId);

        _pushOrCredit(listingSeller, expectedListingWei);

        emit PunkPurchased(punkId, listingSeller, finalRecipient, msg.sender, expectedListingWei);
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "no balance");
        balances[msg.sender] = 0;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");

        emit Withdrawal(msg.sender, amount);
    }

    function _pushOrCredit(address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        (bool ok,) = payable(to).call{value: amount, gas: PUSH_GAS}("");
        if (!ok) {
            balances[to] += amount;
            emit Credited(to, amount);
        }
    }
}
