/*
 * Maxwell Master Controller v2026 – LLM Launcher for Termux
 * Detects existing llama.cpp builds, offers local chat or Cloudflare tunnel.
 * Run: node maxwell.js
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOME = process.env.HOME;

// Locations where binaries might live
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

// ------------------------------------------------------------------
// Helpers
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

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findExisting(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ------------------------------------------------------------------
// Phase 0: Environment Setup
async function ensureEnvironment() {
  console.clear();
  console.log("--- Maxwell Master Controller v2026 ---\n");

  let cliPath = findExisting(CLI_CANDIDATES);
  let serverPath = findExisting(SERVER_CANDIDATES);
  let repoPath = findExisting([
    path.join(HOME, 'llama.cpp'),
    path.join(HOME, 'maxwell-llama')
  ]);

  // If server missing but we have a build directory, copy it
  if (!serverPath && cliPath && repoPath) {
    const builtServer = path.join(repoPath, 'build', 'bin', 'llama-server');
    if (fs.existsSync(builtServer)) {
      const dest = path.join(HOME, 'llama-server');
      fs.copyFileSync(builtServer, dest);
      fs.chmodSync(dest, '755');
      serverPath = dest;
      console.log(`[✓] Copied llama-server → ${dest}`);
    }
  }

  // If either binary still missing, do full install
  if (!cliPath || !serverPath) {
    console.log("[!] Missing binaries. Running full installation (this may take a while)...");
    runCommand("Installing dependencies", "pkg update -y && pkg upgrade -y && pkg install -y git cmake clang wget libandroid-spawn cloudflared python");
    if (!commandExists('huggingface-cli')) {
      runCommand("Installing huggingface-hub", "pip install huggingface-hub");
    }

    if (!repoPath) {
      repoPath = path.join(HOME, 'maxwell-llama');
      runCommand("Cloning llama.cpp", `git clone https://github.com/ggml-org/llama.cpp ${repoPath}`);
    } else {
      console.log(`[✓] Using existing repository at ${repoPath}`);
    }

    // Build if needed
    const builtCli = path.join(repoPath, 'build', 'bin', 'llama-cli');
    const builtServer = path.join(repoPath, 'build', 'bin', 'llama-server');
    if (!fs.existsSync(builtCli) || !fs.existsSync(builtServer)) {
      runCommand("Building binaries", `cd ${repoPath} && cmake -B build && cmake --build build --config Release -j8`);
    }

    // Copy to home
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
    console.log("[✓] Installation complete.");
  } else {
    console.log("[✓] Existing binaries detected:");
    console.log(`    llama-cli    → ${cliPath}`);
    console.log(`    llama-server → ${serverPath}`);
  }

  return { cli: cliPath, server: serverPath };
}

// ------------------------------------------------------------------
// Model selection
function selectModel() {
  console.log("\n[ SELECT MODEL ]");
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
// Launch mode selection
function selectLaunchMode(model, paths) {
  console.log("\n[ SELECT LAUNCH MODE ]");
  console.log("1: Terminal Chat (Local)");
  console.log("2: Cloudflare Tunnel (Public link)");
  console.log("3: Back to model selection");

  rl.question("\nPick a mode: ", (choice) => {
    if (choice === '1') launchTerminal(model, paths.cli);
    else if (choice === '2') launchCloudflareTunnel(model, paths.server);
    else if (choice === '3') selectModel();
    else {
      console.log("Invalid choice.");
      selectLaunchMode(model, paths);
    }
  });
}

// ------------------------------------------------------------------
// Terminal Chat (completely unchanged)
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
  ], { stdio: 'inherit', shell: true });

  chat.on('error', (err) => {
    console.error(`[ERROR] Failed to start llama-cli: ${err.message}`);
    process.exit(1);
  });
  chat.on('exit', (code) => {
    if (code !== 0) console.error(`[ERROR] llama-cli exited with code ${code}`);
    console.log("\nChat ended. Returning to menu...");
    start();
  });
}

// ------------------------------------------------------------------
// Cloudflare Tunnel mode (new, robust)
function launchCloudflareTunnel(model, serverPath) {
  console.log(`\n[1/2] Starting API server with ${model.name}...`);

  const server = spawn(serverPath, [
    '-hf', model.hf,
    '-t', '8',
    '-c', '2048',
    '--mlock',
    '--port', '8080'
  ], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });

  let tunnelStarted = false;

  server.stdout.on('data', (data) => {
    const text = data.toString();
    if (!tunnelStarted && text.includes("HTTP server listening")) {
      tunnelStarted = true;
      console.log("[2/2] Server live on port 8080. Opening Cloudflare tunnel...");

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

      tunnel.stderr.on('data', (err) => console.error("[Tunnel]", err.toString()));
      tunnel.on('error', (err) => {
        console.error(`[ERROR] Tunnel crashed: ${err.message}`);
        server.kill();
        process.exit(1);
      });
      tunnel.on('exit', (code) => {
        console.log(`Tunnel closed (code ${code}). Shutting down server...`);
        server.kill();
        start();
      });
    }
  });

  server.stderr.on('data', (data) => console.error("[Server]", data.toString()));
  server.on('error', (err) => {
    console.error(`[ERROR] Server failed: ${err.message}`);
    process.exit(1);
  });
  server.on('exit', (code) => {
    if (!tunnelStarted) console.error(`[ERROR] Server exited prematurely (code ${code}).`);
    process.exit(code);
  });
}

// ------------------------------------------------------------------
// Main
async function start() {
  const { cli, server } = await ensureEnvironment();
  // Store paths so we can pass them to selectLaunchMode
  selectLaunchMode._paths = { cli, server };
  selectModel();
}

// Patch selectLaunchMode to always receive the saved paths
const originalSelectLaunchMode = selectLaunchMode;
selectLaunchMode = (model) => {
  originalSelectLaunchMode(model, selectLaunchMode._paths);
};

process.on('SIGINT', () => {
  console.log("\nInterrupted. Exiting...");
  process.exit();
});

start();
