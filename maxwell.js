/*
Please run the command below before continueing forward.
pkg update -y && pkg upgrade -y && pkg install -y git cmake clang wget libandroid-spawn && git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build && cmake --build build --config Release -j8 && cp build/bin/llama-cli ~/llama-cli
*/
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOME = process.env.HOME;
const LLAMA_DIR = path.join(HOME, 'llama.cpp');
const LLAMA_CLI = path.join(HOME, 'llama-cli');
const LLAMA_SERVER = path.join(HOME, 'llama-server');

const MODELS = {
  "1": { name: "AMD ReasonLite (0.6B)", hf: "AMD/ReasonLite-0.6B-GGUF:Q4_K_M", args: "--prio 2", desc: "Logical powerhouse. Rivals 8B models in math/logic." },
  "2": { name: "SmolLM2 Agentic (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", args: "--prio 2", desc: "Best for tool-calling/JSON. Strict follower." },
  "3": { name: "LFM 2.5 Text (350M)", hf: "LiquidAI/LFM2.5-350M-GGUF:Q4_0", args: "--prio 2", desc: "Extreme speed. Snappy 2026 responses." },
  "4": { name: "LFM 2.5 Vision (450M)", hf: "LiquidAI/LFM2.5-VL-450M-GGUF:Q4_0", args: "--prio 2", desc: "For visual/OCR tasks." },
  "5": { name: "LFM 2.5 Thinking (1.2B)", hf: "LiquidAI/LFM2.5-1.2B-Thinking-GGUF:Q4_K_M", args: "--prio 2", desc: "Reflective logic; higher intelligence tier." },
  "6": { name: "LFM2 2.6B Exp", hf: "LiquidAI/LFM2-2.6B-Exp-GGUF:Q4_K_M", args: "--prio 2", desc: "Heavy flagship for complex agents." }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function runCommand(desc, cmd) {
    console.log(`\n>> ${desc}...`);
    try { execSync(cmd, { stdio: 'inherit', shell: true }); } 
    catch (e) { console.error(`Failed: ${desc}`); process.exit(1); }
}

async function start() {
    console.clear();
    console.log("--- Maxwell Master Controller v2026 ---");

    // Phase 1: Build Check
    if (!fs.existsSync(LLAMA_CLI)) {
        console.log("[!] System not initialized. Starting full installation...");
        runCommand("Installing Dependencies", "pkg update -y && pkg upgrade -y && pkg install -y git cmake clang wget libandroid-spawn cloudflared");
        runCommand("Cloning llama.cpp", `git clone https://github.com/ggml-org/llama.cpp ${LLAMA_DIR}`);
        runCommand("Building Binaries", `cd ${LLAMA_DIR} && cmake -B build && cmake --build build --config Release -j8`);
        runCommand("Setting up shortcuts", `cp ${LLAMA_DIR}/build/bin/llama-cli ${LLAMA_CLI} && cp ${LLAMA_DIR}/build/bin/llama-server ${LLAMA_SERVER} && chmod +x ${LLAMA_CLI} ${LLAMA_SERVER}`);
        console.log("[✓] Build Complete.");
    } else {
        console.log("[✓] Existing Llama.cpp Build Detected.");
    }

    // Phase 2: Model Selection
    console.log("\n[ SELECT MODEL ]");
    Object.entries(MODELS).forEach(([k, v]) => console.log(`${k}: ${v.name.padEnd(25)} | ${v.desc}`));
    
    rl.question("\nPick a number: ", (mChoice) => {
        const model = MODELS[mChoice];
        if (!model) return start();

        // Phase 3: Launch Mode Selection
        console.log("\n[ SELECT LAUNCH MODE ]");
        console.log("1: Terminal Chat (Fastest, Local Interactivity)");
        console.log("2: Cloud Cloudflare (Remote Web Access, Any Browser)");

        rl.question("\nPick a mode: ", (modeChoice) => {
            if (modeChoice === "1") launchTerminal(model);
            else if (modeChoice === "2") launchCloud(model);
            else start();
        });
    });
}

function launchTerminal(model) {
    console.log(`\nLaunching Maxwell Terminal via ${model.name}...`);
    const chat = spawn(LLAMA_CLI, [
        '-hf', model.hf, '-t', '8', '-ub', '512', '--mlock', '-cnv',
        '-p', `"You are Maxwell, a helpful and natural assistant."`
    ], { stdio: 'inherit', shell: true });
}

function launchCloud(model) {
    console.log(`\n[1/2] Launching API Server...`);
    const server = spawn(LLAMA_SERVER, [
        '-hf', model.hf, '-t', '8', '-c', '2048', '--mlock', '--port', '8080'
    ], { shell: true });

    server.stdout.on('data', (data) => {
        if (data.toString().includes("HTTP server listening")) {
            console.log("[2/2] Server live on 8080. Opening Cloudflare Tunnel...");
            const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8080'], { shell: true });
            tunnel.stdout.on('data', (tData) => {
                const out = tData.toString();
                if (out.includes(".trycloudflare.com")) {
                    const url = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)[0];
                    console.log("\n" + "=".repeat(60));
                    console.log("MAXWELL CLOUD ACCESS READY");
                    console.log("LINK:", url);
                    console.log("Status: Use any browser on any network to chat with Maxwell.");
                    console.log("=".repeat(60) + "\n");
                }
            });
        }
    });
}

start();
