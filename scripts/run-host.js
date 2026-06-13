/**
 * Launches the Extension Host manually for Developer Mode.
 * 
 * Prerequisites:
 * 1. Enable Developer Mode in Live's Preferences → Extensions
 * 2. Live must be running and waiting for an Extension Host connection
 * 3. Run this script: node scripts/run-host.js
 * 
 * After making changes: Ctrl+C this script, rebuild, re-run it.
 * Live stays open — the Extension Host reconnects automatically.
 */
const { execSync, spawn } = require("child_process");
const path = require("path");

const NODE_EXE = "C:\\ProgramData\\Ableton\\Live 12 Beta\\Program\\ExtensionHost\\node.exe";
const HOST_MODULE = "C:\\ProgramData\\Ableton\\Live 12 Beta\\Program\\ExtensionHost\\ExtensionHostNodeModule.node";
const EXTENSION_DIR = path.resolve(__dirname, "..");

// The Extension Host is loaded as a native Node addon.
// extensions-cli run essentially does:
//   node -e "require('<HOST_MODULE>').start({ extensions: ['<path>'], ... })"
// But the exact API is undocumented. This is a best-effort attempt.

const script = `
const host = require(${JSON.stringify(HOST_MODULE)});
console.log("[Dev] Extension Host module loaded. Keys:", Object.keys(host));
// Attempt to start with our extension
if (typeof host.start === 'function') {
  host.start({ extensions: [${JSON.stringify(EXTENSION_DIR)}] });
} else if (typeof host.run === 'function') {
  host.run({ extensions: [${JSON.stringify(EXTENSION_DIR)}] });
} else {
  console.log("[Dev] Could not find start/run function. Module exports:", host);
}
`;

console.log("[Dev] Starting Extension Host...");
console.log("[Dev] Node:", NODE_EXE);
console.log("[Dev] Host Module:", HOST_MODULE);
console.log("[Dev] Extension:", EXTENSION_DIR);

const child = spawn(NODE_EXE, ["-e", script], {
  stdio: "inherit",
  cwd: EXTENSION_DIR,
});

child.on("exit", (code) => {
  console.log(`[Dev] Extension Host exited with code ${code}`);
});
