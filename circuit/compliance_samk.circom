pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * SAMK property-onboarding eligibility circuit.
 * Private inputs are authorised off-chain compliance facts. Public inputs bind
 * the proof to the policy, jurisdiction, and property-document commitment.
 */
template SamkComplianceCircuit() {
    // Private compliance witness
    signal input kyc_pass;
    signal input title_valid;
    signal input registry_verified;
    signal input mutation_complete;
    signal input encumbrance_free;
    signal input tax_paid;
    signal input zoning_compliant;
    signal input jurisdiction_eligible;
    signal input jurisdiction_code;
    signal input asset_document_commitment;

    // Public policy and asset-binding values
    signal input allowed_jurisdiction;
    signal input policy_hash;
    signal input property_commitment;

    signal output eligible;

    kyc_pass * (kyc_pass - 1) === 0;
    title_valid * (title_valid - 1) === 0;
    registry_verified * (registry_verified - 1) === 0;
    mutation_complete * (mutation_complete - 1) === 0;
    encumbrance_free * (encumbrance_free - 1) === 0;
    tax_paid * (tax_paid - 1) === 0;
    zoning_compliant * (zoning_compliant - 1) === 0;
    jurisdiction_eligible * (jurisdiction_eligible - 1) === 0;

    jurisdiction_code === allowed_jurisdiction;

    component h = Poseidon(11);
    h.inputs[0] <== kyc_pass;
    h.inputs[1] <== title_valid;
    h.inputs[2] <== registry_verified;
    h.inputs[3] <== mutation_complete;
    h.inputs[4] <== encumbrance_free;
    h.inputs[5] <== tax_paid;
    h.inputs[6] <== zoning_compliant;
    h.inputs[7] <== jurisdiction_eligible;
    h.inputs[8] <== jurisdiction_code;
    h.inputs[9] <== asset_document_commitment;
    h.inputs[10] <== policy_hash;
    property_commitment === h.out;

    signal a1;
    signal a2;
    signal a3;
    signal a4;
    signal a5;
    signal a6;
    signal a7;
    a1 <== kyc_pass * title_valid;
    a2 <== a1 * registry_verified;
    a3 <== a2 * mutation_complete;
    a4 <== a3 * encumbrance_free;
    a5 <== a4 * tax_paid;
    a6 <== a5 * zoning_compliant;
    a7 <== a6 * jurisdiction_eligible;
    eligible <== a7;
    eligible === 1;
}

component main {
    public [property_commitment, policy_hash, allowed_jurisdiction]
} = SamkComplianceCircuit();
