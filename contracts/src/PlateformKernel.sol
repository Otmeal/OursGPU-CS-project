// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice 中樞合約，用於配置與連結各模組地址

import 'openzeppelin-contracts/contracts/access/manager/AccessManaged.sol';
import './RoleManager.sol';
import './OCUToken.sol';
import './ControllerLicense.sol';
import './JobManager.sol';

contract PlatformKernel is AccessManaged {
    RoleManager public roleMgr;
    OCUToken public token;
    ControllerLicense public license;
    JobManager public jobMgr;
    WorkerManager public workerMgr;

    constructor(
        address _roleMgr,
        address _token,
        address _license,
        address _jobMgr,
        address _workerMgr
    ) {
        roleMgr = RoleManager(_roleMgr);
        token = OCUToken(_token);
        license = ControllerLicense(_license);
        jobMgr = JobManager(_jobMgr);
        workerMgr = WorkerManager(_workerMgr);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
}
