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
  "1": { name: "Qwen 2.5 (0.5B)", hf: "bartowski/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M", desc: "Small, highly capable math and reasoning model." },
  "2": { name: "SmolLM2 Instruct (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", desc: "Compact instruction-following model for lightweight tasks." },
  "3": { name: "Llama 3.2 (1B)", hf: "bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M", desc: "Fast, efficient text model optimized for edge inference." },
  "4": { name: "Qwen 2.5 (1.5B)", hf: "bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M", desc: "Stronger reasoning and conversational performance." },
  "5": { name: "H2O Danube 3 (500M)", hf: "h2oai/h2o-danube3-500m-chat-GGUF:q4_k_m", desc: "Small chat model with excellent latency." },
  "6": { name: "Llama 3.2 (3B)", hf: "bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M", desc: "Mid-size model for heavier general-purpose local inference." },
  "7": { 
  name: "Liquid LFM2.5 (1.2B)", 
  hf: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF", 
  file: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
  desc: "Small on-device instruction model for fast local inference." 
}
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

async function getHfArgs(hfString) {
    if (!hfString.includes(':')) return ['--hf-repo', hfString];

    const [repo, quant] = hfString.split(':');
    console.log(`\n[🔎] Resolving exact filename for '${quant}' in '${repo}'...`);

    try {
        const res = await fetch(`https://huggingface.co/api/models/${repo}`);
        
        if (res.status === 401) {
            console.error(`\n[X] ERROR 401: Hugging Face denied access.`);
            console.error(`    -> The repository '${repo}' likely DOES NOT EXIST (Hallucinated name) or is Private.`);
            process.exit(1);
        }
        if (res.status === 404) {
            console.error(`\n[X] ERROR 404: Repository '${repo}' does not exist on Hugging Face.`);
            process.exit(1);
        }
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

        const data = await res.json();
        if (!data.siblings) throw new Error("Invalid repository data.");

        const fileObj = data.siblings.find(s => 
            s.rfilename.toLowerCase().includes(quant.toLowerCase()) && 
            s.rfilename.endsWith('.gguf')
        );

        if (!fileObj) {
            console.error(`\n[X] ERROR: Could not find any .gguf file containing '${quant}' in '${repo}'.`);
            console.error(`    Available files: ${data.siblings.filter(s => s.rfilename.endsWith('.gguf')).map(s=>s.rfilename).slice(0,4).join(', ')}...`);
            process.exit(1);
        }

        console.log(`[✓] Found exact file: ${fileObj.rfilename}`);
        return ['--hf-repo', repo, '--hf-file', fileObj.rfilename];

    } catch (err) {
        console.error(`\n[X] Failed to fetch repo data: ${err.message}`);
        process.exit(1);
    }
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

    if (modeChoice === "1") await launchTerminal(model);
    if (modeChoice === "2") await launchCloud(model);
}

async function launchTerminal(model) {
    console.log(`\n🚀 Launching Maxwell Terminal via ${model.name}...\n`);
    
    const hfArgs = await getHfArgs(model.hf); 

    const chat = spawn(LLAMA_CLI, [
        ...hfArgs,
        '-t', '8', 
        '-c', '2048', 
        '-cnv', 
        '-p', 'Hello.'
    ], { stdio: 'inherit', shell: false });

    activeProcesses.push(chat);
    chat.on('exit', () => cleanup());
}

async function launchCloud(model) {
    console.log(`\n[1/2] Launching API Server on Port 8080...`);
    console.log(`(Model will automatically download if not cached. See progress below)`);
    console.log("-".repeat(50));

    const hfArgs = await getHfArgs(model.hf); 

    // 🔧 FIX: Removed the deprecated `--cors` flag.
    const server = spawn(LLAMA_SERVER, [
        ...hfArgs,
        '-t', '8', 
        '-c', '2048', 
        '--host', '0.0.0.0', 
        '--port', '8080'
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
