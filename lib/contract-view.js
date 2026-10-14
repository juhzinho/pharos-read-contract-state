import { contractLabels } from "./contract-report.js";
import { composeAnswer } from "./agent-answers.js";
import { explorerAddress, formatAmount, formatInteger } from "./format.js";

const L = {
  pt: {
    contract: "Contrato", address: "Endereço", block: "Bloco da leitura", code: "Tamanho do código", name: "Nome", symbol: "Símbolo",
    decimals: "Casas decimais", supply: "Total em circulação", raw: "Valor bruto on-chain", owner: "Proprietário (owner)", paused: "Pausado",
    proxy: "Proxy", impl: "Implementação", admin: "Admin do proxy", pros: "Saldo PROS do contrato", wallet: "Carteira consultada",
    walletToken: "Saldo do token na carteira", walletPros: "Saldo PROS da carteira", yes: "sim", no: "não", none: "não expõe",
    pausedYes: "SIM — transferências bloqueadas", noContract: "Nenhum contrato neste endereço", bytes: "bytes", standard: "padrão",
    roles: { owner: "proprietário", impl: "implementação", admin: "admin do proxy", holder: "carteira consultada" },
  },
  en: {
    contract: "Contract", address: "Address", block: "Read at block", code: "Code size", name: "Name", symbol: "Symbol",
    decimals: "Decimals", supply: "Total supply", raw: "Raw on-chain value", owner: "Owner", paused: "Paused",
    proxy: "Proxy", impl: "Implementation", admin: "Proxy admin", pros: "Contract PROS balance", wallet: "Queried wallet",
    walletToken: "Wallet token balance", walletPros: "Wallet PROS balance", yes: "yes", no: "no", none: "not exposed",
    pausedYes: "YES — transfers blocked", noContract: "No contract at this address", bytes: "bytes", standard: "standard",
    roles: { owner: "owner", impl: "implementation", admin: "proxy admin", holder: "queried wallet" },
  },
};

/** Rows for the web page: [label, value, tag?, isAddress?], formatted for the chosen language. */
export function contractView(state, lang = "en") {
  const l = L[lang] ?? L.en;
  const t = state.token;
  const known = contractLabels(state, lang);
  const tag = (address) => known[address.toLowerCase()];
  const rows = [
    [l.contract, tag(state.address, "")],
    [l.address, state.address, null, true],
    [l.block, formatInteger(state.block, lang)],
  ];
  if (!state.isContract) {
    rows.push([l.code, l.noContract]);
  } else {
    rows.push([l.code, `${formatInteger(state.bytecodeBytes, lang)} ${l.bytes}`]);
    if (t) {
      rows.push(
        [l.name, t.name],
        [l.symbol, t.symbol],
        [l.decimals, String(t.decimals)],
        [l.supply, `${formatAmount(t.totalSupply, t.decimals, 2, lang)} ${t.symbol}`],
        [l.raw, `${t.totalSupply} (÷ 10^${t.decimals})`]
      );
    }
    rows.push([l.owner, state.owner ?? l.none, state.owner ? tag(state.owner, l.roles.owner) : null, Boolean(state.owner)]);
    rows.push([l.paused, state.paused === null ? l.none : state.paused ? l.pausedYes : l.no]);
    rows.push([l.proxy, state.proxy ? `${l.yes} (${l.standard} ${state.proxy.standard})` : l.no]);
    if (state.proxy) {
      rows.push([l.impl, state.proxy.implementation, tag(state.proxy.implementation, l.roles.impl), true]);
      if (state.proxy.admin) rows.push([l.admin, state.proxy.admin, tag(state.proxy.admin, l.roles.admin), true]);
    }
    if (state.nativeBalanceWei !== null) rows.push([l.pros, `${formatAmount(state.nativeBalanceWei, 18, 4, lang)} PROS`]);
  }
  if (state.holder) {
    rows.push([l.wallet, state.holder.address, tag(state.holder.address, l.roles.holder), true]);
    if (t && state.holder.tokenBalance !== null) rows.push([l.walletToken, `${formatAmount(state.holder.tokenBalance, t.decimals, 6, lang)} ${t.symbol}`]);
    rows.push([l.walletPros, `${formatAmount(state.holder.nativeBalanceWei ?? 0, 18, 6, lang)} PROS`]);
  }

  const plan = { intents: state.holder ? ["overview", "balance"] : ["overview"] };
  const summary = composeAnswer(plan, state, lang).split("\n\n").slice(0, -1).join(" ");
  return { rows, summary, explorer: explorerAddress(state.address) };
}
