// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title WorkerManager - staking vault for workers
/// @dev Holds worker stakes in ERC20 and allows licensed controllers to slash.
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

contract WorkerManager is AccessManaged {

    /// @notice ERC20 token used for staking (e.g., OCU)
    IERC20 public immutable stakeToken;

    /// @notice ERC721 contract that certifies controllers
    IERC721 public immutable controllerLicense;

    /// @notice Track stake amount per worker address
    mapping(address => uint256) private _stakes;

    /// @notice Emitted when a worker stakes tokens
    event WorkerStaked(address indexed worker, uint256 amount);

    /// @notice Emitted when a worker unstakes tokens
    event WorkerUnstaked(address indexed worker, uint256 amount);

    /// @notice Emitted when a controller slashes a worker's stake
    event WorkerSlashed(
        address indexed controller,
        address indexed worker,
        uint256 amount,
        address recipient
    );

    /// @param manager the address of the AccessManager contract
    constructor(
        address manager,
        address stakeToken_,
        address controllerLicense_
    ) AccessManaged(manager) {
        require(stakeToken_ != address(0), 'stake token is zero');
        require(controllerLicense_ != address(0), 'controller license is zero');
        stakeToken = IERC20(stakeToken_);
        controllerLicense = IERC721(controllerLicense_);
    }

    /// @notice Stake `amount` tokens to secure worker behavior.
    /// @dev Requires `approve` of at least `amount` on the stake token for this contract.
    function stake(uint256 amount) external {
        require(amount > 0, 'amount = 0');
        stakeToken.transferFrom(msg.sender, address(this), amount);
        _stakes[msg.sender] += amount;
        emit WorkerStaked(msg.sender, amount);
    }

    /// @notice Unstake `amount` tokens previously deposited.
    /// @dev Allows immediate withdrawal; slashing risk is external to policy.
    function unstake(uint256 amount) external {
        require(amount > 0, 'amount = 0');
        uint256 bal = _stakes[msg.sender];
        require(bal >= amount, 'insufficient stake');
        _stakes[msg.sender] = bal - amount;
        stakeToken.transfer(msg.sender, amount);
        emit WorkerUnstaked(msg.sender, amount);
    }

    /// @notice Slash `amount` tokens from `worker` and send to `recipient`.
    /// @dev Callable by any address that holds a ControllerLicense NFT.
    function slash(
        address worker,
        uint256 amount,
        address recipient
    ) external {
        require(controllerLicense.balanceOf(msg.sender) > 0, 'not controller');
        require(worker != address(0), 'worker = zero');
        require(recipient != address(0), 'recipient = zero');
        uint256 bal = _stakes[worker];
        require(bal >= amount && amount > 0, 'invalid amount');
        _stakes[worker] = bal - amount;
        stakeToken.transfer(recipient, amount);
        emit WorkerSlashed(msg.sender, worker, amount, recipient);
    }

    /// @notice Get the current stake balance of `worker`.
    function stakeOf(address worker) external view returns (uint256) {
        return _stakes[worker];
    }

    // Note: worker identity is no longer tracked here.
}
