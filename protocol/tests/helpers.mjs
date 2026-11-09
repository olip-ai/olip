import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Windows installs Python as "python"; Linux and macOS as "python3".
export const PYTHON = process.platform === "win32" ? "python" : "python3";
export async function startServer(kind, port) {
  const cmd = kind === "node" ? ["node", ["reference/server.mjs"]] : [PYTHON, ["alt-python/olip_alt_server.py"]];
  const p = spawn(cmd[0], cmd[1], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}/.well-known/olip.json`); if (r.ok) return { base, stop: () => p.kill() }; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  p.kill(); throw new Error(`${kind} server did not start`);
}
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, ...opts });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    if (opts.input) { p.stdin.write(opts.input); p.stdin.end(); }
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
