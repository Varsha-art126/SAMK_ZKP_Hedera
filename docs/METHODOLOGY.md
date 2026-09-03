# Methodology

## System Overview

This project implements a **privacy-preserving fractional real-estate tokenization** system using the SAMK (Smart Asset Management Kit) framework with Zero-Knowledge Proofs on the Hedera blockchain.

## Problem Statement

Traditional real-estate tokenization requires storing sensitive data (KYC documents, property papers, personal images) directly on-chain. This exposes private information to everyone and creates compliance risks.

## Solution Architecture

Our system uses **Groth16 zk-SNARKs** to prove compliance without revealing any private data.

### Data Flow

```
1. Property Documents (OFF-CHAIN)
   ├── KYC verification (Aadhaar/offline e-KYC)
   ├── Title deed verification
   ├── Registry check
   ├── Tax clearance
   └── Zoning compliance
   
2. AI Assessment (OFF-CHAIN)
   ├── ANN Risk Score
   ├── SHAP Explanation (XAI)
   └── ViT Image Check
   
3. ZK Circuit (compliance_samk.circom)
   ├── 9 compliance checks
   ├── 480 constraints
   └── Poseidon hash commitment
   
4. Groth16 Proof (snarkjs)
   ├── ~262ms proof generation
   ├── ~11ms verification
   └── Output: eligible = 1
   
5. Backend Bridge (verifyAndOnboard.js)
   ├── Verify proof locally
   └── Submit to Hedera
   
6. Hedera Smart Contract (ERC-1155)
   ├── createAssetWithZkp()
   └── Fractional tokens minted
```

## ZK Circuit Design

### Circuit File: `compliance_samk.circom`

The circuit proves 9 compliance checks without revealing private data:

| # | Check | Private Input | Type | Description |
|---|-------|--------------|------|-------------|
| 1 | KYC Verification | `kyc_pass` | Binary | Identity verified |
| 2 | Title Validity | `title_valid` | Binary | Property title valid |
| 3 | Registry Verified | `registry_verified` | Binary | Government registry checked |
| 4 | Mutation Complete | `mutation_complete` | Binary | Property mutation done |
| 5 | Encumbrance Free | `encumbrance_free` | Binary | No liens or mortgages |
| 6 | Tax Paid | `tax_paid` | Binary | All taxes cleared |
| 7 | Zoning Compliant | `zoning_compliant` | Binary |符合 local zoning laws |
| 8 | Jurisdiction Eligible | `jurisdiction_eligible` | Binary | Allowed jurisdiction |
| 9 | Jurisdiction Match | `jurisdiction_code` | Field Element | Must match policy |

### Public Inputs (visible on-chain)

| Input | Description |
|-------|-------------|
| `property_commitment` | Poseidon hash binding all inputs |
| `policy_hash` | Links to compliance policy |
| `allowed_jurisdiction` | Jurisdiction code |

### Constraints

- **480 total constraints**
- Binary constraints: 8 checks × 1 constraint each = 8
- Poseidon hash: 11 inputs → 1 output = ~470 constraints
- Eligibility check: product of 8 flags = 1 = 1 constraint
- Jurisdiction match: 1 constraint

### Eligibility Formula

```
eligible = kyc_pass × title_valid × registry_verified × mutation_complete 
         × encumbrance_free × tax_paid × zoning_compliant × jurisdiction_eligible
```

All 8 flags must be 1 for `eligible = 1`.

## Smart Contract Design

### Contract: `SAMKZkpTokenization.sol`

- **Standard**: ERC-1155 (multi-token)
- **Network**: Hedera Testnet
- **Key Functions**:
  - `createAssetWithZkp()` — Create asset with ZKP verification
  - `buyAssetFraction()` — Buy fractional shares
  - `setAuthorisedVerifier()` — Manage verifier access

### On-Chain Data (Privacy-Preserving)

| Data Type | Stored On-Chain? | Value |
|-----------|------------------|-------|
| KYC Documents | NO | Off-chain only |
| Property Papers | NO | Off-chain only |
| Personal Images | NO | Off-chain only |
| Property Commitment | YES | Poseidon hash |
| Policy Hash | YES | SHA-256 hash |
| Proof Hash | YES | SHA-256 of Groth16 proof |
| Verification Status | YES | Boolean flag |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Circuit Constraints | 480 |
| Proof Generation | ~262ms |
| Proof Verification | ~11ms |
| Gas per TX | ~280,650 |
| Cost per TX | ~0.33 HBAR |

## Privacy Properties

1. **Zero-Knowledge**: Proves compliance without revealing raw data
2. **Commitment Binding**: Poseidon hash binds all inputs
3. **Policy Compliance**: Links proof to specific policy
4. **Jurisdiction Control**: Enforces allowed jurisdictions
5. **Minimal On-Chain Data**: Only commitments stored

## Comparison with Traditional Approach

| Aspect | Traditional | Our ZKP Approach |
|--------|-------------|------------------|
| KYC Storage | On-chain | Off-chain only |
| Privacy | None | Zero-knowledge |
| Verification | Manual | Automated |
| Gas Cost | Higher | Lower |
| Compliance | Optional | Enforced |
