# SAMK ZKP — Privacy-Preserving Fractional Asset Tokenization on Hedera

## Overview

This project extends the SAMK (Smart Asset Management Kit) framework with **Zero-Knowledge Proofs (zk-SNARKs)** to enable privacy-preserving fractional real-estate tokenization on the Hedera blockchain.

### What It Does

1. **AI Assessment**: ANN + SHAP (XAI) + ViT evaluate property eligibility
2. **ZKP Verification**: Groth16 proof validates compliance without revealing private data
3. **Blockchain Integration**: Hedera ERC-1155 smart contract mints fractional tokens

### Key Innovation

Instead of storing raw KYC documents, property papers, and personal data on-chain, this system:
- Keeps all sensitive data **off-chain**
- Generates a **ZK proof** that proves eligibility
- Stores only **commitments and proof hashes** on Hedera

## Architecture

```
KYC + Property Documents (OFF-CHAIN)
         ↓
    ANN Risk Score + SHAP Explanation + ViT Image Check
         ↓
    Deterministic Policy Engine
         ↓
    Groth16 ZK Proof (Circom + snarkjs)
         ↓
    Backend Verifies Proof Locally (~500ms)
         ↓
    Hedera ERC-1155 Smart Contract
         ↓
    Fractional Property Tokens Minted
```

## Hedera Testnet Deployment

| Field | Value |
|-------|-------|
| Contract ID | 0.0.10346271 |
| Contract Address | 0x5B82D2954c8F0633Fae818754B5301E3939c3B61 |
| Account ID | 0.0.10119894 |
| Network | Hedera Testnet |
| Total HBAR Spent | ~2.8 HBAR ($0.21) |

### View on HashScan

| What | Link |
|------|------|
| Contract | [View](https://hashscan.io/testnet/contract/0x5B82D2954c8F0633Fae818754B5301E3939c3B61) |
| Account | [View](https://hashscan.io/testnet/account/0.0.10119894) |
| Deploy TX | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426325-305050043) |
| Asset Creation 1 | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426586-614501470) |
| Verifier Auth | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426931-489197528) |
| Asset Creation 2 | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426953-827368484) |

### Screenshots

See [docs/screenshots/](docs/screenshots/) for HashScan transaction screenshots.

## Results

| Metric | Value |
|--------|-------|
| ZKP Proof Generation | ~650ms |
| ZKP Proof Verification | ~500ms |
| Hedera Transaction Fee | ~0.34 HBAR ($0.026) |
| Smart Contract Deployment | ~0.05 HBAR |
| Total Gas Used (Asset Creation) | 305,822 |

### ZKP Circuit Results

| Metric | Value |
|--------|-------|
| Circuit File | compliance_samk.circom |
| Constraints | 480 |
| Private Inputs | 10 |
| Public Inputs | 3 |
| Compliance Checks | 9 (KYC, title, registry, mutation, encumbrance, tax, zoning, jurisdiction, document) |

## Components

### 1. ZK Circuit (`circuit/compliance_samk.circom`)

Proves 9 compliance checks without revealing private data.

### 2. Smart Contract (`contracts/SAMKZkpTokenization.sol`)

ERC-1155 contract on Hedera testnet with ZKP approval gate.

### 3. Backend Bridge (`scripts/verifyAndOnboard.js`)

Connects ZKP proof to Hedera blockchain via JSON-RPC relay.

## Project Structure

```
SAMK_ZKP_Hedera/
├── contracts/
│   └── SAMKZkpTokenization.sol    # ERC-1155 with ZKP gate
├── circuit/
│   └── compliance_samk.circom     # ZK circuit (480 constraints)
├── scripts/
│   ├── deployWithEthers.js        # Deploy to Hedera
│   └── verifyAndOnboard.js        # ZKP verification bridge
├── build/
│   ├── SAMKZkpTokenization.abi    # Contract ABI
│   └── SAMKZkpTokenization.bin    # Contract bytecode
├── docs/
│   ├── HASHSCAN_LINKS.md          # All transaction links
│   └── screenshots/               # HashScan screenshots
├── compile.js                     # Solidity compiler
├── package.json                   # Dependencies
├── RESULTS.md                     # Detailed results
└── README.md                      # This file
```

## How to Run

### Prerequisites
- Node.js 18+
- Hedera testnet account with HBAR

### Setup
```bash
npm install
node compile.js
```

### Deploy
```bash
# Configure .env with your Hedera credentials
node scripts/deployWithEthers.js
```

### Create Asset with ZKP
```bash
node scripts/verifyAndOnboard.js PR-00001 proof.json public.json
```

## For Paper

This implementation supports the following research contributions:
1. **Privacy-preserving compliance**: ZKPs prove eligibility without exposing private data
2. **AI + ZKP integration**: Neural network assessment feeds into ZK circuit
3. **Hedera-native tokenization**: ERC-1155 fractional shares with low transaction fees
4. **Practical deployment**: End-to-end working system on public blockchain

## License

MIT
