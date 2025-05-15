// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import 'openzeppelin-contracts/contracts/access/manager/AccessManager.sol';

/// @notice Role Manager for the whole platform.
contract RoleManager is AccessManager {
    uint64 public constant JANITOR_ROLE = 1;
    uint64 public constant PROFESSOR_ROLE = 2;
    uint64 public constant STUDENT_ROLE = 3;

    /// @notice Configure settings that can be set before deployment.
    /// @dev There are still some function calls must be made after deployment, in order to setup all the permissions.
    constructor() AccessManager(msg.sender) {
        setRoleAdmin(JANITOR_ROLE, ADMIN_ROLE);
        setRoleAdmin(PROFESSOR_ROLE, JANITOR_ROLE);
        setRoleAdmin(STUDENT_ROLE, JANITOR_ROLE);
    }
}
