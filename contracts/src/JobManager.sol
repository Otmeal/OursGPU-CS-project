// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "./OrgRegistry.sol";

// Minimal interface to query worker stake from WorkerManager
interface IWorkerManager {
    function stakeOf(address worker) external view returns (uint256);
}

/// @title Job Manager
/// @author
/// @notice Manages escrowed job rewards, controller-approved job creation, and controller-driven payout
/// @dev Simplified: requester escrows the OrgRegistry-calculated reward; controller finalizes payout and
///      the contract retains `PLATFORM_FEE_BPS` as the platform fee.
contract JobManager is AccessManaged, EIP712 {
    /// @notice Role identifier for job administrators
    bytes32 public constant JOB_ADMIN = keccak256("JOB_ADMIN");

    /// @notice ERC20 token used to pay and stake job rewards
    IERC20 public immutable token;

    /// @notice Reference to the OrgRegistry contract for organization data (kept for future use)
    OrgRegistry public orgRegistry;

    /// @notice Controller license NFT used to authorize controller actions
    IERC721 public controllerLicense;

    /// @notice Worker manager used to verify worker staking eligibility
    IWorkerManager public workerManager;

    /// @notice Static platform fee rate expressed in basis points (1% = 100 bps)
    uint256 public constant PLATFORM_FEE_BPS = 1_000; // 10%

    /// @notice Accrued platform fees stored in this contract
    uint256 public platformFeesAccrued;

    /// @notice Deployer that can withdraw platform fees
    address public immutable feeCollector;

    /// @notice EIP-712 state: user-scoped nonces to prevent replay
    mapping(address => uint256) public nonces;

    /// @dev EIP-712 typehash for controller-approved user-sent job creation
    /// CreateJob(address requester,uint256 orgId,bytes32 target,uint256 difficulty,uint256 reward,address worker,uint256 nonce,uint256 deadline,address controller)
    bytes32 private constant CREATE_JOB_TYPEHASH = keccak256(
        "CreateJob(address requester,uint256 orgId,bytes32 target,uint256 difficulty,uint256 reward,address worker,uint256 nonce,uint256 deadline,address controller)"
    );

    /// @notice Parameters for EIP-712 authorized job creation
    struct CreateJobParams {
        address requester;
        uint256 orgId;
        bytes32 target;
        uint256 difficulty;
        uint256 reward;
        address worker; // designated worker chosen by requester
        uint256 nonce; // must equal nonces[requester]
        uint256 deadline; // signature expiry timestamp
        address controller; // controller signer and (optionally) fee recipient
    }

    /// @notice Optional ERC20 permit to set allowance in the same tx
    struct PermitData {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

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
    event JobCreated(uint256 indexed jobId, address indexed requester, string metadata);

    /// @notice Emitted when a job's status changes
    /// @param jobId Unique identifier of the job
    /// @param status New status of the job
    event JobStatusChanged(uint256 indexed jobId, JobStatus status);

    /// @notice Constructs the JobManager contract
    /// @param manager Address of the AccessManaged manager
    /// @param _tokenAddress Address of the ERC20 token used for payments
    /// @param controllerLicenseAddress Address of the ControllerLicense (ERC721) contract
    /// @param orgRegistryAddress Address of the OrgRegistry contract
    /// @param workerManagerAddress Address of the WorkerManager contract
    constructor(
        address manager,
        address _tokenAddress,
        address controllerLicenseAddress,
        address orgRegistryAddress,
        address workerManagerAddress
    ) AccessManaged(manager) EIP712("JobManager", "1") {
        require(_tokenAddress != address(0), "_tokenAddress is zero address");
        token = IERC20(_tokenAddress);
        controllerLicense = IERC721(controllerLicenseAddress);
        orgRegistry = OrgRegistry(orgRegistryAddress);
        workerManager = IWorkerManager(workerManagerAddress);
        feeCollector = msg.sender;
    }

    /// @notice Updates the status of an existing job
    /// @param jobId Unique identifier of the job to update
    /// @param status New status to set for the job
    function updateStatus(uint256 jobId, JobStatus status) external {
        // Only licensed controllers can update job status
        require(controllerLicense.balanceOf(msg.sender) > 0, "JobManager: caller not controller");
        _jobs[jobId].status = status;
        emit JobStatusChanged(jobId, status);
    }

    /// @notice Retrieves the details of a job
    /// @param jobId Unique identifier of the job to fetch
    /// @return Job struct containing all job fields
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /// @notice Computes the EIP-712 digest for CreateJobParams for off-chain signing/verification
    function hashCreateJob(CreateJobParams calldata p) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CREATE_JOB_TYPEHASH,
                p.requester,
                p.orgId,
                p.target,
                p.difficulty,
                p.reward,
                p.worker,
                p.nonce,
                p.deadline,
                p.controller
            )
        );
        return _hashTypedDataV4(structHash);
    }

    // Removed the open createJob in favor of controller-approved flow

    /// @notice User-sent job creation authorized by a licensed controller's signature.
    /// @dev Transfers the requested reward into escrow. If `permit` is provided and the token
    /// supports EIP-2612, allowance is set in the same transaction. The reward must equal the
    /// fee computed by OrgRegistry for the requester/worker pair; the platform fee is taken as a
    /// percentage of this reward during completion.
    function createJobWithControllerSig(
        CreateJobParams calldata p,
        bytes calldata controllerSignature,
        PermitData calldata permit
    ) external {
        require(p.requester == msg.sender, "JobManager: requester != msg.sender");
        require(block.timestamp <= p.deadline, "JobManager: signature expired");
        require(p.nonce == nonces[p.requester], "JobManager: bad nonce");
        require(p.worker != address(0), "JobManager: worker = zero");
        require(p.reward > 0, "JobManager: reward is zero");
        // Ensure worker has an active stake
        require(workerManager.stakeOf(p.worker) > 0, "JobManager: worker not staked");

        // Verify controller signature and license
        bytes32 digest = hashCreateJob(p);
        bool ok = SignatureChecker.isValidSignatureNow(p.controller, digest, controllerSignature);
        require(ok, "JobManager: invalid controller signature");
        require(controllerLicense.balanceOf(p.controller) > 0, "JobManager: signer not controller");

        // Consume nonce
        unchecked {
            nonces[p.requester] = p.nonce + 1;
        }

        // Optional permit to set allowance for transferFrom in the same tx
        if (permit.deadline != 0) {
            // best-effort: ignore failures if token doesn't support permit or signature invalid
            try IERC20Permit(address(token)).permit(
                p.requester, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s
            ) {
                // no-op on success
            } catch {
                // ignore
            }
        }

        // Resolve canonical org relationships
        uint256 requesterOrg = orgRegistry.userOrganizations(p.requester);
        require(requesterOrg == p.orgId, "JobManager: org mismatch");
        uint256 workerOrg = orgRegistry.nodeOrganizations(p.worker);
        uint256 expectedReward = orgRegistry.calculateFee(requesterOrg, workerOrg);
        require(expectedReward > 0, "JobManager: zero fee");
        require(p.reward == expectedReward, "JobManager: reward mismatch");

        // 1. Pull funds from requester: reward equals calculated fee
        token.transferFrom(p.requester, address(this), p.reward);

        // 2. Register the new Job under the requester
        _jobs[_nextJobId] = Job({
            id: _nextJobId,
            requester: p.requester,
            orgId: p.orgId,
            target: p.target,
            difficulty: p.difficulty,
            reward: p.reward,
            status: JobStatus.REQUESTED,
            worker: p.worker
        });
        emit JobCreated(_nextJobId, p.requester, "");
        _nextJobId++;
    }

    /// @notice Controller finalizes a job and releases the escrowed reward to the worker
    /// @param jobId Job identifier to finalize
    function completeJob(uint256 jobId) external {
        require(controllerLicense.balanceOf(msg.sender) > 0, "JobManager: caller not controller");
        Job storage j = _jobs[jobId];
        address worker = j.worker;
        require(worker != address(0), "JobManager: worker is zero");
        require(j.status != JobStatus.DONE && j.status != JobStatus.FAILED, "Job closed");
        uint256 reward = j.reward;
        require(reward > 0, "JobManager: nothing to pay");

        uint256 fee = (reward * PLATFORM_FEE_BPS) / 10_000;
        require(fee <= reward, "JobManager: fee exceeds reward");
        uint256 payout = reward - fee;

        // Effects
        j.status = JobStatus.DONE;
        j.worker = worker;
        j.reward = 0; // prevent re-entrancy/double payout
        emit JobStatusChanged(jobId, JobStatus.DONE);

        // Accrue platform fee and pay the worker
        if (fee > 0) {
            unchecked {
                platformFeesAccrued += fee;
            }
        }
        token.transfer(worker, payout);
    }

    /// @notice Withdraw platform fees accrued in this contract
    function withdrawPlatformFees(address to, uint256 amount) external {
        require(msg.sender == feeCollector, "JobManager: not fee collector");
        require(to != address(0), "JobManager: to is zero");
        require(amount <= platformFeesAccrued, "JobManager: amount exceeds fees");
        unchecked {
            platformFeesAccrued -= amount;
        }
        token.transfer(to, amount);
    }
}
