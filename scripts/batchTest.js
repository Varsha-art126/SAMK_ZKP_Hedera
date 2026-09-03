/**
 * batchTest.js — Run 1,200 samples through the SAMK ZKP compliance pipeline.
 *
 * For each sample:
 *   1. Generate random compliance inputs (mix of eligible / ineligible)
 *   2. Compute Poseidon property_commitment
 *   3. Generate Groth16 witness + proof
 *   4. Verify proof locally with snarkjs
 *   5. Record timing and results
 *
 * Usage:
 *   node scripts/batchTest.js [count] [--submit]
 *
 *   count       Number of samples (default 1200)
 *   --submit    Also submit eligible proofs to Hedera on-chain
 *
 * Output:
 *   batch_results.json   — full per-sample results
 *   batch_results.csv    — CSV summary for paper charts
 *   batch_summary.json   — aggregate statistics
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
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
  "17040030487487993760285496662500321483403604653086755520438909985522392935643"; // from existing input

const JURISDICTIONS = Object.values(POLICY.jurisdiction_mapping); // 0-7
const JURISDICTION_NAMES = Object.keys(POLICY.jurisdiction_mapping);

// ── HEDERA CONFIG (only used with --submit) ───────────────────────────
const RPC_URL = "https://testnet.hashio.io/api";
const CONTRACT_ADDRESS =
  process.env.ZKP_CONTRACT_ADDRESS || "0x5B82D2954c8F0633Fae818754B5301E3939c3B61";
let PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY;
if (PRIVATE_KEY) PRIVATE_KEY = PRIVATE_KEY.replace(/^0x/, "");

// ── CLI ARGS ──────────────────────────────────────────────────────────
const TOTAL = parseInt(process.argv[2]) || 1200;
const DO_SUBMIT = process.argv.includes("--submit");

// ── Poseidon helper (circomlibjs) ─────────────────────────────────────
let poseidonInstance;
async function initPoseidon() {
  const { buildPoseidon } = require("circomlibjs");
  poseidonInstance = await buildPoseidon();
}
function poseidonHash(inputs) {
  const h = poseidonInstance(inputs.map(BigInt));
  return poseidonInstance.F.toString(h);
}

// ── Random input generator ────────────────────────────────────────────
function generateSample(index, forceEligible) {
  // Decide eligibility: ~70% eligible, ~30% ineligible for realistic distribution
  const eligible = forceEligible !== undefined ? forceEligible : Math.random() < 0.7;

  let kyc_pass, title_valid, registry_verified, mutation_complete;
  let encumbrance_free, tax_paid, zoning_compliant, jurisdiction_eligible;

  if (eligible) {
    // All compliance flags pass
    kyc_pass = 1;
    title_valid = 1;
    registry_verified = 1;
    mutation_complete = 1;
    encumbrance_free = 1;
    tax_paid = 1;
    zoning_compliant = 1;
    jurisdiction_eligible = 1;
  } else {
    // At least one flag fails (randomly pick 1-4 to fail)
    kyc_pass = 1;
    title_valid = 1;
    registry_verified = 1;
    mutation_complete = 1;
    encumbrance_free = 1;
    tax_paid = 1;
    zoning_compliant = 1;
    jurisdiction_eligible = 1;

    const numFailures = 1 + Math.floor(Math.random() * 4);
    const flags = [
      "kyc_pass", "title_valid", "registry_verified", "mutation_complete",
      "encumbrance_free", "tax_paid", "zoning_compliant", "jurisdiction_eligible",
    ];
    const shuffled = flags.sort(() => Math.random() - 0.5);
    for (let i = 0; i < numFailures; i++) {
      switch (shuffled[i]) {
        case "kyc_pass": kyc_pass = 0; break;
        case "title_valid": title_valid = 0; break;
        case "registry_verified": registry_verified = 0; break;
        case "mutation_complete": mutation_complete = 0; break;
        case "encumbrance_free": encumbrance_free = 0; break;
        case "tax_paid": tax_paid = 0; break;
        case "zoning_compliant": zoning_compliant = 0; break;
        case "jurisdiction_eligible": jurisdiction_eligible = 0; break;
      }
    }
  }

  // Random jurisdiction for this sample
  const jurisdictionCode =
    JURISDICTIONS[Math.floor(Math.random() * JURISDICTIONS.length)];
  // For eligible samples, the allowed jurisdiction must match
  const allowedJurisdiction = eligible ? jurisdictionCode : JURISDICTIONS[(jurisdictionCode + 1) % JURISDICTIONS.length];

  // Random document commitment (large field element)
  const assetDocumentCommitment = BigInt(
    "0x" + crypto.randomBytes(31).toString("hex")
  ).toString();

  return {
    kyc_pass,
    title_valid,
    registry_verified,
    mutation_complete,
    encumbrance_free,
    tax_paid,
    zoning_compliant,
    jurisdiction_eligible,
    jurisdiction_code: jurisdictionCode,
    asset_document_commitment: assetDocumentCommitment,
    allowed_jurisdiction: allowedJurisdiction,
    policy_hash: POLICY_HASH,
    property_commitment: "0", // will be computed
    _eligible: eligible, // ground truth for validation
    _index: index,
  };
}

// ── Compute Poseidon commitment ───────────────────────────────────────
function computeCommitment(sample) {
  // Circuit hashes: [kyc, title, registry, mutation, encumbrance, tax, zoning, jurisdiction_eligible, jurisdiction_code, asset_doc_commitment, policy_hash]
  const commitment = poseidonHash([
    sample.kyc_pass,
    sample.title_valid,
    sample.registry_verified,
    sample.mutation_complete,
    sample.encumbrance_free,
    sample.tax_paid,
    sample.zoning_compliant,
    sample.jurisdiction_eligible,
    sample.jurisdiction_code,
    sample.asset_document_commitment,
    sample.policy_hash,
  ]);
  return commitment;
}

// ── Batch runner ──────────────────────────────────────────────────────
async function runBatch() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         SAMK ZKP Batch Test — 1,200 Sample Pipeline        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`Samples       : ${TOTAL}`);
  console.log(`Submit to链    : ${DO_SUBMIT ? "YES" : "NO (local verification only)"}`);
  console.log(`WASM circuit  : ${WASM_PATH}`);
  console.log(`ZKey          : ${ZKEY_PATH}`);
  console.log(`VK            : ${VK_PATH}`);
  console.log("");

  // Load verification key
  const vKey = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));

  // Init Poseidon
  console.log("[SETUP] Initializing Poseidon hash...");
  await initPoseidon();
  console.log("[SETUP] Poseidon ready.\n");

  const results = [];
  const stats = {
    total: 0,
    eligible_generated: 0,
    ineligible_generated: 0,
    proof_generated: 0,
    proof_failed: 0,
    verification_passed: 0,
    verification_failed: 0,
    onchain_submitted: 0,
    onchain_failed: 0,
    total_generate_time_ms: 0,
    total_verify_time_ms: 0,
    total_witness_time_ms: 0,
    min_generate_time_ms: Infinity,
    max_generate_time_ms: 0,
    min_verify_time_ms: Infinity,
    max_verify_time_ms: 0,
    jurisdiction_distribution: {},
    eligible_distribution: { eligible: 0, ineligible: 0 },
  };

  // Hedera setup if submitting
  let contract = null;
  if (DO_SUBMIT && PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const abi = JSON.parse(
      fs.readFileSync(
        path.join(ZKP_PROJECT, "build", "SAMKZkpTokenization.abi"),
        "utf8"
      )
    );
    contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
    console.log(`[SETUP] Hedera contract connected: ${CONTRACT_ADDRESS}\n`);
  } else if (DO_SUBMIT) {
    console.warn("[WARN] --submit requested but HEDERA_PRIVATE_KEY not set. Skipping chain submission.\n");
  }

  const batchStart = Date.now();

  for (let i = 0; i < TOTAL; i++) {
    const sampleStart = Date.now();

    // 1. Generate random sample
    const sample = generateSample(i);

    // 2. Compute Poseidon commitment
    const commitment = computeCommitment(sample);
    sample.property_commitment = commitment;

    // 3. Build circuit input
    const circuitInput = {
      kyc_pass: sample.kyc_pass,
      title_valid: sample.title_valid,
      registry_verified: sample.registry_verified,
      mutation_complete: sample.mutation_complete,
      encumbrance_free: sample.encumbrance_free,
      tax_paid: sample.tax_paid,
      zoning_compliant: sample.zoning_compliant,
      jurisdiction_eligible: sample.jurisdiction_eligible,
      jurisdiction_code: sample.jurisdiction_code,
      asset_document_commitment: sample.asset_document_commitment,
      allowed_jurisdiction: sample.allowed_jurisdiction,
      policy_hash: sample.policy_hash,
      property_commitment: sample.property_commitment,
    };

    // 4. Generate witness + proof via fullProve (in-memory)
    const witnessStart = Date.now();
    let proofResult;
    try {
      proofResult = await snarkjs.groth16.fullProve(
        circuitInput,
        WASM_PATH,
        ZKEY_PATH
      );
    } catch (err) {
      const witnessTime = Date.now() - witnessStart;
      results.push({
        index: i,
        eligible: false,
        ground_truth_eligible: sample._eligible,
        witness_time_ms: witnessTime,
        generate_time_ms: Date.now() - sampleStart,
        verify_time_ms: 0,
        witness_error: err.message.substring(0, 200),
        proof: null,
        verified: false,
        submitted: false,
        jurisdiction: sample.jurisdiction_code,
        jurisdiction_name: JURISDICTION_NAMES[sample.jurisdiction_code],
        failed_flags: getFailedFlags(sample),
      });
      stats.proof_failed++;
      stats.total_witness_time_ms += witnessTime;
      stats.total_generate_time_ms += Date.now() - sampleStart;
      stats.eligible_distribution.ineligible++;
      const jName = JURISDICTION_NAMES[sample.jurisdiction_code];
      stats.jurisdiction_distribution[jName] =
        (stats.jurisdiction_distribution[jName] || 0) + 1;
      if ((i + 1) % 100 === 0 || i === TOTAL - 1) {
        console.log(
          `  [${String(i + 1).padStart(4)}/${TOTAL}] FAIL (${witnessTime}ms) — ineligible sample`
        );
      }
      continue;
    }
    const witnessTime = Date.now() - witnessStart;
    stats.total_witness_time_ms += witnessTime;
    stats.proof_generated++;

    // 6. Verify proof locally
    const verifyStart = Date.now();
    let verified = false;
    try {
      verified = await snarkjs.groth16.verify(
        vKey,
        proofResult.publicSignals,
        proofResult.proof
      );
    } catch (err) {
      verified = false;
    }
    const verifyTime = Date.now() - verifyStart;
    const generateTime = Date.now() - sampleStart;

    if (verified) stats.verification_passed++;
    else stats.verification_failed++;

    // 7. On-chain submission (optional)
    let submitted = false;
    if (DO_SUBMIT && contract && verified) {
      try {
        const proofHash =
          "0x" +
          crypto.createHash("sha256").update(JSON.stringify(proofResult.proof)).digest("hex");
        const numericId = BigInt(200000 + i);
        const tx = await contract.createAssetWithZkp({
          assetId: numericId,
          assetTitle: `Batch-${String(i).padStart(4, "0")}`,
          assetType: "RealEstate",
          assetOwner: contract.runner.address,
          pricePerShare: 1_000_000,
          totalShares: 10_000,
          encryptedIpfsCid: `ipfs://batch-${i}`,
          propertyCommitment: BigInt(sample.property_commitment),
          policyHash: BigInt(sample.policy_hash),
          allowedJurisdiction: BigInt(sample.allowed_jurisdiction),
          proofHash: proofHash,
        });
        await tx.wait();
        submitted = true;
        stats.onchain_submitted++;
      } catch (err) {
        stats.onchain_failed++;
      }
    }

    // Accumulate stats
    stats.total_generate_time_ms += generateTime;
    stats.total_verify_time_ms += verifyTime;
    stats.min_generate_time_ms = Math.min(stats.min_generate_time_ms, generateTime);
    stats.max_generate_time_ms = Math.max(stats.max_generate_time_ms, generateTime);
    stats.min_verify_time_ms = Math.min(stats.min_verify_time_ms, verifyTime);
    stats.max_verify_time_ms = Math.max(stats.max_verify_time_ms, verifyTime);

    if (sample._eligible) stats.eligible_distribution.eligible++;
    else stats.eligible_distribution.ineligible++;

    const jName = JURISDICTION_NAMES[sample.jurisdiction_code];
    stats.jurisdiction_distribution[jName] =
      (stats.jurisdiction_distribution[jName] || 0) + 1;

    results.push({
      index: i,
      eligible: verified,
      ground_truth_eligible: sample._eligible,
      witness_time_ms: witnessTime,
      generate_time_ms: generateTime,
      verify_time_ms: verifyTime,
      proof: proofResult.proof,
      public_signals: proofResult.publicSignals,
      verified,
      submitted,
      jurisdiction: sample.jurisdiction_code,
      jurisdiction_name: JURISDICTION_NAMES[sample.jurisdiction_code],
      failed_flags: getFailedFlags(sample),
    });

    // Progress logging
    if ((i + 1) % 100 === 0 || i === TOTAL - 1) {
      const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      const rate = ((i + 1) / ((Date.now() - batchStart) / 1000)).toFixed(1);
      console.log(
        `  [${String(i + 1).padStart(4)}/${TOTAL}] ` +
          `verified=${verified} ` +
          `gen=${generateTime}ms verify=${verifyTime}ms ` +
          `| ${elapsed}s elapsed, ${rate} samples/s`
      );
    }
  }

  const totalTime = Date.now() - batchStart;

  // ── Compute summary statistics ──────────────────────────────────────
  const successfulResults = results.filter((r) => r.verified);
  const failedResults = results.filter((r) => !r.verified);

  const summary = {
    experiment: "SAMK ZKP Batch Pipeline",
    timestamp: new Date().toISOString(),
    parameters: {
      total_samples: TOTAL,
      circuit_constraints: 480,
      compliance_checks: 9,
      proof_system: "Groth16",
      curve: "bn128",
    },
    results: {
      total: TOTAL,
      eligible_generated: stats.eligible_distribution.eligible,
      ineligible_generated: stats.eligible_distribution.ineligible,
      proofs_generated: stats.proof_generated,
      proofs_failed: stats.proof_failed,
      verifications_passed: stats.verification_passed,
      verifications_failed: stats.verification_failed,
      onchain_submitted: stats.onchain_submitted,
      success_rate: ((stats.verification_passed / TOTAL) * 100).toFixed(2) + "%",
    },
    performance: {
      total_time_s: (totalTime / 1000).toFixed(2),
      samples_per_second: (TOTAL / (totalTime / 1000)).toFixed(2),
      avg_generate_time_ms: (stats.total_generate_time_ms / TOTAL).toFixed(1),
      avg_witness_time_ms: (stats.total_witness_time_ms / TOTAL).toFixed(1),
      avg_verify_time_ms: (stats.total_verify_time_ms / TOTAL).toFixed(1),
      min_generate_time_ms: stats.min_generate_time_ms === Infinity ? null : stats.min_generate_time_ms,
      max_generate_time_ms: stats.max_generate_time_ms,
      min_verify_time_ms: stats.min_verify_time_ms === Infinity ? null : stats.min_verify_time_ms,
      max_verify_time_ms: stats.max_verify_time_ms,
    },
    jurisdiction_distribution: stats.jurisdiction_distribution,
    eligibility_distribution: stats.eligible_distribution,
  };

  // ── Save outputs ────────────────────────────────────────────────────
  const outputDir = path.join(ZKP_PROJECT, "batch_output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Full results JSON (without proof objects to keep size manageable)
  const slimResults = results.map((r) => ({
    index: r.index,
    eligible: r.eligible,
    ground_truth_eligible: r.ground_truth_eligible,
    witness_time_ms: r.witness_time_ms,
    generate_time_ms: r.generate_time_ms,
    verify_time_ms: r.verify_time_ms,
    verified: r.verified,
    submitted: r.submitted,
    jurisdiction: r.jurisdiction,
    jurisdiction_name: r.jurisdiction_name,
    failed_flags: r.failed_flags,
  }));
  fs.writeFileSync(
    path.join(outputDir, "batch_results.json"),
    JSON.stringify(slimResults, null, 2)
  );

  // Full results with proofs
  fs.writeFileSync(
    path.join(outputDir, "batch_results_with_proofs.json"),
    JSON.stringify(results, null, 2)
  );

  // CSV for paper charts
  const csvHeader =
    "index,eligible,ground_truth_eligible,witness_time_ms,generate_time_ms,verify_time_ms,verified,jurisdiction,jurisdiction_name,failed_flags";
  const csvRows = results.map((r) =>
    [
      r.index,
      r.eligible,
      r.ground_truth_eligible,
      r.witness_time_ms,
      r.generate_time_ms,
      r.verify_time_ms,
      r.verified,
      r.jurisdiction,
      r.jurisdiction_name || "",
      `"${(r.failed_flags || []).join(";")}"`,
    ].join(",")
  );
  fs.writeFileSync(
    path.join(outputDir, "batch_results.csv"),
    csvHeader + "\n" + csvRows.join("\n")
  );

  // Summary JSON
  fs.writeFileSync(
    path.join(outputDir, "batch_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // ── Print summary ───────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    BATCH TEST SUMMARY                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`Total samples     : ${TOTAL}`);
  console.log(`Eligible generated: ${summary.results.eligible_generated}`);
  console.log(`Ineligible gen    : ${summary.results.ineligible_generated}`);
  console.log(`Proofs generated  : ${summary.results.proofs_generated}`);
  console.log(`Proofs failed     : ${summary.results.proofs_failed}`);
  console.log(`Verifications OK  : ${summary.results.verifications_passed}`);
  console.log(`Verifications fail: ${summary.results.verifications_failed}`);
  console.log(`Success rate      : ${summary.results.success_rate}`);
  console.log(`On-chain submitted: ${summary.results.onchain_submitted}`);
  console.log("");
  console.log(`Total time        : ${summary.performance.total_time_s}s`);
  console.log(`Samples/second    : ${summary.performance.samples_per_second}`);
  console.log(`Avg witness time  : ${summary.performance.avg_witness_time_ms}ms`);
  console.log(`Avg generate time : ${summary.performance.avg_generate_time_ms}ms`);
  console.log(`Avg verify time   : ${summary.performance.avg_verify_time_ms}ms`);
  console.log("");
  console.log("Jurisdiction distribution:");
  for (const [j, count] of Object.entries(stats.jurisdiction_distribution)) {
    console.log(`  ${j}: ${count}`);
  }
  console.log("");
  console.log(`Outputs saved to: ${outputDir}/`);
  console.log(`  batch_results.json`);
  console.log(`  batch_results_with_proofs.json`);
  console.log(`  batch_results.csv`);
  console.log(`  batch_summary.json`);
}

function getFailedFlags(sample) {
  const flags = [];
  if (sample.kyc_pass === 0) flags.push("kyc_pass");
  if (sample.title_valid === 0) flags.push("title_valid");
  if (sample.registry_verified === 0) flags.push("registry_verified");
  if (sample.mutation_complete === 0) flags.push("mutation_complete");
  if (sample.encumbrance_free === 0) flags.push("encumbrance_free");
  if (sample.tax_paid === 0) flags.push("tax_paid");
  if (sample.zoning_compliant === 0) flags.push("zoning_compliant");
  if (sample.jurisdiction_eligible === 0) flags.push("jurisdiction_eligible");
  if (sample.jurisdiction_code !== sample.allowed_jurisdiction)
    flags.push("jurisdiction_mismatch");
  return flags;
}

runBatch().catch((err) => {
  console.error("Batch test failed:", err);
  process.exit(1);
});
