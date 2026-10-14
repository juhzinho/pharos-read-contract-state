// Rule-based agent: no AI provider or API key. It parses the question, plans which Chain MCP
// tools to call, calls them, and explains the result in plain Portuguese or English.
import { callJson, isTransient, takeCallLog } from "./mcp.js";
import { readContractState } from "./contract-state.js";
import { parseQuestion } from "./intent.js";
import { composeAnswer, composeNetworkAnswer, composeWalletAnswer, helpText, texts } from "./agent-answers.js";
import { short } from "./format.js";

const PLAN_TEXT = {
  pt: {
    plan: "plano",
    contract: (p) => `ler o estado do contrato ${short(p.contract)}${p.holder ? ` e o saldo da carteira ${short(p.holder)}` : ""} no bloco mais recente`,
    wallet: (p) => `ler o saldo de PROS da carteira ${short(p.holder)}`,
    network: "ler as informações da rede e o preço do gas",
    memory: "(contrato da pergunta anterior)",
    cached: (b) => `usando a leitura de menos de 30 s atrás (bloco ${b}), sem nova chamada ao Chain MCP`,
    offline: "O Chain MCP da Pharos não está respondendo agora. Tente de novo em um minuto.",
  },
  en: {
    plan: "plan",
    contract: (p) => `read the state of contract ${short(p.contract)}${p.holder ? ` and the balance of wallet ${short(p.holder)}` : ""} at the latest block`,
    wallet: (p) => `read the PROS balance of wallet ${short(p.holder)}`,
    network: "read network info and the gas price",
    memory: "(contract from the previous question)",
    cached: (b) => `reusing the read from under 30 s ago (block ${b}), no new Chain MCP call`,
    offline: "The Pharos Chain MCP is not responding right now. Please try again in a minute.",
  },
};

export function summarizeCalls(names) {
  const counts = names.reduce((acc, n) => ((acc[n] = (acc[n] ?? 0) + 1), acc), {});
  return Object.entries(counts)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(", ");
}

const CACHE_MS = 30_000;
const cache = new Map();

async function readState(client, contract, holder) {
  const key = `${contract}:${holder ?? ""}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { state: hit.state, cached: true };
  const state = await readContractState(client, contract, { holder: holder ?? undefined });
  cache.set(key, { state, at: Date.now() });
  return { state, cached: false };
}

/**
 * `memory` ({ contract, language }) is mutated so follow-up questions can refer to the previous contract.
 * Follow-up questions about the same contract reuse a recent read; answers still cite its exact block.
 */
export function createAgent(getClient, { log = () => {}, memory = { contract: null, language: "pt" } } = {}) {
  return async function ask(question) {
    const plan = parseQuestion(question, memory);
    const lang = plan.language;
    const t = texts(lang);
    const p = PLAN_TEXT[lang];
    memory.language = lang;

    if (plan.invalidAddress) return t.invalidAddress(plan.invalidAddress);
    if (plan.unknownToken) return t.unknownToken(plan.unknownToken);
    if (plan.intents.includes("help") && !plan.contract) return helpText(lang);

    const wantsNetwork = plan.intents.includes("network");
    const needsContract = plan.intents.some((i) => !["network", "help", "unknown", "balance"].includes(i));

    if (!plan.contract && !plan.holder && !wantsNetwork) {
      return plan.intents.includes("unknown") ? helpText(lang, true) : t.needContract;
    }

    const parts = [];
    let client;
    try {
      client = await getClient();
      takeCallLog(client);
      if (wantsNetwork) {
        log(`  ${p.plan}: ${p.network}`);
        const [chain, gas] = await Promise.all([callJson(client, "get_chain_info"), callJson(client, "get_gas_price")]);
        parts.push(composeNetworkAnswer(chain, gas, lang));
      }
      if (plan.contract) {
        log(`  ${p.plan}: ${p.contract(plan)} ${plan.contractSource === "memory" ? p.memory : ""}`.trimEnd());
        const { state, cached } = await readState(client, plan.contract, plan.holder);
        if (cached) log(`  ${p.cached(state.block)}`);
        parts.push(composeAnswer(plan, state, lang));
        if (state.isContract) memory.contract = plan.contract;
      } else if (plan.holder) {
        log(`  ${p.plan}: ${p.wallet(plan)}`);
        const chain = await callJson(client, "get_chain_info");
        const balance = await callJson(client, "get_balance", { address: plan.holder, block: Number(chain.latestBlock) });
        parts.push(composeWalletAnswer(plan.holder, balance, Number(chain.latestBlock), lang));
      } else if (needsContract) {
        parts.push(t.needContract);
      }
    } catch (e) {
      if (isTransient(e)) return p.offline;
      throw e;
    } finally {
      const calls = client ? takeCallLog(client) : [];
      if (calls.length) log(`  Chain MCP: ${summarizeCalls(calls)} (${calls.length})`);
    }
    return parts.join("\n\n");
  };
}
