#!/usr/bin/env node
import { isAddress } from "viem";
import { connect, isTransient, CHAIN_MCP_URL } from "./lib/mcp.js";
import { readContractState } from "./lib/contract-state.js";
import { renderReport } from "./lib/contract-report.js";
import { resolveToken } from "./lib/tokens.js";

const USAGE = `Uso: node read.js [USDC|WPROS|<endereço do contrato>] [<endereço da carteira>] [--block <número>] [--json]`;

const args = process.argv.slice(2);
const json = args.includes("--json");
const blockIndex = args.indexOf("--block");
const block = blockIndex >= 0 ? Number(args[blockIndex + 1]) : undefined;
const [tokenArg, holder] = args.filter((a, i) => !a.startsWith("--") && !(blockIndex >= 0 && i === blockIndex + 1));
const address = resolveToken(tokenArg);

if (args.includes("--help") || !isAddress(address) || (holder && !isAddress(holder))) {
  console.log(USAGE);
  process.exit(args.includes("--help") ? 0 : 1);
}
if (block !== undefined && (!Number.isSafeInteger(block) || block < 0)) {
  console.log(`--block precisa ser um número de bloco válido.\n${USAGE}`);
  process.exit(1);
}

let client;
try {
  client = await connect(CHAIN_MCP_URL, "pharos-read-contract-state");
  const state = await readContractState(client, address, { holder, block });
  console.log(json ? JSON.stringify(state, null, 2) : renderReport(state));
  process.exitCode = state.isContract ? 0 : 1;
} catch (e) {
  console.error(
    isTransient(e)
      ? `Erro: o Chain MCP da Pharos não está respondendo agora (${e.message}). Tente de novo em um minuto.`
      : `Erro: ${e.message}`
  );
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  process.exit();
}
