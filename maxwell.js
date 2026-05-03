/*
INSTALLATION COMMAND (Run this if starting fresh):
pkg update -y && pkg upgrade -y && pkg install -y tur-repo && pkg install -y git cmake clang wget libandroid-spawn cloudflared nodejs && git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build && cmake --build build --config Release -j8 && cp build/bin/llama-cli ~/llama-cli && cp build/bin/llama-server ~/llama-server
*/

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises'); 

const HOME = process.env.HOME || process.cwd();
const LLAMA_DIR = path.join(HOME, 'llama.cpp');
const LLAMA_CLI = path.join(HOME, 'llama-cli');
const LLAMA_SERVER = path.join(HOME, 'llama-server');

const MODELS = {
  "1": { name: "AMD ReasonLite (0.6B)", hf: "AMD/ReasonLite-0.6B-GGUF:Q4_K_M", desc: "Small math-reasoning model with strong benchmark performance for its size." },
  "2": { name: "SmolLM2 Instruct (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", desc: "Compact instruction-following model for lightweight general chat and structured tasks." },
  "3": { name: "LFM 2.5 Text (350M)", hf: "LiquidAI/LFM2.5-350M-GGUF:Q4_0", desc: "Fast, efficient text model optimized for edge inference and tool use." },
  "4": { name: "LFM 2.5 Vision (450M)", hf: "LiquidAI/LFM2.5-VL-450M-GGUF:Q4_0", desc: "Compact vision-language model for OCR, grounding, and image understanding." },
  "5": { name: "LFM 2.5 Thinking (1.2B)", hf: "LiquidAI/LFM2.5-1.2B-Thinking-GGUF:Q4_K_M", desc: "Reasoning-oriented model; verify the exact repo name before shipping." },
  "6": { name: "LFM2 2.6B Exp", hf: "LiquidAI/LFM2-2.6B-Exp-GGUF:Q4_K_M", desc: "Efficient mid-size model for stronger general-purpose local inference." },
  "7": { name: "H2O Danube3 (500M)", hf: "h2oai/h2o-danube3-500m-chat-GGUF:Q4_K_M", desc: "Small chat model with good latency and solid conversational performance." },
  "8": { name: "Qwen3 Instruct (0.6B)", hf: "Qwen/Qwen3-0.6B-Instruct-GGUF:Q4_K_M", desc: "Compact instruct model for lightweight agent and general text tasks." }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let activeProcesses = []; 

function cleanup() {
    if (activeProcesses.length > 0) {
        console.log('\n[!] Shutting down background processes (Server & Tunnel)...');
        activeProcesses.forEach(p => {
            try { p.kill('SIGINT'); } catch (e) {}
        });
    }
    process.exit(0);
}

process.on('SIGINT', cleanup); 
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

// 🔧 FIX: Transforms "Repo/Name:Quant" syntax into proper `llama.cpp` arguments 
function getHfArgs(hfString) {
    if (hfString.includes(':')) {
        const [repo, quant] = hfString.split(':');
        // Wildcard ensures we download the specific quantization successfully (*Q4_K_M*.gguf)
        return ['--hf-repo', repo, '--hf-file', `*${quant}*.gguf`];
    }
    return ['--hf-repo', hfString];
}

async function start() {
    console.clear();
    console.log("========================================");
    console.log("   MAXWELL MASTER CONTROLLER v2026      ");
    console.log("========================================\n");

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

    console.log("\n[ SELECT LAUNCH MODE ]");
    console.log(" [1] Terminal Chat (Fastest, Local Interactivity)");
    console.log(" [2] Cloud Access (Remote Web API, Any Browser via Cloudflare)");

    let modeChoice = "";
    while (!["1", "2"].includes(modeChoice)) {
        modeChoice = await rl.question("\nPick a mode: ");
    }

    rl.close(); 

    if (modeChoice === "1") launchTerminal(model);
    if (modeChoice === "2") launchCloud(model);
}

function launchTerminal(model) {
    console.log(`\n🚀 Launching Maxwell Terminal via ${model.name}...\n`);
    
    const chat = spawn(LLAMA_CLI, [
        ...getHfArgs(model.hf), // Applies the fix
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
        ...getHfArgs(model.hf), // Applies the fix
        '-t', '8', 
        '-c', '2048', 
        '--host', '0.0.0.0', // 🔧 FIX: Bind to all interfaces for tunnel proxy access
        '--port', '8080',
        '--cors'             // 🔧 FIX: Ensures CORS doesn't block Cloud Web UI interactivity 
    ], { shell: false });

    activeProcesses.push(server);

    let tunnelLaunched = false;

    const handleData = (data) => {
        const out = data.toString();
        process.stdout.write(out);

        const isReady = out.includes("listening on") || 
                        out.includes("HTTP server listening") || 
                        out.includes("starting the main loop");

        if (isReady && !tunnelLaunched) {
            tunnelLaunched = true;
            console.log("\n" + "=".repeat(50));
            console.log("✅ SERVER DETECTED! BOOTING CLOUDFLARE TUNNEL...");
            console.log("=".repeat(50) + "\n");
            startCloudflareTunnel();
        }
    };

    server.stdout.on('data', handleData);
    server.stderr.on('data', handleData);

    server.on('exit', () => cleanup());
}

function startCloudflareTunnel() {
    const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://127.0.0.1:8080'], { shell: false });
    activeProcesses.push(tunnel);

    tunnel.stderr.on('data', (tData) => {
        const out = tData.toString();
        
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

start();
