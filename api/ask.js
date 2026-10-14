import { isAddress } from "viem";
import { createAgent } from "../lib/agent.js";
import { getSharedClient, resetSharedClient } from "../lib/server-client.js";
import { sendJson } from "../lib/http.js";

// GET /api/ask?q=<question>&contract=<previous contract>&lang=<previous language>
// The page sends back the memory it received, so follow-ups like "and who owns it?" work.
export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const question = (params.get("q") ?? "").trim().slice(0, 500);
  const previous = params.get("contract");
  const memory = {
    contract: previous && isAddress(previous) ? previous : null,
    language: params.get("lang") === "en" ? "en" : "pt",
  };
  if (!question) return sendJson(res, 400, { ok: false, error: "Empty question / pergunta vazia" });

  const steps = [];
  try {
    const ask = createAgent(getSharedClient, { log: (line) => steps.push(line.trim()), memory });
    const answer = await ask(question);
    return sendJson(res, 200, { ok: true, answer, steps, memory });
  } catch (e) {
    resetSharedClient();
    return sendJson(res, 500, { ok: false, error: e.message, steps, memory });
  }
}
