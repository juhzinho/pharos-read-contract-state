import { runCases } from "./runner.js";
import { startFakeLlm } from "./fake-llm.js";

const READ = "read.js";
const AGENT = "agent.js";
const AGENT_AI = "agent-ai.js";
const USDC_OWNER = "0x9f8ea09770dc38fc61f5a62031b3be0526d54d92";
const WPROS = "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const fake = await startFakeLlm();
const FAKE_ENV = { LLM_BASE_URL: `http://127.0.0.1:${fake.address().port}`, LLM_MODEL: "fake", PHAROS_ENV_FILE: "none.env" };

await runCases([
  // script
  {
    name: "read: USDC meets the 4 requirements",
    args: [READ, "USDC"],
    code: 0,
    expect: /bloco [\d.]+[\s\S]*Endereço\s+0xC879C018dB60520F4355C26eD1a6D572cdAC1815[\s\S]*Total em circulação\s+[\d.]+,\d+ USDC[\s\S]*\[proprietário\][\s\S]*EM LINGUAGEM SIMPLES/,
  },
  { name: "read: address with two roles", args: [READ, "USDC", USDC_OWNER], code: 0, expect: /\[proprietário \+ carteira consultada\][\s\S]*própria proprietária/ },
  { name: "read: WPROS at a fixed block", args: [READ, "WPROS", "--block", "20170000"], code: 0, expect: /bloco 20\.170\.000[\s\S]*Total em circulação\s+[\d.]+,\d+ WPROS/ },
  { name: "read: --json", args: [READ, WPROS, "--json"], code: 0, expect: /"symbol": "WPROS"/ },
  { name: "read: invalid address", args: [READ, "0x123"], code: 1, expect: /Uso:/ },
  { name: "read: invalid --block", args: [READ, "USDC", "--block", "abc"], code: 1, expect: /--block precisa/ },
  { name: "read: address without a contract", args: [READ, DEAD], code: 1, expect: /Nenhum contrato encontrado[\s\S]*não tem nenhum contrato/ },

  // rule-based agent
  { name: "agent: instant help", args: [AGENT, "help"], code: 0, expect: /Example questions:/, reject: /Chain MCP:/ },
  {
    name: "agent: question in English",
    args: [AGENT, "Who owns the USDC contract?"],
    code: 0,
    expect: /plan: read the state of contract 0xC879…1815[\s\S]*Chain MCP: .*eth_call[\s\S]*The owner is 0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92[\s\S]*read at Pharos block [\d,]+/,
  },
  { name: "agent: question in Portuguese", args: [AGENT, "Quanto WPROS existe?"], code: 0, expect: /Existem [\d.]+,\d+ WPROS em circulação[\s\S]*lido no bloco [\d.]+ da Pharos/ },
  {
    name: "agent: conversation with memory (en + pt)",
    args: [AGENT],
    input: "What is the USDC contract?\nAnd who owns it?\nIs it upgradeable?\ne o WPROS está pausado?\nquantas casas decimais ele tem?\nWhat is the current block?\nbom dia\nexit\n",
    code: 0,
    expect: /This is the USDC token[\s\S]*The owner is[\s\S]*It is a "proxy" contract[\s\S]*função de pausa padrão[\s\S]*1 WPROS = 1\.000\.000\.000\.000\.000\.000 unidades[\s\S]*latest block is [\d,]+, and gas currently costs[\s\S]*Não entendi a pergunta/,
    reject: /latest block is [\d,]+[^\n]*\n\nThis is the USDC/,
  },
  { name: "agent: token outside the registry", args: [AGENT, "What about USDT?"], code: 0, expect: /USDT is not in the official Pharos token registry/ },
  { name: "agent: broken address", args: [AGENT, "Explique 0x1234"], code: 0, expect: /não é um endereço válido/ },
  { name: "agent: address without a contract", args: [AGENT, `Explain the contract ${DEAD}`], code: 0, expect: /There is no contract at/ },

  // optional LLM agent (fake LLM, real Chain MCP)
  { name: "agent-ai: full tool loop", args: [AGENT_AI, "O que é o contrato do USDC?"], env: FAKE_ENV, code: 0, expect: /Contrato 0xC879C018dB60520F4355C26eD1a6D572cdAC1815, lido no bloco [\d.]+\. Este é o contrato do token USDC/ },
  { name: "agent-ai: no LLM configured", args: [AGENT_AI, "oi"], env: { PHAROS_ENV_FILE: "none.env" }, code: 1, expect: /nenhum provedor de IA configurado/ },
  { name: "agent-ai: LLM unreachable", args: [AGENT_AI, "oi"], env: { LLM_BASE_URL: "http://127.0.0.1:9", PHAROS_ENV_FILE: "none.env" }, code: 1, expect: /não foi possível falar com a IA/ },
]);

fake.close();
