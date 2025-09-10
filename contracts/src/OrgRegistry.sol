// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/access/manager/AccessManaged.sol";

/// @title OrgRegistry
/// @notice Manages an organizational hierarchy of arbitrary depth on-chain, allowing assignment of users and nodes
contract OrgRegistry is AccessManaged {
    /// @notice Organization structure
    /// @dev parentOrg = 0 indicates a root organization, supports arbitrary-depth hierarchy
    struct Org {
        uint256 parentOrg; // ID of the parent organization (0 = root)
        string name; // Name of the organization
        uint256 baseRate; // Base rate for this organization
        uint256 perLevelMarkup; // Markup per level for this organization
    }

    /// @dev Auto-incrementing organization ID
    uint256 private _nextOrgId = 1;

    /// @notice Mapping from organization ID to Org struct
    mapping(uint256 => Org) public organizations;
    /// @notice Mapping from user address to organization ID
    mapping(address => uint256) public userOrganizations;
    /// @notice Mapping from node address to organization ID
    mapping(address => uint256) public nodeOrganizations;

    event OrgRegistered(uint256 indexed orgId, uint256 parentOrg, string name);
    event UserAssigned(address indexed user, uint256 indexed orgId);
    event NodeAssigned(address indexed node, uint256 indexed orgId);

    /// @notice Constructor that sets the manager address for AccessManaged
    /// @param manager The address with management permissions
    constructor(address manager) AccessManaged(manager) {}

    /// @notice Register a new organization
    /// @param parentOrg ID of the parent organization (0 if root)
    /// @param name Name of the organization
    /// @return The newly created organization ID
    function registerOrg(uint256 parentOrg, uint256 baseRate, uint256 perLevelMarkup, string calldata name)
        external
        restricted
        returns (uint256)
    {
        uint256 orgId = _nextOrgId++;
        // Allow top-level orgs with parentOrg == 0 (virtual root). Otherwise, parent must exist.
        require(
            parentOrg == 0 || bytes(organizations[parentOrg].name).length != 0, "OrgRegistry: parentOrg does not exist"
        );
        organizations[orgId] = Org(parentOrg, name, baseRate, perLevelMarkup);
        emit OrgRegistered(orgId, parentOrg, name);
        return orgId;
    }

    /// @notice Assign a user to an organization
    /// @param user Address of the user
    /// @param orgId ID of the organization
    function assignUser(address user, uint256 orgId) external restricted {
        require(bytes(organizations[orgId].name).length != 0, "OrgRegistry: organization does not exist");
        userOrganizations[user] = orgId;
        emit UserAssigned(user, orgId);
    }

    /// @notice Assign a node to an organization
    /// @param node Address of the node
    /// @param orgId ID of the organization
    function assignNode(address node, uint256 orgId) external restricted {
        require(bytes(organizations[orgId].name).length != 0, "OrgRegistry: organization does not exist");
        nodeOrganizations[node] = orgId;
        emit NodeAssigned(node, orgId);
    }

    /// @notice Retrieve the full hierarchy for a given organization ID
    /// @param orgId The organization ID to query
    /// @return An array of organization IDs from the root to the given orgId
    function getOrgHierarchy(uint256 orgId) public view returns (uint256[] memory) {
        uint256 count = 0;
        uint256 current = orgId;
        while (current != 0) {
            count++;
            current = organizations[current].parentOrg;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 index = count;
        current = orgId;
        while (current != 0) {
            index--;
            ids[index] = current;
            current = organizations[current].parentOrg;
        }
        return ids;
    }

    /// @notice Retrieve the full hierarchy for the organization a user belongs to
    /// @param user Address of the user
    /// @return An array of organization IDs from the root to the user's organization
    function getUserOrgHierarchy(address user) external view returns (uint256[] memory) {
        return getOrgHierarchy(userOrganizations[user]);
    }

    /// @notice Retrieve the full hierarchy for the organization a node belongs to
    /// @param node Address of the node
    /// @return An array of organization IDs from the root to the node's organization
    function getNodeOrgHierarchy(address node) external view returns (uint256[] memory) {
        return getOrgHierarchy(nodeOrganizations[node]);
    }

    /// @dev 計算 userOrg 與 gpuOrg 之間的跳數
    function getDistanceToLCA(uint256 from, uint256 to) public view returns (uint256) {
        uint256 dist = 0;
        uint256 fromCurrent = from;
        uint256 toCurrent = to;
        uint256 fromDepth = 0;
        uint256 toDepth = 0;

        // Calculate depth of fromOrg
        while (fromCurrent != 0) {
            fromDepth += 1;
            fromCurrent = organizations[fromCurrent].parentOrg;
        }
        // Calculate depth of toOrg
        while (toCurrent != 0) {
            toDepth += 1;
            toCurrent = organizations[toCurrent].parentOrg;
        }

        if (fromDepth < toDepth) {
            while (toDepth > fromDepth) {
                to = organizations[to].parentOrg; // Move up the tree
                toDepth -= 1;
            }
        } else if (toDepth < fromDepth) {
            while (fromDepth > toDepth) {
                from = organizations[from].parentOrg; // Move up the tree
                fromDepth -= 1;
            }
        }

        while (from != to) {
            from = organizations[from].parentOrg; // Move up the tree
            to = organizations[to].parentOrg; // Move up the tree
            dist += 1; // Each step up adds 1 to the distance
        }

        return dist + 1;
    }

    /// @dev Calculate the fee for a user based on their organization and the node's organization. The node to its parent organization is counted one hops.
    function calculateFee(uint256 userOrg, uint256 nodeOrg) external view returns (uint256) {
        uint256 dist = getDistanceToLCA(nodeOrg, userOrg);
        return organizations[nodeOrg].baseRate + organizations[nodeOrg].perLevelMarkup * (dist + 1);
    }
}
