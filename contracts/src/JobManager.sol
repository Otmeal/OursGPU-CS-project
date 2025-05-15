// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
/// @notice 任務管理合約
import 'openzeppelin-contracts/contracts/access/manager/AccessManaged.sol';

contract JobManager is AccessManaged {
    bytes32 public constant JOB_ADMIN = keccak256('JOB_ADMIN');

    enum JobStatus {
        REQUESTED,
        SCHEDULED,
        PROCESSING,
        DONE,
        VERIFIED,
        FAILED,
        EXPIRED
    }

    struct Job {
        address requester;
        JobStatus status;
        uint256 createdAt;
        string metadata;
    }
    mapping(uint256 => Job) private _jobs;
    uint256 private _nextJobId;

    event JobCreated(
        uint256 indexed jobId,
        address indexed requester,
        string metadata
    );
    event JobStatusChanged(uint256 indexed jobId, JobStatus status);

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(JOB_ADMIN, msg.sender);
    }

    function createJob(string calldata metadata) external returns (uint256) {
        uint256 id = _nextJobId++;
        _jobs[id] = Job({
            requester: msg.sender,
            status: JobStatus.REQUESTED,
            createdAt: block.timestamp,
            metadata: metadata
        });
        emit JobCreated(id, msg.sender, metadata);
        return id;
    }

    function updateStatus(uint256 jobId, JobStatus status) external {
        require(hasRole(JOB_ADMIN, msg.sender), 'Not job admin');
        _jobs[jobId].status = status;
        emit JobStatusChanged(jobId, status);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }
}
