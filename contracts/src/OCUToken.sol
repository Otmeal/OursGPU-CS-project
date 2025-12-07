// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/manager/AccessManaged.sol";

/// @notice Plateform token OCU (OursComputingUnit) for the Ours Computing Platform.
contract OCUToken is ERC20, AccessManaged {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address manager) ERC20("OursComputingUnit", "OCU") AccessManaged(manager) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external restricted {
        _mint(to, amount);
    }
}
