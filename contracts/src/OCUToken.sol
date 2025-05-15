// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
import 'openzeppelin-contracts/contracts/token/ERC20/ERC20.sol';
import 'openzeppelin-contracts/contracts/access/manager/AccessManaged.sol';

/// @notice 平台代幣 (ERC20)
contract OCUToken is ERC20, AccessManaged {
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');

    constructor(
        address manager
    ) ERC20('OursComputingUnit', 'OCU') AccessManaged(manager) {
        // 初始鑄造
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external restricted {
        _mint(to, amount);
    }
}
