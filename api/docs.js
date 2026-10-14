import { DOCS_MCP_URL, isTransient } from "../lib/mcp.js";
import { askDocs, parseAnswer, searchDocs, snippet } from "../lib/docs.js";
import { getSharedClient, resetSharedClient } from "../lib/server-client.js";
import { sendJson } from "../lib/http.js";

// GET /api/docs?q=<question>            concise answer + sources (askQuestion)
// GET /api/docs?q=<terms>&mode=search   matching pages (searchDocumentation)
export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 500);
  const mode = params.get("mode") === "search" ? "search" : "ask";
  if (!q) return sendJson(res, 400, { ok: false, error: "Empty question / pergunta vazia" });

  const started = Date.now();
  try {
    const client = await getSharedClient(DOCS_MCP_URL);
    const body =
      mode === "search"
        ? { results: (await searchDocs(client, q, 8)).map((r) => ({ title: r.title, link: r.link, snippet: snippet(r.content) })) }
        : parseAnswer(await askDocs(client, q));
    return sendJson(res, 200, { ok: true, mode, tool: mode === "search" ? "searchDocumentation" : "askQuestion", ...body, ms: Date.now() - started });
  } catch (e) {
    resetSharedClient(DOCS_MCP_URL);
    const message = isTransient(e) ? "The Pharos Docs MCP is not responding right now. Please try again in a minute." : e.message;
    return sendJson(res, isTransient(e) ? 503 : 500, { ok: false, error: message });
  }
}
