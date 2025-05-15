// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/access/manager/AccessManager.sol";

/// @notice Role Manager for the whole platform.
/// @dev This implementation coordinates with the orgId in OrgRegistry.sol.
///
contract RoleManager is AccessManager {
    string constant OWNER_ROLE = "OWNER_ROLE";
    string constant MANAGER_ROLE = "MANAGER_ROLE";
    string constant MEMBER_ROLE = "MEMBER_ROLE";

    /// @notice Configure settings that can be set before deployment.
    /// @dev There are still some function calls must be made after deployment, in order to setup all the permissions.
    constructor() AccessManager(msg.sender) {}

    /// @dev the comma prevents collisions.
    function setupRolesForOrg(uint256 orgId) external {
        uint64 ownerRole = uint64(uint256(keccak256(abi.encodePacked(OWNER_ROLE, ",", orgId))));
        uint64 managerRole = uint64(uint256(keccak256(abi.encodePacked(MANAGER_ROLE, ",", orgId))));
        uint64 memberRole = uint64(uint256(keccak256(abi.encodePacked(MEMBER_ROLE, ",", orgId))));

        _grantRole(ownerRole, msg.sender, 0, 0);
        _setRoleAdmin(managerRole, ownerRole);
        _setRoleAdmin(memberRole, ownerRole);
    }
}
