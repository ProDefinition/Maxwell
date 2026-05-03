/*
MAXWELL T1 — Ultra-Fast Local AI Launcher

INSTALL (fresh Termux):
pkg update -y && pkg upgrade -y && \
pkg install -y tur-repo && \
pkg install -y git cmake clang wget libandroid-spawn cloudflared nodejs && \
git clone https://github.com/ggml-org/llama.cpp && \
cd llama.cpp && cmake -B build && cmake --build build --config Release -j8 && \
cp build/bin/llama-cli ~/llama-cli && \
cp build/bin/llama-server ~/llama-server && \
chmod +x ~/llama-cli ~/llama-server
*/

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline/promises');

const HOME = process.env.HOME || process.cwd();
const LLAMA_DIR = path.join(HOME, 'llama.cpp');
const LLAMA_CLI = path.join(HOME, 'llama-cli');
const LLAMA_SERVER = path.join(HOME, 'llama-server');
const HF_CACHE_FILE = path.join(HOME, '.hf_cache.json');
const PROMPT_CACHE = path.join(HOME, '.llama_prompt_cache');

const threads = Math.max(2, Math.floor(os.cpus().length * 0.75));

const MODELS = {
  "1": { name: "Qwen 2.5 (0.5B)", hf: "bartowski/Qwen2.5-0.5B-Instruct-GGUF:Q3_K_S" },
  "2": { name: "SmolLM2 (360M)", hf: "bartowski/SmolLM2-360M-Instruct-GGUF:Q3_K_S" },
  "3": { name: "Llama 3.2 (1B)", hf: "bartowski/Llama-3.2-1B-Instruct-GGUF:Q3_K_S" },
  "4": { name: "Qwen 2.5 (1.5B)", hf: "bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q3_K_S" },
};

let activeProcesses = [];

function cleanup() {
    activeProcesses.forEach(p => { try { p.kill('SIGINT'); } catch {} });
    process.exit(0);
}

process.on('SIGINT', cleanup);

function run(cmd) {
    execSync(cmd, { stdio: 'inherit', shell: true });
}

function loadCache() {
    if (!fs.existsSync(HF_CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(HF_CACHE_FILE));
}

function saveCache(cache) {
    fs.writeFileSync(HF_CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function resolveHF(hfString) {
    const cache = loadCache();
    if (cache[hfString]) return cache[hfString];

    const [repo, quant] = hfString.split(':');

    const res = await fetch(`https://huggingface.co/api/models/${repo}`);
    const data = await res.json();

    const file = data.siblings.find(f =>
        f.rfilename.toLowerCase().includes(quant.toLowerCase()) &&
        f.rfilename.endsWith('.gguf')
    );

    const args = ['--hf-repo', repo, '--hf-file', file.rfilename];

    cache[hfString] = args;
    saveCache(cache);

    return args;
}

function getCommonArgs(context) {
    return [
        '-t', String(threads),
        '-c', context,
        '-b', '256',
        '-ub', '512',
        '-fa',
        '-mmap',
        '-mlock',
        '--prompt-cache', PROMPT_CACHE
    ];
}

async function launchTerminal(model) {
    console.log(`\n🚀 Maxwell T1 launching ${model.name}...\n`);

    const hfArgs = await resolveHF(model.hf);
    const context = model.name.includes("1.5B") ? '4096' : '2048';

    const proc = spawn(LLAMA_CLI, [
        ...hfArgs,
        ...getCommonArgs(context),
        '-cnv',
        '-p', 'You are Maxwell, a fast and helpful assistant.'
    ], { stdio: 'inherit' });

    activeProcesses.push(proc);
}

async function launchCloud(model) {
    console.log(`\n🚀 Starting API server...\n`);

    const hfArgs = await resolveHF(model.hf);
    const context = model.name.includes("1.5B") ? '4096' : '2048';

    const server = spawn(LLAMA_SERVER, [
        ...hfArgs,
        ...getCommonArgs(context),
        '--host', '0.0.0.0',
        '--port', '8080',
        '--parallel', '2'
    ]);

    activeProcesses.push(server);

    setTimeout(() => {
        console.log("\n🌐 Starting Cloudflare tunnel...\n");

        const tunnel = spawn('cloudflared', [
            'tunnel', '--url', 'http://127.0.0.1:8080'
        ]);

        tunnel.stderr.on('data', d => {
            const match = d.toString().match(/https:\/\/[^\s]+/);
            if (match) {
                console.log("\n====================================");
                console.log("🌍 MAXWELL CLOUD READY");
                console.log("🔗 " + match[0]);
                console.log("====================================\n");
            }
        });

        activeProcesses.push(tunnel);
    }, 2000);
}

async function start() {
    console.clear();
    console.log("===== MAXWELL T1 =====\n");

    if (!fs.existsSync(LLAMA_CLI)) {
        console.log("Installing...");
        run(`pkg install -y git cmake clang wget libandroid-spawn nodejs`);
        run(`git clone https://github.com/ggml-org/llama.cpp ${LLAMA_DIR}`);
        run(`cd ${LLAMA_DIR} && cmake -B build && cmake --build build -j${threads}`);
        run(`cp ${LLAMA_DIR}/build/bin/llama-* ${HOME}`);
    }

    console.log("\nSelect model:");
    Object.entries(MODELS).forEach(([k, v]) =>
        console.log(`[${k}] ${v.name}`)
    );

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let choice = await rl.question("Choice: ");
    let model = MODELS[choice];

    console.log("\nMode:");
    console.log("[1] Terminal (fastest)");
    console.log("[2] Cloud");

    let mode = await rl.question("Choice: ");
    rl.close();

    if (mode === "1") await launchTerminal(model);
    else await launchCloud(model);
}

start();
