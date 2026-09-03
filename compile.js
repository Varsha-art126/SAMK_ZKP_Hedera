const solc = require("solc");
const fs = require("fs");
const path = require("path");

const contractPath = path.resolve(__dirname, "contracts/SAMKZkpTokenization.sol");
const contractSource = fs.readFileSync(contractPath, "utf8");

// Resolve all import paths from node_modules
function findImports(importPath) {
    const resolved = path.resolve(__dirname, "node_modules", importPath);
    try {
        return { contents: fs.readFileSync(resolved, "utf8") };
    } catch {
        // Try relative to contracts folder
        const alt = path.resolve(__dirname, "contracts", importPath);
        try {
            return { contents: fs.readFileSync(alt, "utf8") };
        } catch {
            return { error: `File not found: ${importPath}` };
        }
    }
}

const input = {
    language: "Solidity",
    sources: {
        "SAMKZkpTokenization.sol": { content: contractSource },
    },
    settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        outputSelection: {
            "*": {
                "*": ["abi", "evm.bytecode"],
            },
        },
    },
};

console.log("Compiling SAMKZkpTokenization.sol with viaIR=true ...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
        console.error("Compilation errors:");
        errors.forEach((e) => console.error(e.formattedMessage));
        process.exit(1);
    }
    // Warnings only
    output.errors.filter((e) => e.severity === "warning").forEach((w) => console.warn(w.formattedMessage));
}

const contracts = output.contracts;
const buildDir = path.resolve(__dirname, "build");
fs.mkdirSync(buildDir, { recursive: true });

let compiled = 0;
for (const file of Object.keys(contracts)) {
    for (const name of Object.keys(contracts[file])) {
        const contract = contracts[file][name];
        const abiPath = path.join(buildDir, `${name}.abi`);
        const binPath = path.join(buildDir, `${name}.bin`);
        fs.writeFileSync(abiPath, JSON.stringify(contract.abi, null, 2));
        fs.writeFileSync(binPath, contract.evm.bytecode.object);
        console.log(`  -> ${name}.abi (${contract.abi.length} entries)`);
        console.log(`  -> ${name}.bin (${contract.evm.bytecode.object.length / 2} bytes)`);
        compiled++;
    }
}

console.log(`\nCompiled ${compiled} contract(s) successfully in ${buildDir}`);
