#!/usr/bin/env node
import readline from "node:readline/promises";
import { connect, callTool, listTools, CHAIN_MCP_URL } from "./lib/mcp.js";
import { chat, llmConfig, loadEnv } from "./lib/llm.js";
import { readContractState } from "./lib/contract-state.js";
import { humanize, plainSummary } from "./lib/contract-report.js";
import { TOKENS } from "./lib/tokens.js";

const MAX_STEPS = 10;
const BLOCKED_TOOLS = new Set(["send_raw_transaction"]); // this agent only reads

const SYSTEM = `Você é o "Leitor de Contratos Pharos", um agente que explica o estado de contratos inteligentes da rede Pharos (Pacific Mainnet, chain ID 1672) para pessoas que NÃO são desenvolvedoras.

Como trabalhar:
- Sempre leia dados reais com as ferramentas antes de responder. Nunca invente valores.
- Para entender um contrato, comece por read_contract_state: ela lê nome, símbolo, total em circulação, proprietário, pausa e proxy, tudo no mesmo bloco, já formatado.
- Use as outras ferramentas do Chain MCP (get_logs, get_transaction, get_block etc.) só quando a pergunta pedir algo que read_contract_state não cobre.
- Tokens oficiais da documentação: USDC = ${TOKENS.USDC}, WPROS = ${TOKENS.WPROS}.

Como responder (em português do Brasil):
- Linguagem simples, frases curtas, sem jargão. Se usar um termo técnico, explique em poucas palavras.
- Sempre informe o endereço do contrato e o número do bloco em que os dados foram lidos.
- Use os valores já formatados (com casas decimais aplicadas) e diga o papel de cada endereço (proprietário, implementação etc.).
- Inclua o link do explorer quando houver.
- Você só lê dados. Nunca peça nem aceite chave privada ou frase-semente; se alguém oferecer, diga que não é necessário e que a pessoa deve considerar essa chave comprometida.`;

const READ_STATE_TOOL = {
  type: "function",
  function: {
    name: "read_contract_state",
    description:
      "Lê o estado de um contrato na Pharos via Chain MCP (código, saldo PROS, dados ERC20, owner, paused, proxy e opcionalmente o saldo de uma carteira), com todos os valores do mesmo bloco, já formatados para humanos.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Endereço do contrato (0x…), ou USDC / WPROS" },
        holder: { type: "string", description: "Opcional: carteira cujo saldo deve ser lido" },
        block: { type: "integer", description: "Opcional: número do bloco; padrão é o mais recente" },
      },
      required: ["address"],
    },
  },
};

// Some providers reject anyOf/union types in tool schemas; collapse them to strings.
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf ?? schema.oneOf;
    const array = variants.find((v) => v.type === "array");
    return array
      ? { type: "array", items: sanitizeSchema(array.items), description: schema.description }
      : { type: "string", description: [schema.description, "número ou texto"].filter(Boolean).join(" — ") };
  }
  const out = { ...schema };
  delete out.$schema;
  delete out.additionalProperties;
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, sanitizeSchema(v)]));
  if (out.items) out.items = sanitizeSchema(out.items);
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

// The model may send block numbers as strings once anyOf was collapsed.
function normalizeArgs(args) {
  const out = { ...args };
  for (const key of ["block", "fromBlock", "toBlock"]) {
    if (typeof out[key] === "string" && /^\d+$/.test(out[key])) out[key] = Number(out[key]);
  }
  return out;
}

async function createAgent({ client, config, log = () => {} }) {
  const mcpTools = await listTools(client);
  const tools = [
    READ_STATE_TOOL,
    ...mcpTools
      .filter((t) => !BLOCKED_TOOLS.has(t.name))
      .map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description ?? "", parameters: sanitizeSchema(t.inputSchema) },
      })),
  ];
  const allowed = new Set(tools.map((t) => t.function.name));
  const messages = [{ role: "system", content: SYSTEM }];

  async function runTool(name, args) {
    if (!allowed.has(name)) return { erro: `ferramenta não permitida: ${name}` };
    if (name === "read_contract_state") {
      const address = TOKENS[String(args.address).toUpperCase()] ?? args.address;
      const state = await readContractState(client, address, {
        holder: args.holder || undefined,
        block: args.block === undefined || args.block === null || args.block === "" ? undefined : Number(args.block),
      });
      return { ...humanize(state), resumoEmLinguagemSimples: plainSummary(state) };
    }
    const text = await callTool(client, name, normalizeArgs(args));
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return async function ask(question) {
    messages.push({ role: "user", content: question });
    for (let step = 0; step < MAX_STEPS; step++) {
      const reply = await chat(config, { messages, tools });
      messages.push(reply);
      if (!reply.tool_calls?.length) return reply.content ?? "";

      for (const call of reply.tool_calls) {
        let args = {};
        let result;
        try {
          args = JSON.parse(call.function.arguments || "{}");
          log(`  → ${call.function.name}(${JSON.stringify(args)})`);
          result = await runTool(call.function.name, args);
        } catch (e) {
          result = { erro: e.message };
          log(`    ! ${e.message}`);
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 20_000) });
      }
    }
    return "Não consegui concluir a análise dentro do limite de passos. Tente uma pergunta mais específica.";
  };
}

async function main() {
  loadEnv(process.env.PHAROS_ENV_FILE ?? ".env");
  let config;
  try {
    config = llmConfig();
  } catch (e) {
    console.error(`Erro: ${e.message}`);
    process.exit(1);
  }

  const question = process.argv.slice(2).join(" ").trim();
  const client = await connect(CHAIN_MCP_URL, "pharos-contract-reader-agent");
  const log = (line) => console.error(`\x1b[2m${line}\x1b[0m`);
  const ask = await createAgent({ client, config, log });
  log(`Agente conectado ao Chain MCP (${CHAIN_MCP_URL}) | IA: ${config.provider} / ${config.model}`);

  try {
    if (question) {
      console.log(`\n${await ask(question)}`);
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log('Pergunte sobre qualquer contrato da Pharos (ex.: "o que é o contrato do USDC?"). Digite "sair" para encerrar.\n');
      for (;;) {
        const q = (await rl.question("você> ")).trim();
        if (!q) continue;
        if (/^(sair|exit|quit)$/i.test(q)) break;
        try {
          console.log(`\nagente> ${await ask(q)}\n`);
        } catch (e) {
          console.error(`Erro: ${e.message}\n`);
        }
      }
      rl.close();
    }
  } finally {
    await client.close().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`Erro: ${e.message}`);
    process.exit(1);
  });
