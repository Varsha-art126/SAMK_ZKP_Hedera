// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * ZKP-gated extension of the SAMK ERC-1155 RWA contract.
 *
 * Groth16 verification happens in the authorised off-chain verifier service.
 * This contract stores only public ZK binding values and accepts asset creation
 * exclusively from an authorised verifier after successful verification.
 */
contract SAMKZkpTokenization is ERC1155, Ownable, Pausable {
    struct Asset {
        string assetTitle;
        string assetType;
        address assetOwner;
        uint256 pricePerShare;
        uint256 totalShares;
        uint256 mintedShares;
        string encryptedIpfsCid;
        uint256 propertyCommitment;
        uint256 policyHash;
        uint256 allowedJurisdiction;
        bytes32 proofHash;
        bool zkpVerified;
        bool exists;
    }

    mapping(uint256 => Asset) public assets;
    mapping(address => bool) public authorisedVerifiers;
    mapping(address => bool) public verifiedInvestors;

    event VerifierAuthorisationChanged(address indexed verifier, bool authorised);
    event InvestorVerificationChanged(address indexed investor, bool verified);
    event AssetCreatedWithZkp(
        uint256 indexed assetId,
        address indexed assetOwner,
        uint256 propertyCommitment,
        uint256 policyHash,
        uint256 allowedJurisdiction,
        bytes32 proofHash
    );
    event AssetPurchased(
        uint256 indexed assetId,
        address indexed buyer,
        address indexed seller,
        uint256 sharesBought,
        uint256 totalPaid
    );

    modifier onlyAuthorisedVerifier() {
        require(authorisedVerifiers[msg.sender], "Unauthorised verifier");
        _;
    }

    constructor() ERC1155("ipfs://{id}.json") Ownable(msg.sender) {}

    function setAuthorisedVerifier(address verifier, bool authorised) external onlyOwner {
        require(verifier != address(0), "Invalid verifier");
        authorisedVerifiers[verifier] = authorised;
        emit VerifierAuthorisationChanged(verifier, authorised);
    }

    function setInvestorVerified(address investor, bool verified) external onlyOwner {
        require(investor != address(0), "Invalid investor");
        verifiedInvestors[investor] = verified;
        emit InvestorVerificationChanged(investor, verified);
    }

    struct AssetParams {
        uint256 assetId;
        string assetTitle;
        string assetType;
        address assetOwner;
        uint256 pricePerShare;
        uint256 totalShares;
        string encryptedIpfsCid;
        uint256 propertyCommitment;
        uint256 policyHash;
        uint256 allowedJurisdiction;
        bytes32 proofHash;
    }

    function createAssetWithZkp(AssetParams calldata params)
        external
        onlyAuthorisedVerifier
        whenNotPaused
    {
        require(!assets[params.assetId].exists, "Asset exists");
        require(params.assetOwner != address(0), "Invalid owner");
        require(params.pricePerShare > 0, "Invalid price");
        require(params.totalShares > 0, "Invalid shares");
        require(bytes(params.encryptedIpfsCid).length > 0, "Missing encrypted CID");
        require(params.propertyCommitment != 0, "Missing commitment");
        require(params.policyHash != 0, "Missing policy hash");
        require(params.proofHash != bytes32(0), "Missing proof hash");

        _storeAsset(params);

        emit AssetCreatedWithZkp(
            params.assetId, params.assetOwner, params.propertyCommitment,
            params.policyHash, params.allowedJurisdiction, params.proofHash
        );
    }

    function _storeAsset(AssetParams calldata params) internal {
        assets[params.assetId] = Asset({
            assetTitle: params.assetTitle,
            assetType: params.assetType,
            assetOwner: params.assetOwner,
            pricePerShare: params.pricePerShare,
            totalShares: params.totalShares,
            mintedShares: 0,
            encryptedIpfsCid: params.encryptedIpfsCid,
            propertyCommitment: params.propertyCommitment,
            policyHash: params.policyHash,
            allowedJurisdiction: params.allowedJurisdiction,
            proofHash: params.proofHash,
            zkpVerified: true,
            exists: true
        });
    }

    function buyAssetFraction(uint256 assetId, uint256 sharesToBuy)
        external
        payable
        whenNotPaused
    {
        require(verifiedInvestors[msg.sender], "Investor is not verified");
        Asset storage asset = assets[assetId];
        require(asset.exists && asset.zkpVerified, "Asset is not ZKP approved");
        require(sharesToBuy > 0, "Invalid amount");
        require(asset.mintedShares + sharesToBuy <= asset.totalShares, "Not enough shares");

        uint256 totalCost = asset.pricePerShare * sharesToBuy;
        require(msg.value >= totalCost, "Insufficient HBAR sent");
        asset.mintedShares += sharesToBuy;
        _mint(msg.sender, assetId, sharesToBuy, "");

        (bool sellerPaid, ) = payable(asset.assetOwner).call{value: totalCost}("");
        require(sellerPaid, "HBAR transfer failed");
        if (msg.value > totalCost) {
            (bool refundPaid, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refundPaid, "Refund failed");
        }
        emit AssetPurchased(assetId, msg.sender, asset.assetOwner, sharesToBuy, totalCost);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
