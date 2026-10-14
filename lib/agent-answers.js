import { explorerAddress, formatAmount, formatInteger, labelOf } from "./format.js";

// Answer templates for the rule-based agent, in Portuguese and English.
const T = {
  pt: {
    footer: (s, n) => `Contrato ${s.address} · lido no bloco ${n} da Pharos\n${explorerAddress(s.address)}`,
    walletFooter: (a, n) => `Carteira ${a} · lida no bloco ${n} da Pharos\n${explorerAddress(a)}`,
    notContract: (s, n) => `Não existe contrato no endereço ${s.address} (bloco ${n}). Pode ser uma carteira comum ou um endereço digitado errado.`,
    notToken: `Esse contrato não funciona como um token padrão (ERC20), então não tem nome, símbolo nem total em circulação para mostrar.`,
    identity: (t, known) => `Esse é o token ${t.name === t.symbol ? t.symbol : `${t.name} (símbolo ${t.symbol})`}${known ? ` — o mesmo listado na documentação oficial da Pharos como "${known}"` : ""}.`,
    contractIntro: `Esse endereço é um contrato na rede Pharos, mas não é um token padrão (ERC20).`,
    supply: (amount, sym, rawValue, d) => `Existem ${amount} ${sym} em circulação. (Na blockchain esse número fica gravado como ${rawValue}; dividindo por 10^${d} chega-se ao valor real.)`,
    decimals: (sym, d, unit) => `Cada ${sym} pode ser dividido em até ${d} casas decimais, ou seja, 1 ${sym} = ${unit} unidades mínimas.`,
    owner: (o) => `O proprietário (owner) é o endereço ${o}${labelOf(o) ? ` (${labelOf(o)})` : ""}. Ele tem permissões especiais de administração sobre o contrato.`,
    noOwner: `Esse contrato não tem um proprietário registrado (não expõe a função owner()). Não há um único endereço com controle de dono sobre ele.`,
    proxyAdmin: (a) => `Quem pode trocar o código do contrato é o administrador do proxy, ${a}.`,
    paused: `Atenção: o contrato está PAUSADO. As transferências estão bloqueadas neste momento.`,
    notPaused: `O contrato não está pausado: as transferências funcionam normalmente.`,
    noPause: `Esse contrato não tem a função de pausa padrão (paused()), então não há um "botão de pausa" que dê para consultar — pelo que dá para ver, as transferências funcionam sem esse controle.`,
    proxy: (p) => `É um contrato "proxy" (padrão ${p.standard}): o endereço público nunca muda, mas a lógica fica em outro contrato, ${p.implementation}. Isso permite que os administradores atualizem o código sem trocar o endereço.`,
    noProxy: `Não é um proxy atualizável (verifiquei os padrões EIP-1967 e ZeppelinOS no armazenamento do contrato). O código dele não pode ser trocado por esses mecanismos.`,
    holds: (amount) => `O contrato guarda ${amount} PROS, a moeda nativa da rede.`,
    balance: (w, tok, pros) => `A carteira ${w} tem ${tok ? `${tok} e ` : ""}${pros} PROS.`,
    ownerIsHolder: `Essa carteira é a própria proprietária do contrato.`,
    needWallet: `Para ver um saldo, me diga a carteira. Exemplo: "saldo de USDC da carteira 0x9F8E…4D92".`,
    needContract: `Sobre qual contrato? Você pode citar USDC, WPROS ou colar um endereço 0x… .`,
    unknownToken: (t) => `${t} não está no registro oficial de tokens da Pharos (docs.pharos.xyz/getting-started/token-registry). Se você tiver o endereço do contrato, cole aqui (0x…).`,
    invalidAddress: (a) => `"${a}" não é um endereço válido. Um endereço tem 0x seguido de 40 caracteres (0-9, a-f).`,
    network: (chainId, block, gas) => `Rede Pharos Pacific Mainnet (chain ID ${chainId}). O bloco mais recente é o ${block}, e o preço do gas agora é ${gas} gwei.`,
    unknown: `Não entendi a pergunta. Eu leio contratos da Pharos e explico em linguagem simples.`,
    help: `Eu sou um agente que lê contratos da rede Pharos pelo Chain MCP e explica o que encontrei em linguagem simples. Posso dizer o que é um token, quanto existe em circulação, quem é o dono, se está pausado, se o código pode ser atualizado e o saldo de uma carteira.`,
    examples: [
      "O que é o contrato do USDC?",
      "Quem é o dono do USDC?",
      "Quanto WPROS existe?",
      "O USDC está pausado?",
      "Saldo de USDC da carteira 0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92",
      "Explique o contrato 0x52c48d4213107b20bc583832b0d951fb9ca8f0b0",
    ],
    examplesTitle: "Exemplos de perguntas:",
  },
  en: {
    footer: (s, n) => `Contract ${s.address} · read at Pharos block ${n}\n${explorerAddress(s.address)}`,
    walletFooter: (a, n) => `Wallet ${a} · read at Pharos block ${n}\n${explorerAddress(a)}`,
    notContract: (s, n) => `There is no contract at ${s.address} (block ${n}). It may be a regular wallet or a mistyped address.`,
    notToken: `This contract doesn't behave like a standard (ERC20) token, so it has no name, symbol or supply to show.`,
    identity: (t, known) => `This is the ${t.name === t.symbol ? t.symbol : `${t.name} (symbol ${t.symbol})`} token${known ? ` — the same one listed in the official Pharos docs as "${known}"` : ""}.`,
    contractIntro: `This address is a contract on Pharos, but it is not a standard (ERC20) token.`,
    supply: (amount, sym, rawValue, d) => `There are ${amount} ${sym} in circulation. (On-chain this is stored as ${rawValue}; dividing by 10^${d} gives the real amount.)`,
    decimals: (sym, d, unit) => `Each ${sym} can be split into up to ${d} decimal places, so 1 ${sym} = ${unit} base units.`,
    owner: (o) => `The owner is ${o}${labelOf(o, {}, "en") ? ` (${labelOf(o, {}, "en")})` : ""}. This address has special admin permissions over the contract.`,
    noOwner: `This contract has no registered owner (it doesn't expose owner()). No single address holds owner control over it.`,
    proxyAdmin: (a) => `The address that can swap the contract's code is the proxy admin, ${a}.`,
    paused: `Heads up: the contract is PAUSED. Transfers are blocked right now.`,
    notPaused: `The contract is not paused: transfers work normally.`,
    noPause: `This contract doesn't have the standard pause function (paused()), so there's no "pause switch" to check — as far as can be seen, transfers work without that control.`,
    proxy: (p) => `It is a "proxy" contract (${p.standard} standard): the public address never changes, but the logic lives in another contract, ${p.implementation}. That lets the admins upgrade the code without changing the address.`,
    noProxy: `It is not an upgradeable proxy (I checked the EIP-1967 and ZeppelinOS storage slots). Its code can't be swapped through those mechanisms.`,
    holds: (amount) => `The contract holds ${amount} PROS, the network's native coin.`,
    balance: (w, tok, pros) => `Wallet ${w} holds ${tok ? `${tok} and ` : ""}${pros} PROS.`,
    ownerIsHolder: `This wallet is the contract's owner itself.`,
    needWallet: `To check a balance, tell me the wallet. Example: "USDC balance of wallet 0x9F8E…4D92".`,
    needContract: `Which contract? You can say USDC, WPROS or paste a 0x… address.`,
    unknownToken: (t) => `${t} is not in the official Pharos token registry (docs.pharos.xyz/getting-started/token-registry). If you have its contract address, paste it here (0x…).`,
    invalidAddress: (a) => `"${a}" is not a valid address. An address is 0x followed by 40 characters (0-9, a-f).`,
    network: (chainId, block, gas) => `Pharos Pacific Mainnet (chain ID ${chainId}). The latest block is ${block}, and gas currently costs ${gas} gwei.`,
    unknown: `I didn't understand the question. I read Pharos contracts and explain them in plain language.`,
    help: `I'm an agent that reads Pharos contracts through Chain MCP and explains what I find in plain language. I can tell you what a token is, how much is in circulation, who owns it, whether it's paused, whether its code can be upgraded, and a wallet's balance.`,
    examples: [
      "What is the USDC contract?",
      "Who owns USDC?",
      "How much WPROS is there?",
      "Is USDC paused?",
      "What is the USDC balance of wallet 0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92?",
      "Explain the contract 0x52c48d4213107b20bc583832b0d951fb9ca8f0b0",
    ],
    examplesTitle: "Example questions:",
  },
};

export const texts = (lang) => T[lang] ?? T.pt;

export function helpText(lang, didNotUnderstand = false) {
  const t = texts(lang);
  return `${didNotUnderstand ? t.unknown : t.help}\n\n${t.examplesTitle}\n${t.examples.map((e) => `  • ${e}`).join("\n")}`;
}

/** Builds the answer for a plan from the contract state read on-chain. */
export function composeAnswer(plan, state, lang) {
  const t = texts(lang);
  const block = formatInteger(state.block, lang);
  const tok = state.token;
  const amount = (raw, d, max = 2) => formatAmount(raw, d, max, lang);
  const lines = [];
  const has = (i) => plan.intents.includes(i);

  if (!state.isContract) {
    lines.push(t.notContract(state, block));
    return `${lines.join("\n\n")}\n\n${t.footer(state, block)}`;
  }

  const identity = () => lines.push(tok ? t.identity(tok, labelOf(state.address, {}, lang)) : t.contractIntro);
  const supply = () => (tok ? lines.push(t.supply(amount(tok.totalSupply, tok.decimals), tok.symbol, tok.totalSupply, tok.decimals)) : lines.push(t.notToken));
  const decimals = () => tok && lines.push(t.decimals(tok.symbol, tok.decimals, formatInteger(10n ** BigInt(tok.decimals), lang)));
  const owner = () => {
    lines.push(state.owner ? t.owner(state.owner) : t.noOwner);
    if (state.proxy?.admin) lines.push(t.proxyAdmin(state.proxy.admin));
  };
  const paused = () => lines.push(state.paused === true ? t.paused : state.paused === false ? t.notPaused : t.noPause);
  const proxy = () => lines.push(state.proxy ? t.proxy(state.proxy) : t.noProxy);
  const holds = () => state.nativeBalanceWei && BigInt(state.nativeBalanceWei) > 0n && lines.push(t.holds(amount(state.nativeBalanceWei, 18)));

  if (has("overview")) {
    identity();
    if (tok) supply();
    if (tok) decimals();
    owner();
    paused();
    proxy();
    holds();
  } else {
    if (has("identity")) identity();
    if (has("supply")) supply();
    if (has("decimals") && tok) decimals();
    if (has("decimals") && !tok && !has("supply")) lines.push(t.notToken);
    if (has("owner")) owner();
    if (has("paused")) paused();
    if (has("proxy")) proxy();
  }

  if (has("balance")) {
    if (state.holder) {
      const tokenPart = tok && state.holder.tokenBalance !== null ? `${amount(state.holder.tokenBalance, tok.decimals, 6)} ${tok.symbol}` : null;
      lines.push(t.balance(state.holder.address, tokenPart, amount(state.holder.nativeBalanceWei ?? 0, 18, 6)));
      if (state.owner && state.owner.toLowerCase() === state.holder.address.toLowerCase()) lines.push(t.ownerIsHolder);
    } else if (lines.length === 0) {
      lines.push(t.needWallet);
    }
  }
  if (!lines.length) identity();

  return `${lines.join("\n\n")}\n\n${t.footer(state, block)}`;
}

export function composeWalletAnswer(address, nativeBalance, block, lang) {
  const t = texts(lang);
  const pros = formatAmount(nativeBalance.balanceWei, 18, 6, lang);
  return `${t.balance(address, null, pros)}\n\n${t.walletFooter(address, formatInteger(block, lang))}`;
}

export function composeNetworkAnswer(chain, gas, lang) {
  return texts(lang).network(chain.chainId, formatInteger(chain.latestBlock, lang), gas.gasPriceGwei);
}