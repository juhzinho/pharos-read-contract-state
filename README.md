# Pharos Contract Reader — Read Contract State

**Pharos Season of AI · Agent Arena — Read Contract State (Easy · Chain MCP)**

Reads the live state of a deployed Pharos mainnet contract through the official **Chain MCP** (`https://mcp.pharos.xyz/mcp`) and explains it in plain language. No wallet or key needed.

**Live demo:** https://pharos-contract-reader.vercel.app (English/Portuguese toggle)

You can use it in three ways. All of them share the same reading code ([`lib/contract-state.js`](lib/contract-state.js)):

| File | What it is |
|---|---|
| [`read.js`](read.js) | **Script**: always prints the full report |
| [`agent.js`](agent.js) | **Agent** (rule-based, built from scratch, no LLM or API key). It understands questions in English or Portuguese, plans which Chain MCP calls to make, explains the result and remembers the previous contract |
| [`agent-ai.js`](agent-ai.js) | Optional agent driven by an LLM (needs a key in `.env`, see `.env.example`) |

## Chosen contract

**Official USDC on Pharos**: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`, issued by Circle and listed in the [official Token Registry](https://docs.pharos.xyz/getting-started/token-registry). Besides token data, it has an owner, a pause switch and is an upgradeable proxy, so there is more to explain than in a plain token. Any other contract address (or `WPROS`) also works.

## Requirements

| Requirement | How |
|---|---|
| Reads 3+ values via Chain MCP | 13 calls in total: `name`, `symbol`, `decimals`, `totalSupply`, `owner`, `paused`, `balanceOf` (`eth_call`), bytecode (`get_code`), PROS balance (`get_balance`), and proxy implementation/admin from raw storage (`get_storage_at`, EIP-1967 and ZeppelinOS slots) |
| Shows address and block | The block is read once (`get_chain_info`) and **every** read is pinned to it, so all values are consistent |
| Human formatting | Decimals applied without precision loss, addresses labelled (owner, implementation, proxy admin, queried wallet, official tokens), explorer links, plain-language summary |
| README | This file |

## Install and run

Requires Node.js 20.12+.

```bash
git clone https://github.com/juhzinho/pharos-read-contract-state.git
cd pharos-read-contract-state
npm install

# script
node read.js USDC                         # chosen contract
node read.js USDC 0xYourWallet            # + a wallet's balances
node read.js WPROS --block 20170000       # at a past block
node read.js 0xAnyContract --json         # raw JSON

# agent
node agent.js "Who owns the USDC contract?"
node agent.js                             # conversation mode, type "help"

# website (same as the live demo)
npm run web                               # http://localhost:3000
```

## Example output: script

The script prints in Portuguese (the website and agent also speak English):

```
LEITURA DO CONTRATO — dados lidos no bloco 20.175.891 da Pharos (chain 1672)

  Contrato                 USDC oficial (Circle)
  Endereço                 0xC879C018dB60520F4355C26eD1a6D572cdAC1815
  Ver no explorer          https://www.pharosscan.xyz/address/0xC879C018dB60520F4355C26eD1a6D572cdAC1815
  Bloco da leitura         20.175.891
  Tamanho do código        1.798 bytes

  TOKEN
  Nome                     USDC
  Símbolo                  USDC
  Casas decimais           6
  Total em circulação      18.158.760,24 USDC
  Valor bruto on-chain     18158760247433 (÷ 10^6)

  CONTROLE
  Proprietário (owner)     0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92  [proprietário]
  Pausado                  não
  Proxy                    sim (padrão ZeppelinOS)
  Implementação            0xC35BEcB283fEC66626220467265F6d3B3f8cEae8  [implementação]
  Admin do proxy           0x46f958BdEFfD33495E058873cDd114c79Ec13F1b  [admin do proxy]
  Saldo PROS do contrato   0 PROS

EM LINGUAGEM SIMPLES

  Este é o contrato do token USDC na rede Pharos — o mesmo listado na
  documentação oficial como "USDC oficial (Circle)". Existem 18.158.760,24 USDC
  em circulação, e cada USDC pode ser dividido em até 6 casas decimais. …
```

## Example output: agent

```
you> What is the USDC contract?
  plan: read the state of contract 0xC879…1815 at the latest block
  Chain MCP: get_chain_info, get_code, get_balance, eth_call ×6, get_storage_at ×4 (13)

This is the USDC token — the same one listed in the official Pharos docs as "official USDC (Circle)".
There are 18,160,671.28 USDC in circulation. (On-chain this is stored as 18160671281524; dividing by 10^6 gives the real amount.)
The owner is 0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92. This address has special admin permissions over the contract.
The contract is not paused: transfers work normally.
It is a "proxy" contract (ZeppelinOS standard): …

Contract 0xC879C018dB60520F4355C26eD1a6D572cdAC1815 · read at Pharos block 20,177,372
https://www.pharosscan.xyz/address/0xC879C018dB60520F4355C26eD1a6D572cdAC1815

you> And who owns it?
  plan: read the state of contract 0xC879…1815 at the latest block (contract from the previous question)
  reusing the read from under 30 s ago (block 20177372), no new Chain MCP call

The owner is 0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92. …
```

## Live demo site

[`public/index.html`](public/index.html) and the serverless functions in [`api/`](api/) run on Vercel. The functions call the MCP servers from the server, because the Pharos MCP endpoints do not allow browser (CORS) requests.

The same site also hosts live demos of my other two Season of AI builds, each in its own tab:
- Doc-Search CLI: [#docs](https://pharos-contract-reader.vercel.app/#docs), repo [pharos-doc-search-cli](https://github.com/juhzinho/pharos-doc-search-cli)
- Event/Log Monitor: [#events](https://pharos-contract-reader.vercel.app/#events), repo [pharos-event-monitor](https://github.com/juhzinho/pharos-event-monitor)

## Tests

```bash
npm test            # 40 unit tests (question parsing, docs answers) + 17 end-to-end cases against mainnet
npm run test:unit
```
