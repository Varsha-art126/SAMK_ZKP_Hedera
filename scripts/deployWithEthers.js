/**
 * Deploy SAMKZkpTokenization using ethers.js via Hedera JSON-RPC relay.
 * This bypasses the Hedera SDK clock-sync issue.
 *
 * Usage: node scripts/deployWithEthers.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = "https://testnet.hashio.io/api";
const PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY.replace(/^0x/, "");

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("=== Hedera JSON-RPC Deploy ===");
  console.log("Relay  :", RPC_URL);
  console.log("Account:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "HBAR");

  // Load ABI and bytecode
  const abiPath = path.join(__dirname, "..", "build", "SAMKZkpTokenization.abi");
  const binPath = path.join(__dirname, "..", "build", "SAMKZkpTokenization.bin");

  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const bytecode = "0x" + fs.readFileSync(binPath, "utf8").trim();

  console.log("\nBytecode size:", bytecode.length / 2 - 1, "bytes");
  console.log("Deploying...");

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  console.log("TX hash:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\nContract deployed!");
  console.log("Address:", contractAddress);

  // Hedera contract ID from EVM address
  const evmNo0x = contractAddress.slice(2);
  const hederaNum = parseInt(evmNo0x, 16);
  const hederaContractId = `0.0.${hederaNum}`;

  console.log("Hedera Contract ID:", hederaContractId);
  console.log("");
  console.log("Add to .env:");
  console.log(`  ZKP_CONTRACT_ID=${hederaContractId}`);

  // Save deployment info
  const info = {
    contractAddress,
    hederaContractId,
    deployer: wallet.address,
    network: "hedera-testnet",
    rpcUrl: RPC_URL,
    timestamp: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log("\nDeployment info saved to deployment.json");

  // Verify it works by reading owner
  const contractRead = new ethers.Contract(contractAddress, abi, provider);
  try {
    const owner = await contractRead.owner();
    console.log("Owner:", owner);
  } catch {
    console.log("(owner() not readable yet, contract may need confirmations)");
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err.message || err);
  process.exit(1);
});
