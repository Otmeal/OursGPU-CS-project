// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
/// @notice Controller 授權憑證 (ERC721 NFT)

import 'openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import 'openzeppelin-contracts/contracts/access/manager/AccessManaged.sol';

contract ControllerLicense is ERC721URIStorage, AccessManaged {
    bytes32 public constant ISSUER_ROLE = keccak256('ISSUER_ROLE');
    uint256 private _nextTokenId;

    constructor() ERC721('ControllerLicense', 'CTRL') {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ISSUER_ROLE, msg.sender);
    }

    function issue(address to, string calldata uri) external returns (uint256) {
        require(hasRole(ISSUER_ROLE, msg.sender), 'Must have issuer role');
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    function revoke(uint256 tokenId) external {
        // 只有管理或原發行者可燒毀
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
                _isApprovedOrOwner(msg.sender, tokenId),
            'Not authorized to revoke'
        );
        _burn(tokenId);
    }
}
