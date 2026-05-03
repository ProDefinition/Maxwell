/*
INSTALLATION COMMAND (Run this if starting fresh):
pkg update -y && pkg upgrade -y && pkg install -y tur-repo && pkg install -y git cmake clang wget libandroid-spawn cloudflared nodejs && git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build && cmake --build build --config Release -j8 && cp build/bin/llama-cli ~/llama-cli && cp build/bin/llama-server ~/llama-server
*/

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises'); // Modern async readline

const HOME = process.env.HOME || process.cwd();
const LLAMA_DIR = path.join(HOME, 'llama.cpp');
const LLAMA_CLI = path.join(HOME, 'llama-cli');
const LLAMA_SERVER = path.join(HOME, 'llama-server');

const MODELS = {
  "1": { name: "AMD ReasonLite (0.6B)", hf: "AMD/ReasonLite-0.6B-GGUF:Q4_K_M", desc: "Logical powerhouse. Rivals 8B models in math/logic." },
  "2": { name: "SmolLM2 Agentic (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", desc: "Best for tool-calling/JSON. Strict follower." },
  "3": { name: "LFM 2.5 Text (350M)", hf: "LiquidAI/LFM2.5-350M-GGUF:Q4_0", desc: "Extreme speed. Snappy 2026 responses." },
  "4": { name: "LFM 2.5 Vision (450M)", hf: "LiquidAI/LFM2.5-VL-450M-GGUF:Q4_0", desc: "For visual/OCR tasks." },
  "5": { name: "LFM 2.5 Thinking (1.2B)", hf: "LiquidAI/LFM2.5-1.2B-Thinking-GGUF:Q4_K_M", desc: "Reflective logic; higher intelligence tier." },
  "6": { name: "LFM2 2.6B Exp", hf: "LiquidAI/LFM2-2.6B-Exp-GGUF:Q4_K_M", desc: "Heavy flagship for complex agents." }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let activeProcesses = []; // Tracks children to prevent orphaned background processes

// Graceful exit handler
function cleanup() {
    if (activeProcesses.length > 0) {
        console.log('\n[!] Shutting down background processes (Server & Tunnel)...');
        activeProcesses.forEach(p => {
            try { p.kill('SIGINT'); } catch (e) {}
        });
    }
    process.exit(0);
}

process.on('SIGINT', cleanup); // Handle Ctrl+C
process.on('exit', cleanup);

function runCommand(desc, cmd) {
    console.log(`\n>> ${desc}...`);
    try { 
        execSync(cmd, { stdio: 'inherit', shell: true }); 
    } catch (e) { 
        console.error(`\n[X] Failed: ${desc}`); 
        process.exit(1); 
    }
}

async function start() {
    console.clear();
    console.log("========================================");
    console.log("   MAXWELL MASTER CONTROLLER v2026      ");
    console.log("========================================\n");

    // Phase 1: Build Check
    if (!fs.existsSync(LLAMA_CLI) || !fs.existsSync(LLAMA_SERVER)) {
        console.log("[!] Missing binaries. Starting installation process...");
        runCommand("Installing Dependencies", "pkg update -y && pkg install -y tur-repo && pkg install -y git cmake clang wget libandroid-spawn cloudflared nodejs");
        runCommand("Cloning llama.cpp", `git clone https://github.com/ggml-org/llama.cpp ${LLAMA_DIR}`);
        runCommand("Building Binaries", `cd ${LLAMA_DIR} && cmake -B build && cmake --build build --config Release -j8`);
        runCommand("Setting up shortcuts", `cp ${LLAMA_DIR}/build/bin/llama-cli ${LLAMA_CLI} && cp ${LLAMA_DIR}/build/bin/llama-server ${LLAMA_SERVER} && chmod +x ${LLAMA_CLI} ${LLAMA_SERVER}`);
        console.log("[✓] Build Complete.\n");
    } else {
        console.log("[✓] Existing Llama.cpp Build Detected.\n");
    }

    // Phase 2: Model Selection
    console.log("[ SELECT MODEL ]");
    Object.entries(MODELS).forEach(([k, v]) => {
        console.log(` [${k}] ${v.name.padEnd(25)} | ${v.desc}`);
    });
    
    let model = null;
    while (!model) {
        const mChoice = await rl.question("\nPick a number: ");
        model = MODELS[mChoice];
        if (!model) console.log("Invalid selection. Try again.");
    }

    // Phase 3: Launch Mode Selection
    console.log("\n[ SELECT LAUNCH MODE ]");
    console.log(" [1] Terminal Chat (Fastest, Local Interactivity)");
    console.log(" [2] Cloud Access (Remote Web API, Any Browser via Cloudflare)");

    let modeChoice = "";
    while (!["1", "2"].includes(modeChoice)) {
        modeChoice = await rl.question("\nPick a mode: ");
    }

    rl.close(); // Close readline so it doesn't interfere with child processes

    if (modeChoice === "1") launchTerminal(model);
    if (modeChoice === "2") launchCloud(model);
}

function launchTerminal(model) {
    console.log(`\n🚀 Launching Maxwell Terminal via ${model.name}...\n`);
    
    // shell: false prevents quotes around the prompt from breaking
    const chat = spawn(LLAMA_CLI, [
        '-hf', model.hf, 
        '-t', '8', 
        '-c', '2048', 
        '-cnv', 
        '-p', 'You are Maxwell, a helpful and natural assistant.'
    ], { stdio: 'inherit', shell: false });

    activeProcesses.push(chat);
    chat.on('exit', () => cleanup());
}

function launchCloud(model) {
    console.log(`\n[1/2] Launching API Server on Port 8080...`);
    console.log(`(Model will automatically download if not cached. See progress below)`);
    console.log("-".repeat(50));

    const server = spawn(LLAMA_SERVER, [
        '-hf', model.hf, 
        '-t', '8', 
        '-c', '2048', 
        '--port', '8080'
    ], { shell: false });

    activeProcesses.push(server);

    let tunnelLaunched = false;

    // llama.cpp outputs almost everything to stderr, not stdout
    server.stderr.on('data', (data) => {
        const out = data.toString();
        process.stdout.write(out); // Shows download progress to user

        if (out.includes("HTTP server listening") && !tunnelLaunched) {
            tunnelLaunched = true;
            console.log("\n" + "-".repeat(50));
            console.log("[2/2] Server live! Booting Cloudflare Tunnel...");
            startCloudflareTunnel();
        }
    });

    server.on('exit', () => cleanup());
}

function startCloudflareTunnel() {
    const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://127.0.0.1:8080'], { shell: false });
    activeProcesses.push(tunnel);

    // Cloudflared also logs strictly to stderr
    tunnel.stderr.on('data', (tData) => {
        const out = tData.toString();
        
        // Regex to extract the Cloudflare URL
        const urlMatch = out.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch) {
            console.log("\n" + "=".repeat(60));
            console.log(" 🌐 MAXWELL CLOUD ACCESS READY");
            console.log(` 🔗 LINK: ${urlMatch[0]}`);
            console.log(" 💡 Status: Use any browser on any network to access the API.");
            console.log(" press [Ctrl+C] to safely shut down the server.");
            console.log("=".repeat(60) + "\n");
        }
    });

    tunnel.on('exit', () => cleanup());
}

// Boot
start();
