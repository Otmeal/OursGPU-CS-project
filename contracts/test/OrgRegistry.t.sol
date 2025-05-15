// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import 'forge-std/Test.sol';
import '@openzeppelin/contracts/access/manager/AccessManager.sol';
import '@openzeppelin/contracts/access/manager/IAccessManaged.sol';
import '../src/OrgRegistry.sol';

contract OrgRegistryTest is Test {
    AccessManager accessManager;
    OrgRegistry registry;
    address user1 = address(0x1);
    address node1 = address(0x3);

    function setUp() public {
        // Deploy AccessManager; this contract becomes DEFAULT_ADMIN_ROLE automatically
        accessManager = new AccessManager(address(this));

        // Deploy OrgRegistry, passing AccessManager's address as authority
        registry = new OrgRegistry(address(accessManager));

        // Prepare selectors for all functions protected by 'restricted'
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = OrgRegistry.registerOrg.selector;
        selectors[1] = OrgRegistry.assignUser.selector;
        selectors[2] = OrgRegistry.assignNode.selector;

        // Map these selectors to roleId 0 (DEFAULT_ADMIN_ROLE)
        accessManager.setTargetFunctionRole(address(registry), selectors, 0);
    }

    function testRegisterOrgAndHierarchy() public {
        // Calling registerOrg should no longer revert
        uint256 rootId = registry.registerOrg(0, 100, 10, 'Root');
        assertEq(rootId, 1);

        // Register a child organization
        uint256 childId = registry.registerOrg(rootId, 200, 20, 'Child');
        assertEq(childId, 2);

        // Register a grandchild organization
        uint256 grandchildId = registry.registerOrg(
            childId,
            300,
            30,
            'Grandchild'
        );
        assertEq(grandchildId, 3);

        // Verify hierarchy [root, child, grandchild]
        uint256[] memory hierarchy = registry.getOrgHierarchy(grandchildId);
        assertEq(hierarchy.length, 3);
        assertEq(hierarchy[0], rootId);
        assertEq(hierarchy[1], childId);
        assertEq(hierarchy[2], grandchildId);
    }

    function testAssignUserAndNode() public {
        // Register an organization and assign a user and a node to it
        uint256 orgId = registry.registerOrg(0, 50, 5, 'OrgA');
        registry.assignUser(user1, orgId);
        assertEq(registry.userOrganizations(user1), orgId);

        registry.assignNode(node1, orgId);
        assertEq(registry.nodeOrganizations(node1), orgId);

        // Verify user and node hierarchies match the organization
        uint256[] memory userHierarchy = registry.getUserOrgHierarchy(user1);
        uint256[] memory nodeHierarchy = registry.getNodeOrgHierarchy(node1);
        assertEq(userHierarchy.length, 1);
        assertEq(userHierarchy[0], orgId);
        assertEq(nodeHierarchy.length, 1);
        assertEq(nodeHierarchy[0], orgId);
    }

    function testDistanceToLCA() public {
        // Build organization tree: root -> A -> B, and root -> C
        uint256 rootId = registry.registerOrg(0, 0, 0, 'Root');
        uint256 idA = registry.registerOrg(rootId, 0, 0, 'A');
        uint256 idB = registry.registerOrg(idA, 0, 0, 'B');
        uint256 idC = registry.registerOrg(rootId, 0, 0, 'C');

        // Distance to itself is 0
        assertEq(registry.getDistanceToLCA(idB, idB), 0);

        // Parent-child distance should be 0 (common ancestor is parent)
        assertEq(registry.getDistanceToLCA(idB, idA), 0);

        // Sibling distance should be 1 (common ancestor is root)
        assertEq(registry.getDistanceToLCA(idB, idC), 1);
        assertEq(registry.getDistanceToLCA(idA, idC), 1);
    }

    function testCalculateFee() public {
        // Register organizations with baseRate and perLevelMarkup
        uint256 rootId = registry.registerOrg(0, 1000, 100, 'Root');
        uint256 childId = registry.registerOrg(rootId, 2000, 200, 'Child');
        uint256 grandId = registry.registerOrg(
            childId,
            3000,
            300,
            'Grandchild'
        );

        // Fee when user and node are in the same organization (distance 0)
        uint256 feeSame = registry.calculateFee(grandId, grandId);
        assertEq(feeSame, 3000);

        // Fee when node is one level above user (distance 1)
        uint256 feeDistance1 = registry.calculateFee(childId, grandId);
        assertEq(feeDistance1, 3300);

        // Fee when node is two levels above user (distance 2)
        uint256 feeDistance2 = registry.calculateFee(rootId, grandId);
        assertEq(feeDistance2, 3600);
    }

    function testRestrictedAccessRevertsForUnauthorizedCaller() public {
        // Simulate a caller without the ADMIN role
        address unauthorized = address(0x999);
        vm.prank(unauthorized);
        // Expect revert with AccessManagedUnauthorized(caller)
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessManaged.AccessManagedUnauthorized.selector,
                unauthorized
            )
        );
        registry.registerOrg(0, 0, 0, 'Invalid');
    }
}
