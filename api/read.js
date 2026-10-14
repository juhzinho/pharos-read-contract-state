import { isAddress } from "viem";
import { isTransient, takeCallLog } from "../lib/mcp.js";
import { readContractState } from "../lib/contract-state.js";
import { contractView } from "../lib/contract-view.js";
import { summarizeCalls } from "../lib/agent.js";
import { getSharedClient, resetSharedClient } from "../lib/server-client.js";
import { resolveToken } from "../lib/tokens.js";
import { sendJson } from "../lib/http.js";

// GET /api/read?address=USDC|WPROS|0x…&holder=0x…&lang=en|pt
export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const lang = params.get("lang") === "pt" ? "pt" : "en";
  const address = resolveToken(params.get("address")?.trim() || "USDC");
  const holder = params.get("holder")?.trim() || undefined;

  if (!isAddress(address) || (holder && !isAddress(holder))) {
    const message = lang === "pt" ? "Endereço inválido: use 0x seguido de 40 caracteres." : "Invalid address: use 0x followed by 40 characters.";
    return sendJson(res, 400, { ok: false, error: message });
  }

  const started = Date.now();
  try {
    const client = await getSharedClient();
    takeCallLog(client);
    const state = await readContractState(client, address, { holder });
    const calls = takeCallLog(client);
    return sendJson(
      res,
      200,
      { ok: true, state, ...contractView(state, lang), calls: summarizeCalls(calls), callCount: calls.length, ms: Date.now() - started },
      { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" }
    );
  } catch (e) {
    resetSharedClient();
    const busy = isTransient(e);
    const message = busy
      ? lang === "pt"
        ? "O Chain MCP da Pharos não está respondendo agora. Tente de novo em um minuto."
        : "The Pharos Chain MCP is not responding right now. Please try again in a minute."
      : e.message;
    return sendJson(res, busy ? 503 : 500, { ok: false, error: message });
  }
}
