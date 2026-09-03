# Hedera Testnet Deployment Results

## Contract Deployment

| Field | Value |
|-------|-------|
| Contract Name | SAMKZkpTokenization |
| Contract ID | 0.0.10346271 |
| EVM Address | 0x5B82D2954c8F0633Fae818754B5301E3939c3B61 |
| Owner Account | 0.0.10119894 |
| Network | Hedera Testnet |
| Deployment Cost | 0.0537 HBAR |
| Block | 40052906 |
| HashScan | https://hashscan.io/testnet/contract/0x5B82D2954c8F0633Fae818754B5301E3939c3B61 |

## ZKP Circuit Results

| Metric | Value |
|--------|-------|
| Circuit File | compliance_samk.circom |
| Constraints | 480 |
| Private Inputs | 10 |
| Public Inputs | 3 |
| Public Output | 1 (eligible) |
| Proof Generation Time | ~650ms |
| Proof Verification Time | ~500ms |
| Setup Ceremony | Local Powers-of-Tau (Phase 1 contributed) |

## ZKP Asset Creation Transaction

| Field | Value |
|-------|-------|
| Transaction Type | ETHEREUM TRANSACTION |
| Contract ID | 0.0.10346271 |
| Sender Account | 0.0.10119894 |
| Block | 40053202 |
| Gas Used | 305,822 |
| Transaction Fee | 0.3425 HBAR (~$0.026) |
| Status | SUCCESS |
| HashScan | https://hashscan.io/testnet/tx/0.0.7314364-1788426953-827368484 |

## Asset Data Stored On-Chain

| Field | Value |
|-------|-------|
| Asset ID | 200001 |
| Title | ZKP-Verified Asset PR-00002 |
| Type | RealEstate |
| Total Shares | 10,000 |
| Price per Share | 1,000,000 tinybars |
| ZKP Verified | true |
| Property Commitment | 3 |
| Policy Hash | 17040030487487993760285496662500321483403604653086755520438909985522392935643 |

## Privacy Properties

- Raw KYC data: NOT stored on-chain
- Property documents: NOT stored on-chain
- Personal images: NOT stored on-chain
- Only stored: commitments, proof hash, verification status

## All Transactions

| # | Type | Block | Fee | Status |
|---|------|-------|-----|--------|
| 1 | ZKP Asset Creation | 40053202 | 0.34 HBAR | SUCCESS |
| 2 | Verifier Authorization | 40053191 | 0.03 HBAR | SUCCESS |
| 3 | ZKP Asset Creation | 40053027 | 0.34 HBAR | SUCCESS |
| 4 | Contract Deployment | 40052906 | 0.05 HBAR | SUCCESS |
