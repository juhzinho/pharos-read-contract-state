import { getAddress } from "viem";
import { TOKENS } from "./tokens.js";
import { detectLanguage, normalize } from "./language.js";

export { detectLanguage, normalize };

// Trigger words per intent, Portuguese and English (accents removed, lowercase, matched as whole words).
export const INTENTS = {
  help: [
    "ajuda", "o que voce faz", "como funciona", "comandos", "o que posso perguntar", "exemplos",
    "help", "what can you do", "how does it work", "examples", "commands", "what can i ask",
  ],
  overview: [
    "o que e", "o que eh", "resumo", "resuma", "explica", "explique", "me fala", "me conta", "fale sobre", "estado",
    "tudo sobre", "detalhes", "informacoes", "analisa", "analise", "sobre o contrato", "sobre o token",
    "what is", "what's", "whats", "tell me about", "explain", "summary", "summarize", "overview", "state", "describe",
    "details", "info", "analyze", "analyse", "about the contract", "about the token", "everything about",
  ],
  supply: [
    "total", "supply", "circulacao", "circulando", "quantos existem", "quantas existem", "quantidade", "emitido",
    "emitidos", "emissao", "existem", "existe", "circulating", "circulation", "how many exist", "how many are there",
    "is there", "are there", "exist", "exists", "minted", "issued",
  ],
  owner: [
    "dono", "proprietario", "quem controla", "quem manda", "controle", "administra", "admin",
    "owner", "who owns", "who controls", "controls", "controlled", "ownership",
  ],
  paused: [
    "pausado", "pausa", "travado", "congelado", "bloqueado", "funcionando",
    "pause", "paused", "frozen", "halted", "locked", "working",
  ],
  proxy: [
    "proxy", "atualiza", "atualizavel", "upgrade", "implementacao", "logica", "codigo",
    "upgradeable", "upgradable", "implementation", "logic", "code",
  ],
  balance: [
    "saldo", "quanto tem", "quanto possui", "possui", "carteira",
    "balance", "how much", "holds", "wallet", "holding", "holdings",
  ],
  decimals: ["decimais", "casas", "divisivel", "decimal", "decimals", "decimal places", "divisible"],
  identity: ["nome", "simbolo", "qual token", "que token", "ticker", "symbol", "name", "which token"],
  network: [
    "bloco atual", "ultimo bloco", "altura do bloco", "gas", "taxa", "qual rede", "que rede", "chain id", "chainid",
    "current block", "latest block", "block height", "block number", "fee", "fees", "which network",
  ],
};

const CONTRACT_INTENTS = new Set(["overview", "supply", "owner", "paused", "proxy", "balance", "decimals", "identity"]);

const TOKEN_ALIASES = { usdc: "USDC", "usd coin": "USDC", wpros: "WPROS", "wrapped pros": "WPROS" };
const NOT_IN_REGISTRY = ["usdt", "tether", "dai", "weth", "wbtc", "eth", "btc"];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9])${escape(word)}([^a-z0-9]|$)`).test(text);

/**
 * Turns a question (Portuguese or English) into a plan: which contract, which wallet, which facts.
 * `memory.contract` lets follow-ups like "e quem é o dono?" / "and who owns it?" reuse the previous contract.
 */
export function parseQuestion(question, memory = {}) {
  const raw = String(question ?? "");
  const text = normalize(raw);
  const plan = {
    language: detectLanguage(raw, memory.language),
    intents: [],
    contract: null,
    contractSource: null,
    holder: null,
    unknownToken: null,
    invalidAddress: null,
  };

  for (const [intent, words] of Object.entries(INTENTS)) {
    if (words.some((w) => hasWord(text, w))) plan.intents.push(intent);
  }
  // Only questions about a contract may reuse the previous one ("bom dia" or "current block?" must not).
  const specific = plan.intents.length > 1 ? plan.intents.filter((i) => i !== "overview") : plan.intents;
  const aboutContract = specific.some((i) => CONTRACT_INTENTS.has(i));
  const remembered = aboutContract ? memory.contract : null;

  const addresses = [...raw.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])/g)].map((m) => ({ value: getAddress(m[0].toLowerCase()), index: m.index }));
  const broken = raw.match(/0x[0-9a-zA-Z]+/g)?.find((a) => !/^0x[0-9a-fA-F]{40}$/.test(a));
  if (broken && !addresses.length) plan.invalidAddress = broken;

  const tokenMention = Object.entries(TOKEN_ALIASES).find(([alias]) => hasWord(text, alias));
  const tokenAddress = tokenMention ? getAddress(TOKENS[tokenMention[1]]) : null;
  const unknown = NOT_IN_REGISTRY.find((t) => hasWord(text, t));

  // An address right after "carteira"/"wallet"/"address of" is the wallet being asked about, not the contract.
  const walletCue = (index) =>
    /(carteira|conta|endereco|usuario|holder|wallet|account|address|user)\s*(da|do|de|of)?\s*$/.test(normalize(raw.slice(Math.max(0, index - 25), index)));

  if (tokenAddress) {
    plan.contract = tokenAddress;
    plan.contractSource = tokenMention[1];
    plan.holder = addresses.find((a) => a.value !== tokenAddress)?.value ?? null;
  } else if (addresses.length >= 2) {
    const wallet = addresses.find((a) => walletCue(a.index));
    plan.holder = (wallet ?? addresses[1]).value;
    plan.contract = addresses.find((a) => a.value !== plan.holder).value;
    plan.contractSource = "address";
  } else if (addresses.length === 1) {
    const [only] = addresses;
    const asksBalanceOnly = plan.intents.includes("balance") && !plan.intents.includes("overview");
    const isWallet = walletCue(only.index) || (asksBalanceOnly && memory.contract);
    if (isWallet && memory.contract) {
      plan.holder = only.value;
      plan.contract = memory.contract;
      plan.contractSource = "memory";
      if (!plan.intents.includes("balance")) plan.intents.push("balance");
    } else if (isWallet) {
      plan.holder = only.value;
    } else {
      plan.contract = only.value;
      plan.contractSource = "address";
    }
  } else if (unknown) {
    plan.unknownToken = unknown.toUpperCase();
  } else if (remembered) {
    plan.contract = remembered;
    plan.contractSource = "memory";
  }

  if (plan.holder && !plan.intents.includes("balance")) plan.intents.push("balance");
  // Specific questions win over the generic overview ("what is the owner of USDC?" → just the owner).
  if (plan.intents.length > 1) plan.intents = plan.intents.filter((i) => i !== "overview");
  if (plan.intents.length > 1) plan.intents = plan.intents.filter((i) => i !== "help");
  if (!plan.intents.length) plan.intents = plan.contract ? ["overview"] : ["unknown"];
  return plan;
}
