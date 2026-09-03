/**
 * onchainSample.js — Submit a small batch of eligible proofs on-chain.
 *
 * Generates 15 eligible samples, proves them, and submits each to Hedera.
 * Captures gas costs, TX hashes, and timing for paper metrics.
 *
 * Usage:
 *   node scripts/onchainSample.js [count]
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");

// ── PATHS ─────────────────────────────────────────────────────────────
const ZKP_ROOT = path.resolve(__dirname, "..", "..");
const ZKP_PROJECT = path.resolve(__dirname, "..");
const WASM_PATH = path.join(ZKP_ROOT, "compliance_samk_js", "compliance_samk.wasm");
const ZKEY_PATH = path.join(ZKP_ROOT, "compliance_samk_safe_final.zkey");
const VK_PATH = path.join(ZKP_ROOT, "verification_key_safe.json");

// ── POLICY ────────────────────────────────────────────────────────────
const POLICY = JSON.parse(
  fs.readFileSync(path.join(ZKP_ROOT, "samk_policy.json"), "utf8")
);
const POLICY_HASH =
  "17040030487487993760285496662500321483403604653086755520438909985522392935643";
const JURISDICTIONS = Object.values(POLICY.jurisdiction_mapping);
const JURISDICTION_NAMES = Object.keys(POLICY.jurisdiction_mapping);

// ── HEDERA CONFIG ─────────────────────────────────────────────────────
const RPC_URL = "https://testnet.hashio.io/api";
const CONTRACT_ADDRESS =
  process.env.ZKP_CONTRACT_ADDRESS || "0x5B82D2954c8F0633Fae818754B5301E3939c3B61";
let PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY;
if (PRIVATE_KEY) PRIVATE_KEY = PRIVATE_KEY.replace(/^0x/, "");

const TOTAL = parseInt(process.argv[2]) || 15;

// ── Poseidon ──────────────────────────────────────────────────────────
let poseidonInstance;
async function initPoseidon() {
  const { buildPoseidon } = require("circomlibjs");
  poseidonInstance = await buildPoseidon();
}
function poseidonHash(inputs) {
  const h = poseidonInstance(inputs.map(BigInt));
  return poseidonInstance.F.toString(h);
}

// ── Generate eligible sample ──────────────────────────────────────────
function generateEligibleSample(index) {
  const jurisdictionCode = JURISDICTIONS[index % JURISDICTIONS.length];
  const assetDocumentCommitment = BigInt(
    "0x" + crypto.randomBytes(31).toString("hex")
  ).toString();

  const sample = {
    kyc_pass: 1,
    title_valid: 1,
    registry_verified: 1,
    mutation_complete: 1,
    encumbrance_free: 1,
    tax_paid: 1,
    zoning_compliant: 1,
    jurisdiction_eligible: 1,
    jurisdiction_code: jurisdictionCode,
    asset_document_commitment: assetDocumentCommitment,
    allowed_jurisdiction: jurisdictionCode,
    policy_hash: POLICY_HASH,
    property_commitment: "0",
  };

  const commitment = poseidonHash([
    sample.kyc_pass, sample.title_valid, sample.registry_verified,
    sample.mutation_complete, sample.encumbrance_free, sample.tax_paid,
    sample.zoning_compliant, sample.jurisdiction_eligible,
    sample.jurisdiction_code, sample.asset_document_commitment,
    sample.policy_hash,
  ]);
  sample.property_commitment = commitment;
  return sample;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         On-Chain Sample Submission — Hedera Testnet         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`Samples      : ${TOTAL} eligible proofs`);
  console.log(`Contract     : ${CONTRACT_ADDRESS}`);
  console.log(`Network      : Hedera Testnet`);
  console.log("");

  // Setup
  await initPoseidon();
  const vKey = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));

  // Hedera connection
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const abi = JSON.parse(
    fs.readFileSync(path.join(ZKP_PROJECT, "build", "SAMKZkpTokenization.abi"), "utf8")
  );
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Owner       : ${wallet.address}`);
  console.log(`Balance     : ${ethers.formatEther(balance)} HBAR`);
  console.log("");

  // Estimate gas for a single call first
  const testSample = generateEligibleSample(0);
  const testProof = await snarkjs.groth16.fullProve(testSample, WASM_PATH, ZKEY_PATH);
  const testProofHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(testProof.proof)).digest("hex");

  try {
    const estGas = await contract.createAssetWithZkp.estimateGas({
      assetId: BigInt(300000),
      assetTitle: "Gas-estimate",
      assetType: "RealEstate",
      assetOwner: wallet.address,
      pricePerShare: 1_000_000,
      totalShares: 10_000,
      encryptedIpfsCid: "ipfs://gas-estimate",
      propertyCommitment: BigInt(testSample.property_commitment),
      policyHash: BigInt(testSample.policy_hash),
      allowedJurisdiction: BigInt(testSample.allowed_jurisdiction),
      proofHash: testProofHash,
    });
    console.log(`[SETUP] Estimated gas per TX: ${estGas.toString()}`);
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const estCostWei = estGas * gasPrice;
    console.log(`[SETUP] Estimated cost per TX: ${ethers.formatEther(estCostWei)} HBAR`);
    console.log(`[SETUP] Estimated total cost (${TOTAL} TXs): ${ethers.formatEther(estCostWei * BigInt(TOTAL))} HBAR`);
    console.log("");
  } catch (e) {
    console.warn("[WARN] Gas estimation failed:", e.message?.substring(0, 200));
    console.log("[SETUP] Proceeding anyway...\n");
  }

  // ── Submit batch ──────────────────────────────────────────────────
  const results = [];
  let totalGasUsed = BigInt(0);
  let totalGasCost = BigInt(0);
  let successCount = 0;
  let failCount = 0;
  const gasPrices = [];

  const batchStart = Date.now();

  for (let i = 0; i < TOTAL; i++) {
    const sample = generateEligibleSample(i);
    const txStart = Date.now();

    try {
      // Generate proof
      const proveStart = Date.now();
      const proofResult = await snarkjs.groth16.fullProve(sample, WASM_PATH, ZKEY_PATH);
      const proveTime = Date.now() - proveStart;

      // Verify locally first
      const verified = await snarkjs.groth16.verify(
        vKey, proofResult.publicSignals, proofResult.proof
      );
      if (!verified) throw new Error("Local verification failed");

      // Submit on-chain
      const proofHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(proofResult.proof)).digest("hex");
      const numericId = BigInt(300000 + i);

      const submitStart = Date.now();
      const tx = await contract.createAssetWithZkp({
        assetId: numericId,
        assetTitle: `OnChain-${String(i).padStart(4, "0")}`,
        assetType: "RealEstate",
        assetOwner: wallet.address,
        pricePerShare: 1_000_000,
        totalShares: 10_000,
        encryptedIpfsCid: `ipfs://onchain-sample-${i}`,
        propertyCommitment: BigInt(sample.property_commitment),
        policyHash: BigInt(sample.policy_hash),
        allowedJurisdiction: BigInt(sample.allowed_jurisdiction),
        proofHash: proofHash,
      });

      console.log(`  [${String(i + 1).padStart(2)}/${TOTAL}] TX submitted: ${tx.hash.substring(0, 18)}...`);

      const receipt = await tx.wait();
      const txTime = Date.now() - submitStart;
      const totalTime = Date.now() - txStart;

      const gasUsed = receipt.gasUsed;
      const txGasPrice = (await provider.getTransaction(tx.hash)).gasPrice || (await provider.getFeeData()).gasPrice;
      const gasCost = gasUsed * txGasPrice;

      totalGasUsed += gasUsed;
      totalGasCost += gasCost;
      gasPrices.push(Number(txGasPrice));
      successCount++;

      results.push({
        index: i,
        tx_hash: tx.hash,
        block_number: receipt.blockNumber,
        gas_used: gasUsed.toString(),
        gas_price_wei: txGasPrice.toString(),
        gas_cost_wei: gasCost.toString(),
        gas_cost_hbar: ethers.formatEther(gasCost),
        prove_time_ms: proveTime,
        submit_time_ms: txTime,
        total_time_ms: totalTime,
        status: "SUCCESS",
        jurisdiction: JURISDICTION_NAMES[sample.jurisdiction_code],
      });

      console.log(`           Block: ${receipt.blockNumber} | Gas: ${gasUsed.toString()} | Time: ${totalTime}ms`);

    } catch (err) {
      failCount++;
      const totalTime = Date.now() - txStart;
      results.push({
        index: i,
        tx_hash: null,
        error: err.message?.substring(0, 200),
        total_time_ms: totalTime,
        status: "FAILED",
      });
      console.log(`  [${String(i + 1).padStart(2)}/${TOTAL}] FAILED: ${err.message?.substring(0, 80)}`);
    }
  }

  const batchTime = Date.now() - batchStart;

  // ── Summary ───────────────────────────────────────────────────────
  const avgGas = successCount > 0 ? (Number(totalGasUsed) / successCount).toFixed(0) : 0;
  const avgCost = successCount > 0 ? (Number(totalGasCost) / successCount) : 0;
  const avgGasPrice = gasPrices.length > 0 ? (gasPrices.reduce((a, b) => a + b, 0) / gasPrices.length).toFixed(0) : 0;

  const summary = {
    experiment: "SAMK ZKP On-Chain Submission Sample",
    timestamp: new Date().toISOString(),
    network: "hedera-testnet",
    contract_address: CONTRACT_ADDRESS,
    owner: wallet.address,
    parameters: {
      total_submitted: TOTAL,
      proof_system: "Groth16",
      curve: "bn128",
    },
    results: {
      total: TOTAL,
      successful: successCount,
      failed: failCount,
      success_rate: ((successCount / TOTAL) * 100).toFixed(1) + "%",
    },
    gas_metrics: {
      total_gas_used: totalGasUsed.toString(),
      avg_gas_per_tx: avgGas,
      total_gas_cost_hbar: ethers.formatEther(totalGasCost),
      avg_gas_cost_hbar: ethers.formatEther(BigInt(Math.round(avgCost))),
      avg_gas_price_wei: avgGasPrice,
      estimated_1200_cost_hbar: ethers.formatEther(BigInt(Math.round(avgCost * 1200))),
    },
    timing: {
      total_time_s: (batchTime / 1000).toFixed(1),
      avg_time_per_tx_ms: (batchTime / TOTAL).toFixed(0),
    },
    per_tx_results: results,
  };

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                  ON-CHAIN SAMPLE SUMMARY                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`Successful     : ${successCount}/${TOTAL}`);
  console.log(`Failed         : ${failCount}/${TOTAL}`);
  console.log(`Total gas used : ${totalGasUsed.toString()}`);
  console.log(`Avg gas/tx     : ${avgGas}`);
  console.log(`Total cost     : ${ethers.formatEther(totalGasCost)} HBAR`);
  console.log(`Avg cost/tx    : ${ethers.formatEther(BigInt(Math.round(avgCost)))} HBAR`);
  console.log(`Est. 1,200 cost: ${ethers.formatEther(BigInt(Math.round(avgCost * 1200)))} HBAR`);
  console.log(`Total time     : ${(batchTime / 1000).toFixed(1)}s`);
  console.log(`Avg time/tx    : ${(batchTime / TOTAL).toFixed(0)}ms`);

  // Save
  const outDir = path.join(ZKP_PROJECT, "batch_output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "onchain_sample_summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nSaved to: ${outDir}/onchain_sample_summary.json`);
}

main().catch((err) => {
  console.error("On-chain sample failed:", err.message || err);
  process.exit(1);
});
