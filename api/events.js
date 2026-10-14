import { isAddress } from "viem";
import { isTransient, takeCallLog } from "../lib/mcp.js";
import { fetchTransfers, latestBlock, MAX_WINDOW, readTokenInfo, TRANSFER_TOPIC } from "../lib/transfers.js";
import { formatAmount, labelOf } from "../lib/format.js";
import { summarizeCalls } from "../lib/agent.js";
import { getSharedClient, resetSharedClient } from "../lib/server-client.js";
import { resolveToken } from "../lib/tokens.js";
import { sendJson } from "../lib/http.js";

const OVERLAP = 5; // re-read recent blocks in case their logs were indexed late; the page drops repeats by tx + log index
const MAX_EVENTS = 100;
const tokenInfo = new Map();

const both = (fn) => ({ en: fn("en"), pt: fn("pt") });

// GET /api/events?token=USDC|WPROS|0x…&lookback=200    first load: the last `lookback` blocks
// GET /api/events?token=…&since=<last block checked>   live polling: only blocks after `since`
export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const token = resolveToken(params.get("token")?.trim() || "USDC").toLowerCase();
  const since = params.has("since") ? Number(params.get("since")) : null;
  const lookback = Number(params.get("lookback") ?? 200);
  if (!isAddress(token)) return sendJson(res, 400, { ok: false, error: "Invalid token address" });
  if (since !== null && !(Number.isInteger(since) && since >= 0)) return sendJson(res, 400, { ok: false, error: "since must be a block number" });
  if (!Number.isInteger(lookback) || lookback < 1 || lookback > MAX_WINDOW) {
    return sendJson(res, 400, { ok: false, error: `lookback must be 1 to ${MAX_WINDOW}` });
  }

  const started = Date.now();
  try {
    const client = await getSharedClient();
    takeCallLog(client);
    const [info, head] = await Promise.all([tokenInfo.get(token) ?? readTokenInfo(client, token), latestBlock(client)]);
    tokenInfo.set(token, info);
    // A page that was asleep for a long time only gets the most recent window, like the CLI's lookback.
    const fromBlock = Math.max(since === null ? head - lookback + 1 : since + 1 - OVERLAP, head - MAX_WINDOW + 1, 0);
    const { transfers, skipped } = fromBlock <= head ? await fetchTransfers(client, token, fromBlock, head) : { transfers: [], skipped: 0 };
    const events = transfers.slice(-MAX_EVENTS).map((t) => ({
      key: `${t.tx}:${t.logIndex}`,
      block: t.block,
      kind: t.kind,
      amount: both((lang) => formatAmount(t.value, info.decimals, 6, lang)),
      from: t.from,
      to: t.to,
      fromLabel: both((lang) => labelOf(t.from, {}, lang) ?? null),
      toLabel: both((lang) => labelOf(t.to, {}, lang) ?? null),
      tx: t.tx,
    }));
    const calls = takeCallLog(client);
    return sendJson(res, 200, {
      ok: true,
      token,
      symbol: info.symbol,
      decimals: info.decimals,
      topic: TRANSFER_TOPIC,
      head,
      fromBlock,
      toBlock: head,
      total: transfers.length,
      events,
      skipped,
      calls: summarizeCalls(calls),
      callCount: calls.length,
      ms: Date.now() - started,
    });
  } catch (e) {
    resetSharedClient();
    const busy = isTransient(e);
    const message = busy ? "The Pharos Chain MCP is not responding right now. Retrying…" : `${token} did not respond as an ERC20 token (${e.shortMessage ?? e.message})`;
    return sendJson(res, busy ? 503 : 400, { ok: false, error: message });
  }
}
