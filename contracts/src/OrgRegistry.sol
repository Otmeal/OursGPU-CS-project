// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import 'openzeppelin-contracts/contracts/access/manager/AccessManaged.sol';

contract OrgRegistry is AccessManaged {
    /// @notice Organization structure
    /** @dev For now, there are assuming only two levels of hierarchy: school and org.
     * A school's parentOrg should be 0, and an org's parentOrg should be the ID of the school it belongs to.
     */
    /// @param parentOrg ID of the parent organization (0 = root)
    /// @param name Name of the organization
    struct Org {
        uint256 parentOrg;
        string name;
    }

    constructor(address manager) AccessManaged(manager) {}

    /// @dev incrementing ID for organizationsh
    uint256 private _nextOrgId = 1;

    /// @notice organization ID to Org mapping
    mapping(uint256 => Org) public organizations;
    /// @notice user address to organization ID mapping
    mapping(address => uint256) public userOrg;
    /// @notice node address to organization ID mapping
    mapping(address => uint256) public nodeOrg;

    event OrgRegistered(uint256 indexed orgId, uint256 parentOrg, string name);
    event UserAssigned(address indexed user, uint256 indexed orgId);
    event NodeAssigned(address indexed node, uint256 indexed orgId);

    /// @notice Register an organization
    function registerOrg(
        uint256 parentOrg,
        string calldata name
    ) external restricted returns (uint256) {
        uint256 orgId = _nextOrgId++;
        // if the parentOrg is not 0, check if it exists
        require(
            parentOrg == 0 || bytes(organizations[parentOrg].name).length != 0,
            'OrgRegistry: parentOrg not exist'
        );
        organizations[orgId] = Org({parentOrg: parentOrg, name: name});
        emit OrgRegistered(orgId, parentOrg, name);
        return orgId;
    }

    /// @notice assign a user to an organization
    function assignUser(address user, uint256 orgId) external restricted {
        require(
            bytes(organizations[orgId].name).length != 0,
            'OrgRegistry: org not exist'
        );
        userOrg[user] = orgId;
        emit UserAssigned(user, orgId);
    }

    /// @notice assign a node to an organization
    function assignNode(address node, uint256 orgId) external restricted {
        require(
            bytes(organizations[orgId].name).length != 0,
            'OrgRegistry: org not exist'
        );
        nodeOrg[node] = orgId;
        emit NodeAssigned(node, orgId);
    }

    /// @notice Get the full hierarchy of a user's organization
    /// @dev Although currently the hierarchy is only has school and org.
    function getAddressOrgHierarchy(
        address target
    ) internal view returns (uint256[] memory hierarchy) {
        uint256 orgId = userOrg[target];
        uint256 count = 0;

        // Count the number of layers in the hierarchy
        uint256 tempOrgId = orgId;
        while (tempOrgId != 0) {
            count++;
            tempOrgId = organizations[tempOrgId].parentOrg;
        }

        // Initialize the hierarchy array
        hierarchy = new uint256[](count);

        // Populate the hierarchy array
        uint256 index = count - 1;
        while (orgId != 0) {
            hierarchy[index] = orgId;
            orgId = organizations[orgId].parentOrg;
            if (index > 0) {
                index--;
            }
        }
    }

    /// @notice Get the full hierarchy of a node's organization
    function getNodeOrgHierarchy(
        address node
    ) external view returns (uint256[] memory hierarchy) {
        hierarchy = getAddressOrgHierarchy(node);
    }

    /// @notice Get the full hierarchy of a user's organization
    function getUserOrgHierarchy(
        address user
    ) external view returns (uint256[] memory hierarchy) {
        hierarchy = getAddressOrgHierarchy(user);
    }
}
