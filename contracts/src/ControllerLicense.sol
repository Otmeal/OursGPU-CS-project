// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title ControllerLicense - ERC721 token representing a Controller Controller
/// @dev The ERC721URIStorage is used instead of ERC721, allowing diverse format of metadata URLs.
/// @notice Each tokenId corresponds to a unique Controller Controller identity.
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';

contract ControllerLicense is ERC721URIStorage, AccessManaged {
    /// @notice Event emitted when a new Controller NFT is minted.
    /// @param to the address receiving the new token
    /// @param tokenId the unique token identifier
    event ControllerMinted(address indexed to, uint256 indexed tokenId);

    /// @notice Event emitted when a Controller NFT is burned.
    /// @param tokenId the unique token identifier that was burned
    event ControllerBurned(uint256 indexed tokenId);

    /// @dev Token ID counter.
    uint256 private _nextTokenId = 1;

    /// @param manager the address of the AccessManager contract
    /// @param name_ the name of the ERC721 token collection
    /// @param symbol_ the symbol of the ERC721 token collection
    constructor(
        address manager,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) AccessManaged(manager) {}

    /// @notice Mint a new Controller NFT to `to` with metadata URI.
    /// @dev Caller must have JANITOR.
    /// @param to the address of the Controller operator
    /// @param uri the metadata URI for this token
    function mintController(
        address to,
        string calldata uri
    ) external restricted returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit ControllerMinted(to, tokenId);
        return tokenId;
    }

    /// @notice Burn (revoke) a Controller NFT.
    /// @dev Caller must have JANITOR_ROLE.
    /// @param tokenId the token to burn
    function burnController(uint256 tokenId) external restricted {
        // Clear metadata and burn token
        _burn(tokenId);
        emit ControllerBurned(tokenId);
    }

    /// @notice Set the new metadata URI for a token.
    function setControllerURI(
        uint256 tokenId,
        string calldata uri
    ) external restricted {
        _setTokenURI(tokenId, uri);
    }
}
