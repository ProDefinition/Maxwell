/*
 * Maxwell Master Controller v2026 – Zero‑install LLM Launcher for Termux
 * Automatically detects existing llama.cpp builds and reused compiled binaries.
 * No manual setup required; simply run: node maxwell.js
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOME = process.env.HOME;

// Possible locations where an existing llama.cpp repo might live
const REPO_PATHS = [
  path.join(HOME, 'llama.cpp'),         // from original command
  path.join(HOME, 'maxwell-llama')      // our dedicated dir
];

// Possible locations of the compiled binaries
const CLI_CANDIDATES = [
  path.join(HOME, 'llama-cli'),
  path.join(HOME, 'maxwell-llama', 'llama-cli'),
  path.join(HOME, 'llama.cpp', 'build', 'bin', 'llama-cli')
];
const SERVER_CANDIDATES = [
  path.join(HOME, 'llama-server'),
  path.join(HOME, 'maxwell-llama', 'llama-server'),
  path.join(HOME, 'llama.cpp', 'build', 'bin', 'llama-server')
];

const MODELS = {
  "1": { name: "AMD ReasonLite (0.6B)",  hf: "AMD/ReasonLite-0.6B-GGUF:Q4_K_M",        desc: "Logical powerhouse. Rivals 8B models in math/logic." },
  "2": { name: "SmolLM2 Agentic (360M)",  hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", desc: "Best for tool-calling/JSON. Strict follower." },
  "3": { name: "LFM 2.5 Text (350M)",     hf: "LiquidAI/LFM2.5-350M-GGUF:Q4_0",        desc: "Extreme speed. Snappy 2026 responses." },
  "4": { name: "LFM 2.5 Vision (450M)",   hf: "LiquidAI/LFM2.5-VL-450M-GGUF:Q4_0",     desc: "For visual/OCR tasks." },
  "5": { name: "LFM 2.5 Thinking (1.2B)", hf: "LiquidAI/LFM2.5-1.2B-Thinking-GGUF:Q4_K_M", desc: "Reflective logic; higher intelligence tier." },
  "6": { name: "LFM2 2.6B Exp",           hf: "LiquidAI/LFM2-2.6B-Exp-GGUF:Q4_K_M",    desc: "Heavy flagship for complex agents." }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Helper to run a shell command synchronously with progress
function runCommand(desc, cmd) {
  console.log(`\n>> ${desc}...`);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (e) {
    console.error(`\n[ERROR] Failed during: ${desc}`);
    console.error(e.message);
    process.exit(1);
  }
}

// Check if a command exists in PATH
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Find the first existing file from a list of candidates
function findExisting(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ------------------------------------------------------------------
// Phase 0: Environment Detection & Setup
async function ensureEnvironment() {
  console.clear();
  console.log("--- Maxwell Master Controller v2026 ---\n");

  // 1. Locate existing binaries (fast path)
  let cliPath = findExisting(CLI_CANDIDATES);
  let serverPath = findExisting(SERVER_CANDIDATES);
  let repoPath = findExisting(REPO_PATHS);

  // If we already have both binaries, we're done – no build needed
  if (cliPath && serverPath) {
    console.log("[✓] Existing binaries detected:");
    console.log(`    llama-cli    → ${cliPath}`);
    console.log(`    llama-server → ${serverPath}`);
    return { cli: cliPath, server: serverPath };
  }

  // If only llama-cli exists but server is missing
  if (cliPath && !serverPath && repoPath) {
    console.log("[✓] Found llama-cli but no llama-server. Copying server from existing build...");
    const builtServer = path.join(repoPath, 'build', 'bin', 'llama-server');
    if (fs.existsSync(builtServer)) {
      const destServer = path.join(HOME, 'llama-server'); // friendly location
      fs.copyFileSync(builtServer, destServer);
      fs.chmodSync(destServer, '755');
      serverPath = destServer;
      console.log(`[✓] llama-server installed → ${destServer}`);
      return { cli: cliPath, server: serverPath };
    } else {
      console.log("[!] Server binary not found in existing build. Cloud mode will be unavailable.");
      return { cli: cliPath, server: null };
    }
  }

  // If nothing useful found, perform a minimal install
  console.log("[!] No existing build found. Starting fresh installation (this may take a while)...");

  // Ensure basic dependencies
  runCommand(
    "Installing system dependencies",
    "pkg update -y && pkg upgrade -y && pkg install -y git cmake clang wget libandroid-spawn cloudflared python"
  );
  if (!commandExists('huggingface-cli')) {
    runCommand("Installing huggingface-hub", "pip install huggingface-hub");
  } else {
    console.log("[✓] huggingface-hub already installed.");
  }

  // Use dedicated directory if no repo exists
  if (!repoPath) {
    repoPath = path.join(HOME, 'maxwell-llama');
    runCommand("Cloning llama.cpp", `git clone https://github.com/ggml-org/llama.cpp ${repoPath}`);
  } else {
    console.log(`[✓] Using existing repository at ${repoPath}`);
  }

  // Build if binaries are absent
  const builtCli = path.join(repoPath, 'build', 'bin', 'llama-cli');
  const builtServer = path.join(repoPath, 'build', 'bin', 'llama-server');
  if (!fs.existsSync(builtCli) || !fs.existsSync(builtServer)) {
    runCommand("Building binaries", `cd ${repoPath} && cmake -B build && cmake --build build --config Release -j8`);
  }

  // Install to home
  if (!cliPath && fs.existsSync(builtCli)) {
    cliPath = path.join(HOME, 'llama-cli');
    fs.copyFileSync(builtCli, cliPath);
    fs.chmodSync(cliPath, '755');
  }
  if (!serverPath && fs.existsSync(builtServer)) {
    serverPath = path.join(HOME, 'llama-server');
    fs.copyFileSync(builtServer, serverPath);
    fs.chmodSync(serverPath, '755');
  }

  console.log("[✓] Setup complete.\n");
  return { cli: cliPath, server: serverPath };
}

// ------------------------------------------------------------------
// Phase 2: Model selection
function selectModel() {
  console.log("[ SELECT MODEL ]");
  Object.entries(MODELS).forEach(([key, model]) => {
    console.log(`${key}: ${model.name.padEnd(28)} | ${model.desc}`);
  });

  rl.question("\nPick a number (or 'q' to quit): ", (choice) => {
    if (choice.toLowerCase() === 'q') {
      console.log("Goodbye!");
      process.exit(0);
    }
    const model = MODELS[choice];
    if (!model) {
      console.log("Invalid choice. Try again.");
      return selectModel();
    }
    selectLaunchMode(model);
  });
}

// ------------------------------------------------------------------
// Phase 3: Launch mode selection
function selectLaunchMode(model, { cli, server }) {
  console.log("\n[ SELECT LAUNCH MODE ]");
  console.log("1: Terminal Chat (Fastest, local interactivity)");
  if (server) {
    console.log("2: Cloud via Cloudflare (Access from any browser)");
  } else {
    console.log("2: Cloud mode UNAVAILABLE (llama-server not found)");
  }
  console.log("3: Back to model selection");

  rl.question("\nPick a mode: ", (choice) => {
    if (choice === '1') launchTerminal(model, cli);
    else if (choice === '2' && server) launchCloud(model, server);
    else if (choice === '2') {
      console.log("Cloud mode cannot be started without llama-server.");
      selectLaunchMode(model, { cli, server });
    }
    else if (choice === '3') selectModel();
    else {
      console.log("Invalid choice.");
      selectLaunchMode(model, { cli, server });
    }
  });
}

// ------------------------------------------------------------------
// Terminal Chat mode
function launchTerminal(model, cliPath) {
  console.log(`\nLaunching Maxwell Terminal with ${model.name}...`);
  console.log("(Type /exit to quit)\n");

  const chat = spawn(cliPath, [
    '-hf', model.hf,
    '-t', '8',
    '-ub', '512',
    '--mlock',
    '-cnv',
    '-p', `"You are Maxwell, a helpful and natural assistant."`
  ], {
    stdio: 'inherit',
    shell: true
  });

  chat.on('error', (err) => {
    console.error(`[ERROR] Failed to start llama-cli: ${err.message}`);
    process.exit(1);
  });

  chat.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[ERROR] llama-cli exited with code ${code}`);
    }
    console.log("\nChat ended. Returning to menu...");
    start();
  });
}

// ------------------------------------------------------------------
// Cloud mode
function launchCloud(model, serverPath) {
  console.log(`\n[1/2] Starting API server with ${model.name}...`);

  const server = spawn(serverPath, [
    '-hf', model.hf,
    '-t', '8',
    '-c', '2048',
    '--mlock',
    '--port', '8080'
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  let tunnelStarted = false;

  server.stdout.on('data', (data) => {
    const text = data.toString();
    if (!tunnelStarted && text.includes("HTTP server listening")) {
      tunnelStarted = true;
      console.log("[2/2] Server live on port 8080. Opening Cloudflare Tunnel...");

      const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8080'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      tunnel.stdout.on('data', (tData) => {
        const out = tData.toString();
        const match = out.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
        if (match) {
          const url = match[0];
          console.log("\n" + "=".repeat(60));
          console.log("MAXWELL CLOUD ACCESS READY");
          console.log("LINK: " + url);
          console.log("Open this URL in any browser to chat with Maxwell.");
          console.log("=".repeat(60) + "\n");
          console.log("(Press Ctrl+C to stop the server and tunnel)\n");
        }
      });

      tunnel.stderr.on('data', (err) => console.error("[Tunnel Error]", err.toString()));
      tunnel.on('error', (err) => {
        console.error(`[ERROR] Cloudflare tunnel failed: ${err.message}`);
        server.kill();
        process.exit(1);
      });
      tunnel.on('exit', (code) => {
        console.log(`Tunnel closed (exit code ${code}). Shutting down server...`);
        server.kill();
        start();
      });
    }
  });

  server.stderr.on('data', (data) => console.error("[Server]", data.toString()));
  server.on('error', (err) => {
    console.error(`[ERROR] Server failed to start: ${err.message}`);
    process.exit(1);
  });
  server.on('exit', (code) => {
    if (!tunnelStarted) {
      console.error(`[ERROR] Server exited prematurely (code ${code}).`);
    }
    process.exit(code);
  });
}

// ------------------------------------------------------------------
// Main
async function start() {
  const { cli, server } = await ensureEnvironment();
  selectModel();
  // store paths for later use
  selectLaunchMode._paths = { cli, server };
}

// Patch to keep paths available
const originalSelectLaunchMode = selectLaunchMode;
selectLaunchMode = (model) => {
  originalSelectLaunchMode(model, selectLaunchMode._paths);
};

// Graceful exit
process.on('SIGINT', () => {
  console.log("\nInterrupted. Exiting...");
  process.exit();
});

start();
