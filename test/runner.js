import { spawn } from "node:child_process";

// Runs each case as a real process against the live Pharos MCP servers and checks exit code + output.
function run({ args, env = {}, input, killAfter }) {
  return new Promise((resolve) => {
    const start = performance.now();
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(LLM_|OPENAI_|GEMINI_|GROQ_|OPENROUTER_)/.test(k))
    );
    const child = spawn(process.execPath, args, { cwd: new URL("..", import.meta.url), env: { ...cleanEnv, ...env } });
    if (input !== undefined) child.stdin.end(input);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), killAfter ?? 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, secs: (performance.now() - start) / 1000 });
    });
  });
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

/** `node test/e2e.js [name prefix]` runs the matching cases, two at a time to stay under the Chain MCP rate limit. */
export async function runCases(cases) {
  const only = process.argv[2];
  const selected = cases.filter((c) => !only || c.name.startsWith(only));
  const started = performance.now();
  const results = await pool(selected, 2, async (c) => ({ c, r: await run(c) }));
  let failed = 0;
  for (const { c, r } of results) {
    const ok = r.code === c.code && c.expect.test(r.out) && !(c.reject && c.reject.test(r.out));
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${r.secs.toFixed(1).padStart(5)}s  ${c.name}`);
    if (!ok) console.log(`      exit ${r.code} (expected ${c.code})\n      ${r.out.trim().split("\n").slice(-8).join("\n      ")}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed in ${((performance.now() - started) / 1000).toFixed(0)}s`);
  process.exitCode = failed ? 1 : 0;
}
