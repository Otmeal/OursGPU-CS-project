// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./OrgRegistry.sol";

contract FeeManager {
    OrgRegistry  public orgReg;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public labRate;     // 實驗室內使用費率
    uint256 public schoolRate;  // 同校不同Lab費率
    uint256 public externalRate;// 其他學校費率

    event RatesUpdated(uint256 lab, uint256 school, uint256 external);

    constructor(address _accessMgr, address _orgReg) {
        accessMgr = IAccessManager(_accessMgr);
        orgReg    = OrgRegistry(_orgReg);
        // 可在此設預設費率
        labRate      = 0;
        schoolRate   = 10;   // 10 單位
        externalRate = 20;   // 20 單位
    }

    modifier onlyAdmin() {
        require(
            accessMgr.hasRole(ADMIN_ROLE, msg.sender),
            "FeeManager: must have admin role"
        );
        _;
    }

    /// @notice 更新三種費率
    function updateRates(uint256 _lab, uint256 _school, uint256 _external)
        external onlyAdmin
    {
        labRate      = _lab;
        schoolRate   = _school;
        externalRate = _external;
        emit RatesUpdated(_lab, _school, _external);
    }

    /// @notice 根據使用者與節點所屬 Org 計算費率
    function getRate(address user, address node) external view returns (uint256) {
        // 取得使用者與節點的 org 與 schoolOrg
        (uint256 uOrg, uint256 uSchool) = orgReg.getUserOrgHierarchy(user);
        (uint256 nOrg, uint256 nSchool) = orgReg.getNodeOrgHierarchy(node);

        if (uOrg == nOrg) {
            // 同實驗室
            return labRate;
        } else if (uSchool == nSchool) {
            // 同校不同 Lab
            return schoolRate;
        } else {
            // 不同學校
            return externalRate;
        }
    }
}
