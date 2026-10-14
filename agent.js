#!/usr/bin/env node
// Terminal front-end for the rule-based agent in lib/agent.js (no AI provider or API key needed).
import readline from "node:readline/promises";
import { connect, CHAIN_MCP_URL } from "./lib/mcp.js";
import { createAgent } from "./lib/agent.js";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  // Same stream as the answers, so the agent's steps always print in order.
  const dim = (line) => console.log(process.stdout.isTTY ? `\x1b[2m${line}\x1b[0m` : line);

  let connection;
  const getClient = () => {
    connection ??= connect(CHAIN_MCP_URL, "pharos-contract-reader-agent").catch((e) => {
      connection = undefined; // allow a fresh attempt on the next question
      throw e;
    });
    return connection;
  };
  const ask = createAgent(getClient, { log: dim });

  try {
    if (question) {
      console.log(await ask(question));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "você/you> " });
    console.log("Leitor de Contratos Pharos — pergunte em português ou inglês / ask in Portuguese or English.");
    console.log('Ex.: "O que é o contrato do USDC?" · "Who owns USDC?" · "ajuda" · "sair" / "exit"\n');
    rl.prompt();
    // The async iterator queues lines that arrive while a question is still being answered.
    for await (const line of rl) {
      const q = line.trim();
      if (/^(sair|exit|quit|tchau|bye)$/i.test(q)) break;
      if (q) {
        if (!process.stdin.isTTY) console.log(q);
        try {
          console.log(`\n${await ask(q)}\n`);
        } catch (e) {
          console.error(`Erro / Error: ${e.message}\n`);
        }
      }
      rl.prompt();
    }
    rl.close();
  } finally {
    if (connection) await (await connection.catch(() => null))?.close().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`Erro / Error: ${e.message}`);
    process.exit(1);
  });
