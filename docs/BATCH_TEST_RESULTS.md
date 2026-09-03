# Batch Test Results — 1,200 Samples

## Experiment Overview

| Parameter | Value |
|-----------|-------|
| Total Samples | 1,200 |
| Circuit | compliance_samk.circom |
| Constraints | 480 |
| Compliance Checks | 9 |
| Proof System | Groth16 |
| Curve | BN128 |
| Date | September 3, 2026 |

## Results Summary

| Metric | Result |
|--------|--------|
| Eligible Generated | 841 (70.08%) |
| Ineligible Generated | 359 (29.92%) |
| Proofs Generated | 841 |
| Proofs Failed (ineligible) | 359 |
| Verifications Passed | **841 (100%)** |
| Verifications Failed | **0** |
| False Negatives | **0** |
| Success Rate | 70.08% (matches expected distribution) |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total Time | 455.6s (~7.6 min) |
| Throughput | 2.63 samples/sec |
| Avg Proof Generation | 379.6ms |
| Avg Witness Computation | 367.7ms |
| Avg Verification | 11.1ms |
| Min Generate | 169ms |
| Max Generate | 140s (cold start) |
| Min Verify | 4ms |
| Max Verify | 51ms |

## Jurisdiction Distribution

| Jurisdiction | Count |
|--------------|-------|
| Maharashtra | 140 |
| Karnataka | 147 |
| Delhi | 152 |
| Gujarat | 160 |
| Rajasthan | 165 |
| Uttar Pradesh | 150 |
| Telangana | 141 |
| Chandigarh | 145 |

## Key Findings

1. **100% Verification Accuracy**: Every eligible sample that generated a proof passed verification
2. **Zero False Negatives**: No eligible samples were incorrectly rejected
3. **Expected Failure Rate**: 359 failures are all ineligible samples (correct behavior)
4. **Consistent Performance**: Proof generation time stable across samples
5. **Even Distribution**: All 8 jurisdictions represented

## Output Files

| File | Description |
|------|-------------|
| `batch_results.csv` | Per-sample results for chart generation |
| `batch_results.json` | Full results (slim) |
| `batch_results_with_proofs.json` | Full results with Groth16 proofs |
| `batch_summary.json` | Aggregate statistics |

## Charts

| Figure | Description |
|--------|-------------|
| `fig1_eligibility_distribution.png` | Pie chart: eligible vs ineligible |
| `fig2_proof_generation_time.png` | Histogram of proof generation times |
| `fig3_verification_time.png` | Histogram of verification times |
| `fig4_jurisdiction_distribution.png` | Bar chart across 8 states |
| `fig5_cumulative_time.png` | Cumulative proof generation time |
