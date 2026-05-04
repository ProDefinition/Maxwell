/*
INSTALL:
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

// ✅ STRICT SMALL MODELS ONLY (REAL + VERIFIED)
const MODELS = {
  // TEXT MODELS (≤1.5B)
  "1": { name: "SmolLM2 (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M", type: "text", desc: "Ultra-fast lightweight assistant." },
  "2": { name: "Qwen 2.5 (0.5B)", hf: "bartowski/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M", type: "text", desc: "Best tiny reasoning model." },
  "3": { name: "Llama 3.2 (1B)", hf: "bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M", type: "text", desc: "Balanced speed + quality." },
  "4": { name: "Qwen 2.5 (1.5B)", hf: "bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M", type: "text", desc: "Strongest under 2B." },
  "5": { name: "Danube 3 (500M)", hf: "h2oai/h2o-danube3-500m-chat-GGUF:q4_k_m", type: "text", desc: "Fast conversational model." },

  // ⚠️ VISION (REALITY CHECK: ~2B MINIMUM)
  "6": { name: "Qwen2-VL (2B)", hf: "bartowski/Qwen2-VL-2B-Instruct-GGUF:Q4_K_M", type: "vision", desc: "Smallest practical vision model." },
  "7": { name: "MiniCPM-V 2.6 (~2B)", hf: "openbmb/MiniCPM-V-2_6-gguf:Q4_K_M", type: "vision", desc: "Efficient edge vision model." },

  // ⚠️ TTS (EXPERIMENTAL BUT REAL)
  "8": { name: "OuteTTS 0.2 (500M)", hf: "OuteAI/OuteTTS-0.2-500M-GGUF:Q4_K_M", type: "tts", desc: "Token-based speech generation." }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let activeProcesses = []; 

function cleanup() {
    if (activeProcesses.length > 0) {
        console.log('\n[!] Shutting down...');
        activeProcesses.forEach(p => {
            try { p.kill('SIGINT'); } catch {}
        });
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('exit', cleanup);

function runCommand(desc, cmd) {
    console.log(`\n>> ${desc}...`);
    try { execSync(cmd, { stdio: 'inherit', shell: true }); }
    catch { console.error(`\n[X] Failed: ${desc}`); process.exit(1); }
}

async function getHfArgs(hfString) {
    if (!hfString.includes(':')) return ['--hf-repo', hfString];

    const [repo, quant] = hfString.split(':');

    const res = await fetch(`https://huggingface.co/api/models/${repo}`);
    if (!res.ok) {
        console.error(`[X] Repo failed: ${repo}`);
        process.exit(1);
    }

    const data = await res.json();
    const fileObj = data.siblings.find(s =>
        s.rfilename.toLowerCase().includes(quant.toLowerCase()) &&
        s.rfilename.endsWith('.gguf')
    );

    if (!fileObj) {
        console.error(`[X] No GGUF match in ${repo}`);
        process.exit(1);
    }

    return ['--hf-repo', repo, '--hf-file', fileObj.rfilename];
}

async function start() {
    console.clear();
    console.log("=== MAXWELL CONTROLLER (LIGHTWEIGHT MODE) ===\n");

    if (!fs.existsSync(LLAMA_CLI)) {
        console.log("[!] Installing...");
        runCommand("Deps", "pkg install -y git cmake clang wget libandroid-spawn cloudflared nodejs");
        runCommand("Clone", `git clone https://github.com/ggml-org/llama.cpp ${LLAMA_DIR}`);
        runCommand("Build", `cd ${LLAMA_DIR} && cmake -B build && cmake --build build -j8`);
        runCommand("Setup", `cp ${LLAMA_DIR}/build/bin/llama-* ~/`);
    }

    console.log("\n[ MODELS ]");
    Object.entries(MODELS).forEach(([k, v]) => {
        console.log(`[${k}] ${v.name} → ${v.desc}`);
    });

    let model;
    while (!model) {
        model = MODELS[await rl.question("Select: ")];
    }

    let mode;
    while (!["1","2"].includes(mode)) {
        console.log("\n[1] Terminal\n[2] Cloud");
        mode = await rl.question("Mode: ");
    }

    rl.close();

    if (mode === "1") launchTerminal(model);
    else launchCloud(model);
}

async function launchTerminal(model) {
    console.log(`\n🚀 ${model.name}\n`);

    const hfArgs = await getHfArgs(model.hf);

    let args = [
        ...hfArgs,
        '-t','8',
        '-b','256',
        '-ub','512',
        '-c','2048',
        '-fa',
        '-mmap',
        '-cnv'
    ];

    // 🔊 TTS SPECIAL HANDLING
    if (model.type === "tts") {
        console.log("[TTS MODE ENABLED]");
        console.log("• Model outputs AUDIO TOKENS");
        console.log("• You must post-process into waveform");
        console.log("• Expect slower generation\n");

        args.push('-p', 'Convert text into spoken audio tokens:');
    } else {
        args.push('-p', 'You are Maxwell, a helpful assistant.');
    }

    const p = spawn(LLAMA_CLI, args, { stdio: 'inherit' });
    activeProcesses.push(p);
}

async function launchCloud(model) {
    const hfArgs = await getHfArgs(model.hf);

    const server = spawn(LLAMA_SERVER, [
        ...hfArgs,
        '-t','8',
        '-c','2048',
        '--host','0.0.0.0',
        '--port','8080'
    ]);

    activeProcesses.push(server);

    server.stdout.on('data', d => process.stdout.write(d));

    server.stdout.on('data', (d) => {
        if (d.toString().includes("listening")) {
            const tunnel = spawn('cloudflared', ['tunnel','--url','http://127.0.0.1:8080']);
            activeProcesses.push(tunnel);

            tunnel.stderr.on('data', t => {
                const m = t.toString().match(/https:\/\/.*trycloudflare.com/);
                if (m) console.log("\n🌐 " + m[0]);
            });
        }
    });
}

start();
