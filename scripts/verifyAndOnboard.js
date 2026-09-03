/**
 * ZKP Verification Bridge (ethers.js version)
 *
 * Flow:
 *   1. Read proof + public signals from the notebook's output
 *   2. Verify the Groth16 proof locally with snarkjs
 *   3. If valid, call createAssetWithZkp() on Hedera via JSON-RPC relay
 *
 * Usage:
 *   node scripts/verifyAndOnboard.js <asset_id> <proof_json> <public_json>
 *
 * Example:
 *   node scripts/verifyAndOnboard.js PR-00001 ../proof_eligible_safe.json ../public_eligible_safe.json
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");

// ── CONFIG ───────────────────────────────────────────────────────────
const RPC_URL = "https://testnet.hashio.io/api";
const PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY.replace(/^0x/, "");
const CONTRACT_ADDRESS = process.env.ZKP_CONTRACT_ADDRESS || "0x5B82D2954c8F0633Fae818754B5301E3939c3B61";
const ZKP_DIR = path.resolve(__dirname, "..", "..");
const VK_PATH = path.join(ZKP_DIR, "verification_key_safe.json");

// ── ASSET CONFIG (customize per asset) ───────────────────────────────
const DEFAULT_ASSET = {
  assetType: "RealEstate",
  pricePerShare: 1_000_000, // tinybars per share
  totalShares: 10_000,
  encryptedIpfsCid: "ipfs://QmPlaceholderEncryptedCid",
};

// ── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const assetIdArg = process.argv[2] || `PR-${Date.now()}`;
  const proofPath = process.argv[3] || path.join(ZKP_DIR, "proof_eligible_safe.json");
  const publicPath = process.argv[4] || path.join(ZKP_DIR, "public_eligible_safe.json");

  // 1. Load proof artifacts
  const vKey = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));

  console.log("=== ZKP Verification Bridge ===");
  console.log("Asset ID       :", assetIdArg);
  console.log("Proof file     :", proofPath);
  console.log("Public signals :", publicSignals);

  // 2. Verify Groth16 proof locally
  console.log("\n[1/3] Verifying Groth16 proof...");
  const startVerify = Date.now();
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  const verifyTime = Date.now() - startVerify;

  if (!valid) {
    console.error("FAILED: Groth16 proof is invalid.");
    process.exit(1);
  }
  console.log(`PASSED: Proof verified in ${verifyTime}ms`);

  // 3. Extract public signals
  // Circuit order: [eligible, property_commitment, policy_hash, allowed_jurisdiction]
  const eligible = publicSignals[0];
  const propertyCommitment = publicSignals[1];
  const policyHash = publicSignals[2];
  const allowedJurisdiction = publicSignals[3];

  if (eligible !== "1") {
    console.error("FAILED: eligible != 1");
    process.exit(1);
  }
  console.log("eligible            :", eligible);
  console.log("property_commitment :", propertyCommitment);
  console.log("policy_hash         :", policyHash);
  console.log("allowed_jurisdiction:", allowedJurisdiction);

  // 4. Compute proof hash
  const proofHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(proof)).digest("hex");

  // 5. Connect to contract via ethers.js
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const abiPath = path.join(__dirname, "..", "build", "SAMKZkpTokenization.abi");
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  // 6. Convert asset ID to uint256
  const numericId = BigInt(assetIdArg.replace(/\D/g, "") || Date.now());

  console.log("\n[2/3] Submitting createAssetWithZkp to Hedera...");
  console.log("Numeric asset ID:", numericId.toString());
  console.log("Proof hash      :", proofHash);

  const tx = await contract.createAssetWithZkp({
    assetId: numericId,
    assetTitle: `ZKP-Verified Asset ${assetIdArg}`,
    assetType: DEFAULT_ASSET.assetType,
    assetOwner: wallet.address,
    pricePerShare: DEFAULT_ASSET.pricePerShare,
    totalShares: DEFAULT_ASSET.totalShares,
    encryptedIpfsCid: DEFAULT_ASSET.encryptedIpfsCid,
    propertyCommitment: BigInt(propertyCommitment),
    policyHash: BigInt(policyHash),
    allowedJurisdiction: BigInt(allowedJurisdiction),
    proofHash: proofHash,
  });

  console.log("TX hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();

  console.log("\n[3/3] Asset created on Hedera!");
  console.log("Block number  :", receipt.blockNumber);
  console.log("Gas used      :", receipt.gasUsed.toString());
  console.log("Status        :", receipt.status === 1 ? "SUCCESS" : "FAILED");

  // 7. Print and save the on-chain payload
  const payload = {
    asset_id: assetIdArg,
    numeric_id: numericId.toString(),
    encrypted_ipfs_cid: DEFAULT_ASSET.encryptedIpfsCid,
    property_commitment: propertyCommitment,
    policy_hash: policyHash,
    allowed_jurisdiction: Number(allowedJurisdiction),
    proof_hash: proofHash,
    zk_verified: true,
    tx_hash: tx.hash,
    block_number: receipt.blockNumber,
    gas_used: receipt.gasUsed.toString(),
    verify_time_ms: verifyTime,
    contract_address: CONTRACT_ADDRESS,
    network: "hedera-testnet",
  };

  console.log("\n=== On-chain payload ===");
  console.log(JSON.stringify(payload, null, 2));

  // Save payload
  const outPath = path.join(ZKP_DIR, `onboarded_${assetIdArg}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch((err) => {
  console.error("Onboarding failed:", err.message || err);
  process.exit(1);
});
