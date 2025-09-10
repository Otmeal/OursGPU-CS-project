// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import '@openzeppelin/contracts/access/manager/AccessManaged.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './OrgRegistry.sol';
// Minimal interface to query worker stake
interface IWorkerManager {
    function stakeOf(address worker) external view returns (uint256);
}

/// @title Job Manager
/// @author
/// @notice Manages PoW-style hash calculation jobs, tracks status, payouts and fees
/// @dev Integrates with OrgRegistry to compute dynamic fees based on organization hierarchy
contract JobManager is AccessManaged {
    /// @notice Role identifier for job administrators
    bytes32 public constant JOB_ADMIN = keccak256('JOB_ADMIN');

    /// @notice ERC20 token used to pay and stake job rewards
    IERC20 public immutable token;

    /// @notice Reference to the OrgRegistry contract for organization data
    OrgRegistry public orgRegistry;

    /// @notice Controller license NFT used to authorize controller actions
    IERC721 public controllerLicense;

    /// @notice Worker manager used to verify worker staking eligibility
    IWorkerManager public workerManager;

    /// @notice Job lifecycle statuses
    enum JobStatus {
        REQUESTED,
        SCHEDULED,
        PROCESSING,
        DONE,
        VERIFIED,
        FAILED
    }

    /// @notice Represents a single hash calculation job
    struct Job {
        uint256 id;
        address requester; // job requester
        uint256 orgId; // requester's organization ID
        bytes32 target; // hash target value
        uint256 difficulty; // numeric difficulty threshold
        uint256 reward; // reward amount in ERC20 tokens
        JobStatus status; // current job status
        address worker; // address of solver
    }

    /// @notice Mapping from job ID to Job struct
    mapping(uint256 => Job) private _jobs;

    /// @notice Next job ID to assign
    uint256 private _nextJobId;

    /// @notice Emitted when a new job is created
    /// @param jobId Unique identifier of the created job
    /// @param requester Address that requested the job
    /// @param metadata Additional string metadata (e.g., worker instructions)
    event JobCreated(
        uint256 indexed jobId,
        address indexed requester,
        string metadata
    );

    /// @notice Emitted when a job's status changes
    /// @param jobId Unique identifier of the job
    /// @param status New status of the job
    event JobStatusChanged(uint256 indexed jobId, JobStatus status);

    /// @notice Constructs the JobManager contract
    /// @param manager Address of the AccessManaged manager
    /// @param _tokenAddress Address of the ERC20 token used for payments
    /// @param orgRegistryAddress Address of the OrgRegistry contract
    /// @param controllerLicenseAddress Address of the ControllerLicense (ERC721) contract
    /// @param workerManagerAddress Address of the WorkerManager (staking vault)
    constructor(
        address manager,
        address _tokenAddress,
        address orgRegistryAddress,
        address controllerLicenseAddress,
        address workerManagerAddress
    ) AccessManaged(manager) {
        require(_tokenAddress != address(0), '_tokenAddress is zero address');
        token = IERC20(_tokenAddress);
        orgRegistry = OrgRegistry(orgRegistryAddress);
        controllerLicense = IERC721(controllerLicenseAddress);
        workerManager = IWorkerManager(workerManagerAddress);
    }

    /// @notice Updates the status of an existing job
    /// @param jobId Unique identifier of the job to update
    /// @param status New status to set for the job
    function updateStatus(uint256 jobId, JobStatus status) external {
        // Only licensed controllers can update job status
        require(
            controllerLicense.balanceOf(msg.sender) > 0,
            'JobManager: caller not controller'
        );
        _jobs[jobId].status = status;
        emit JobStatusChanged(jobId, status);
    }

    /// @notice Retrieves the details of a job
    /// @param jobId Unique identifier of the job to fetch
    /// @return Job struct containing all job fields
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /// @notice Creates a new hash calculation job
    /// @param orgId Organization ID of the requester
    /// @param target Hash target value for PoW
    /// @param difficulty Numeric target threshold for valid solutions
    /// @param reward Amount of ERC20 tokens staked as the reward
    /// @dev Caller must approve `reward` tokens to this contract before calling
    function createJob(
        uint256 orgId,
        bytes32 target,
        uint256 difficulty,
        uint256 reward
    ) external {
        // 1. The requester stakes the reward in this contract
        token.transferFrom(msg.sender, address(this), reward);
        // 2. Register the new Job
        _jobs[_nextJobId] = Job({
            id: _nextJobId,
            requester: msg.sender,
            orgId: orgId,
            target: target,
            difficulty: difficulty,
            reward: reward,
            status: JobStatus.REQUESTED,
            worker: address(0)
        });
        emit JobCreated(_nextJobId, msg.sender, '');
        // 3. Increment the job ID counter
        _nextJobId++;
    }

    /// @notice Submits a solution for an open job
    /// @param jobId Unique identifier of the job to solve
    /// @param nonce Nonce value that produces a valid hash
    /// @dev Verifies PoW, calculates fee via OrgRegistry, pays out solver and platform
    function submitSolve(uint256 jobId, uint256 nonce) external {
        Job storage j = _jobs[jobId];
        require(j.status == JobStatus.REQUESTED, 'Job is already closed');

        // Require the worker to have an active stake
        require(workerManager.stakeOf(msg.sender) > 0, 'JobManager: no stake');

        // 1. Verify the solution via hash < difficulty
        bytes32 result = keccak256(abi.encodePacked(jobId, nonce));
        require(
            uint256(result) < j.difficulty,
            'Solution does not meet difficulty'
        );

        // 2. Retrieve both organizations and calculate the fee rate
        uint256 requesterOrg = orgRegistry.userOrganizations(j.requester);
        uint256 workerOrg = orgRegistry.nodeOrganizations(msg.sender);
        uint256 feeRate = orgRegistry.calculateFee(requesterOrg, workerOrg);

        // 3. Split the reward into payout and fee
        uint256 fee = (j.reward * feeRate) / 100;
        uint256 payout = j.reward - fee;
        token.transfer(msg.sender, payout); // Pay the worker

        // 4. Mark job as done and record the worker
        j.status = JobStatus.DONE;
        j.worker = msg.sender;
    }
}
