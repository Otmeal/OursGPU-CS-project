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
/// @notice Manages escrowed job rewards, controller-approved job creation, and controller-driven payout
/// @dev Adds scheduling: requester escrows the maximum fee from startTime to killTime, and payout
///      is calculated from actual execution seconds recorded by the controller. Any unused stake is refunded
///      to the requester unless the job reaches the kill time, in which case the worker receives all.
contract JobManager is AccessManaged, EIP712 {
    /// @notice Role identifier for job administrators
    bytes32 public constant JOB_ADMIN = keccak256("JOB_ADMIN");

    /// @notice ERC20 token used to pay and stake job rewards
    IERC20 public immutable token;

    /// @notice Reference to the OrgRegistry contract for organization data
    OrgRegistry public orgRegistry;

    /// @notice Controller license NFT used to authorize controller actions
    IERC721 public controllerLicense;

    /// @notice Worker manager used to verify worker staking eligibility
    IWorkerManager public workerManager;

    /// @notice Static platform fee rate expressed in basis points (1% = 100 bps)
    uint256 public constant PLATFORM_FEE_BPS = 1_000; // 10%

    /// @notice Number of seconds in one hour (used for fee calculations)
    uint256 public constant SECONDS_PER_HOUR = 3600;

    /// @notice Accrued platform fees stored in this contract
    uint256 public platformFeesAccrued;

    /// @notice Deployer that can withdraw platform fees
    address public immutable feeCollector;

    /// @notice EIP-712 state: user-scoped nonces to prevent replay
    mapping(address => uint256) public nonces;

    /// @dev EIP-712 typehash for controller-approved user-sent job creation
    /// CreateJob(address requester,uint256 orgId,bytes32 target,uint256 difficulty,uint256 reward,address worker,uint256 nonce,uint256 deadline,address controller,uint256 startTime,uint256 killTime)
    bytes32 private constant CREATE_JOB_TYPEHASH = keccak256(
        "CreateJob(address requester,uint256 orgId,bytes32 target,uint256 difficulty,uint256 reward,address worker,uint256 nonce,uint256 deadline,address controller,uint256 startTime,uint256 killTime)"
    );

    /// @notice Parameters for EIP-712 authorized job creation
    struct CreateJobParams {
        address requester;
        uint256 orgId;
        bytes32 target;
        uint256 difficulty;
        uint256 reward; // maximum stake for the scheduled window
        address worker; // designated worker chosen by requester
        uint256 nonce; // must equal nonces[requester]
        uint256 deadline; // signature expiry timestamp
        address controller; // controller signer and (optionally) fee recipient
        uint256 startTime; // unix seconds when the job should start
        uint256 killTime; // unix seconds when the job should be force-terminated
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

    /// @notice Represents a single job
    struct Job {
        uint256 id;
        address requester; // job requester
        uint256 orgId; // requester's organization ID
        bytes32 target; // hash target value
        uint256 difficulty; // numeric difficulty threshold
        uint256 reward; // staked amount in ERC20 tokens
        JobStatus status; // current job status
        address worker; // address of solver
        uint256 startTime; // scheduled start time (unix seconds)
        uint256 killTime; // scheduled kill time (unix seconds)
        uint256 feePerHour; // cached OrgRegistry fee per hour (smallest units)
        uint256 actualExecutionSeconds; // runtime reported by controller
        uint256 actualEndTime; // wall-clock end time reported by controller
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

    /// @notice Emitted when a job is settled and funds are distributed
    event JobSettled(
        uint256 indexed jobId,
        uint256 payoutToWorker,
        uint256 refundToRequester,
        uint256 actualExecutionSeconds,
        uint256 actualEndTime,
        bool paidFullStake
    );

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
                p.controller,
                p.startTime,
                p.killTime
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice User-sent job creation authorized by a licensed controller's signature.
    /// @dev Transfers the requested reward into escrow. If `permit` is provided and the token
    /// supports EIP-2612, allowance is set in the same transaction. The reward must cover the
    /// entire scheduled window from startTime to killTime using the OrgRegistry hourly fee.
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
        require(p.killTime > p.startTime, "JobManager: invalid schedule");
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
        uint256 feePerHour = orgRegistry.calculateFee(requesterOrg, workerOrg);
        require(feePerHour > 0, "JobManager: zero fee");

        uint256 durationSeconds = p.killTime - p.startTime;
        uint256 requiredReward = _computeRequiredStake(feePerHour, durationSeconds);
        require(p.reward >= requiredReward, "JobManager: reward below required");

        // 1. Pull funds from requester: reward equals calculated stake
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
            worker: p.worker,
            startTime: p.startTime,
            killTime: p.killTime,
            feePerHour: feePerHour,
            actualExecutionSeconds: 0,
            actualEndTime: 0
        });
        emit JobCreated(_nextJobId, p.requester, "");
        emit JobStatusChanged(_nextJobId, JobStatus.REQUESTED);
        _nextJobId++;
    }

    /// @notice Internal helper to compute the staked reward needed to cover a duration in seconds (ceil)
    function _computeRequiredStake(uint256 feePerHour, uint256 durationSeconds) internal pure returns (uint256) {
        if (durationSeconds == 0) return 0;
        uint256 numerator = feePerHour * durationSeconds;
        uint256 reward = numerator / SECONDS_PER_HOUR;
        if (numerator % SECONDS_PER_HOUR != 0) {
            reward += 1; // ceil to cover the full window
        }
        return reward;
    }

    function _capExecutionSeconds(
        uint256 actualExecutionSeconds,
        uint256 actualEndTime,
        uint256 startTime,
        uint256 killTime
    ) internal pure returns (uint256 cappedSeconds) {
        cappedSeconds = actualExecutionSeconds;
        if (actualEndTime > startTime) {
            uint256 elapsed = actualEndTime - startTime;
            if (cappedSeconds > elapsed) cappedSeconds = elapsed;
        }
        if (killTime > startTime) {
            uint256 maxWindow = killTime - startTime;
            if (cappedSeconds > maxWindow) cappedSeconds = maxWindow;
        }
    }

    function _calculateSettlement(
        uint256 staked,
        uint256 cappedSeconds,
        bool payFull,
        uint256 feePerHour
    ) internal pure returns (uint256 workerAmount, uint256 refund, uint256 fee) {
        uint256 payout = payFull ? staked : (feePerHour * cappedSeconds) / SECONDS_PER_HOUR;
        if (payout > staked) payout = staked;

        fee = (payout * PLATFORM_FEE_BPS) / 10_000;
        workerAmount = payout - fee;
        refund = staked > payout ? (staked - payout) : 0;
    }

    /// @notice Controller finalizes a job and releases the escrowed reward
    /// @param jobId Job identifier to finalize
    /// @param actualEndTime Wall-clock end time reported by the controller (unix seconds)
    /// @param actualExecutionSeconds Runtime reported by the controller (seconds)
    /// @param payFull If true, pay the entire staked reward to the worker (used when killTime is reached)
    /// @param success Whether the job succeeded (affects status only)
    function completeJob(
        uint256 jobId,
        uint256 actualEndTime,
        uint256 actualExecutionSeconds,
        bool payFull,
        bool success
    ) external {
        require(controllerLicense.balanceOf(msg.sender) > 0, "JobManager: caller not controller");
        Job storage j = _jobs[jobId];
        address worker = j.worker;
        require(worker != address(0), "JobManager: worker is zero");
        require(j.status != JobStatus.DONE && j.status != JobStatus.FAILED, "Job closed");
        uint256 staked = j.reward;
        require(staked > 0, "JobManager: nothing to pay");

        uint256 cappedSeconds = _capExecutionSeconds(actualExecutionSeconds, actualEndTime, j.startTime, j.killTime);

        (uint256 workerAmount, uint256 refund, uint256 fee) =
            _calculateSettlement(staked, cappedSeconds, payFull, j.feePerHour);

        // Effects
        j.status = success ? JobStatus.DONE : JobStatus.FAILED;
        j.worker = worker;
        j.reward = 0; // prevent re-entrancy/double payout
        j.actualExecutionSeconds = cappedSeconds;
        j.actualEndTime = actualEndTime;
        emit JobStatusChanged(jobId, j.status);

        // Accrue platform fee and pay the worker/refund requester
        if (fee > 0) {
            unchecked {
                platformFeesAccrued += fee;
            }
        }
        token.transfer(worker, workerAmount);
        if (refund > 0) {
            token.transfer(j.requester, refund);
        }
        emit JobSettled(jobId, workerAmount, refund, cappedSeconds, actualEndTime, payFull);
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
