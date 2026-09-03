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

## Components

### 1. ZK Circuit (`compliance_samk.circom`)

Proves 9 compliance checks without revealing private data:
- KYC verification
- Title validity
- Registry verification
- Mutation completion
- Encumbrance status
- Tax payment
- Zoning compliance
- Jurisdiction eligibility
- Document commitment

**Circuit Stats:**
- 480 constraints
- 10 private inputs
- 3 public inputs
- 1 public output (eligible)

### 2. Smart Contract (`SAMKZkpTokenization.sol`)

ERC-1155 contract on Hedera testnet with ZKP approval gate:
- `createAssetWithZkp()` — Creates asset after ZKP verification
- `buyAssetFraction()` — Investors purchase fractional shares
- `setAuthorisedVerifier()` — Owner controls who can verify

**Deployed at:** `0x5B82D2954c8F0633Fae818754B5301E3939c3B61`

### 3. Backend Bridge (`verifyAndOnboard.js`)

Connects ZKP proof to Hedera blockchain:
- Reads Groth16 proof + public signals
- Verifies locally with snarkjs (~500ms)
- Submits to Hedera via JSON-RPC relay

## Results

| Metric | Value |
|--------|-------|
| ZKP Proof Generation | ~650ms |
| ZKP Proof Verification | ~500ms |
| Hedera Transaction Fee | ~0.34 HBAR ($0.026) |
| Smart Contract Deployment | ~0.05 HBAR |
| Total Gas Used (Asset Creation) | 305,822 |

## Hedera Testnet Deployment

- **Contract ID:** `0.0.10346271`
- **Contract Address:** `0x5B82D2954c8F0633Fae818754B5301E3939c3B61`
- **Account ID:** `0.0.10119894`
- **Network:** Hedera Testnet

### Verified Transactions

| Transaction | HashScan Link |
|-------------|---------------|
| Contract Deployment | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426325-305050043) |
| ZKP Asset Creation | [View](https://hashscan.io/testnet/tx/0.0.7314364-1788426953-827368484) |

## Project Structure

```
SAMK_ZKP_Hedera/
├── contracts/
│   └── SAMKZkpTokenization.sol    # ERC-1155 with ZKP gate
├── scripts/
│   ├── deployWithEthers.js        # Deploy to Hedera
│   └── verifyAndOnboard.js        # ZKP verification bridge
├── circuit/
│   └── compliance_samk.circom     # ZK circuit
├── build/
│   ├── SAMKZkpTokenization.abi    # Contract ABI
│   └── SAMKZkpTokenization.bin    # Contract bytecode
├── compile.js                     # Solidity compiler
├── package.json                   # Dependencies
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
