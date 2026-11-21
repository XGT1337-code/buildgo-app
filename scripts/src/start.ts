/**
 * One command for the whole backend: local PostgreSQL, then the API server (which also serves the
 * website from artifacts/agrolink/dist when it has been built). Ctrl+C stops both.
 *
 *   pnpm start            → database + server on http://localhost:8080
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const children: ChildProcess[] = [];

function run(name: string, args: string[], ready?: RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: root, shell: true, env: process.env });
    children.push(child);
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      process.stdout.write(text.split("\n").map((l) => (l ? `[${name}] ${l}` : l)).join("\n"));
      if (ready?.test(text)) resolve();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => { if (!ready) resolve(); else reject(new Error(`${name} exited with code ${code}`)); stop(code ?? 1); });
    if (!ready) resolve();
  });
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.pid && c.exitCode === null) {
      // Windows needs the whole tree killed (pnpm → node → postgres).
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill("SIGINT");
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

await run("db", ["run", "db"], /PostgreSQL ready/);
await run("api", ["run", "server"]);
