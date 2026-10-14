import { explorerAddress, formatAmount, formatInteger, labelOf, short } from "./format.js";

export function tokenTitle(token) {
  if (!token) return null;
  return token.name === token.symbol ? token.symbol : `${token.name} (${token.symbol})`;
}

/** One label per address; an address with several roles (e.g. owner and queried wallet) gets them all. */
const ROLES = {
  pt: { contract: "contrato consultado", owner: "proprietário", impl: "implementação", admin: "admin do proxy", holder: "carteira consultada" },
  en: { contract: "queried contract", owner: "owner", impl: "implementation", admin: "proxy admin", holder: "queried wallet" },
};

export function contractLabels(state, lang = "pt") {
  const r = ROLES[lang] ?? ROLES.pt;
  const roles = new Map();
  const add = (address, role) => {
    if (!address) return;
    const key = address.toLowerCase();
    roles.set(key, [...(roles.get(key) ?? []), role]);
  };
  add(state.address, labelOf(state.address, {}, lang) ?? tokenTitle(state.token) ?? r.contract);
  add(state.owner, r.owner);
  add(state.proxy?.implementation, r.impl);
  add(state.proxy?.admin, r.admin);
  add(state.holder?.address, r.holder);

  const labels = {};
  for (const [key, list] of roles) {
    const known = labelOf(key, {}, lang);
    labels[key] = [...new Set(known && !list.includes(known) ? [known, ...list] : list)].join(" + ");
  }
  return labels;
}

/** Human-readable values, shared by the CLI report and the agent tool. */
export function humanize(state) {
  const labels = contractLabels(state);
  const t = state.token;
  return {
    rede: `Pharos (chain ${state.chainId})`,
    bloco: formatInteger(state.block),
    contrato: { endereco: state.address, rotulo: labels[state.address.toLowerCase()], explorer: explorerAddress(state.address) },
    ehContrato: state.isContract,
    tamanhoDoCodigo: `${formatInteger(state.bytecodeBytes)} bytes`,
    saldoPROSdoContrato: state.nativeBalanceWei === null ? null : `${formatAmount(state.nativeBalanceWei, 18, 4)} PROS`,
    token: t && {
      nome: t.name,
      simbolo: t.symbol,
      decimais: t.decimals,
      totalEmCirculacao: `${formatAmount(t.totalSupply, t.decimals)} ${t.symbol}`,
      totalBruto: t.totalSupply,
    },
    proprietario: state.owner && { endereco: state.owner, rotulo: labels[state.owner.toLowerCase()] },
    pausado: state.paused,
    proxy: state.proxy && {
      padrao: state.proxy.standard,
      implementacao: state.proxy.implementation,
      administrador: state.proxy.admin,
    },
    carteira: state.holder && {
      endereco: state.holder.address,
      saldoToken: t && state.holder.tokenBalance !== null ? `${formatAmount(state.holder.tokenBalance, t.decimals, 6)} ${t.symbol}` : null,
      saldoPROS: state.holder.nativeBalanceWei === null ? null : `${formatAmount(state.holder.nativeBalanceWei, 18, 6)} PROS`,
    },
  };
}

export function plainSummary(state) {
  const labels = contractLabels(state);
  const lines = [];
  const t = state.token;

  if (!state.isContract) {
    return `O endereço ${state.address} não tem nenhum contrato na rede Pharos no bloco ${formatInteger(state.block)}. Pode ser uma carteira comum ou um endereço digitado errado.`;
  }

  if (t) {
    const known = labelOf(state.address);
    lines.push(
      `Este é o contrato do token ${tokenTitle(t)} na rede Pharos${known ? ` — o mesmo listado na documentação oficial como "${known}"` : ""}.`,
      `Existem ${formatAmount(t.totalSupply, t.decimals)} ${t.symbol} em circulação, e cada ${t.symbol} pode ser dividido em até ${t.decimals} casas decimais.`
    );
  } else {
    lines.push(`Este endereço é um contrato na rede Pharos, mas não funciona como um token padrão (ERC20).`);
  }
  if (state.nativeBalanceWei && BigInt(state.nativeBalanceWei) > 0n) {
    lines.push(`O contrato guarda ${formatAmount(state.nativeBalanceWei, 18)} PROS, a moeda nativa da rede.`);
  }

  if (state.owner) {
    lines.push(`Ele tem um proprietário, o endereço ${short(state.owner)}, que possui permissões especiais de administração.`);
  }
  if (state.paused === true) lines.push(`Atenção: o contrato está PAUSADO, então as transferências estão bloqueadas agora.`);
  if (state.paused === false) lines.push(`Ele não está pausado, então as transferências funcionam normalmente.`);
  if (state.proxy) {
    lines.push(
      `É um contrato do tipo "proxy": o endereço público nunca muda, mas a lógica fica em outro contrato (${short(state.proxy.implementation)}), o que permite aos administradores atualizar o código.`
    );
  }
  if (state.holder) {
    const isOwner = state.owner && state.owner.toLowerCase() === state.holder.address.toLowerCase();
    const tokenPart = t && state.holder.tokenBalance !== null ? `${formatAmount(state.holder.tokenBalance, t.decimals, 6)} ${t.symbol} e ` : "";
    lines.push(
      `A carteira consultada (${short(state.holder.address)})${isOwner ? ", que é a própria proprietária do contrato," : ""} tem ${tokenPart}${formatAmount(state.holder.nativeBalanceWei ?? 0, 18, 6)} PROS.`
    );
  }
  return lines.join(" ");
}

export function renderReport(state) {
  const h = humanize(state);
  const labels = contractLabels(state);
  const rows = [];
  const row = (label, value) => value !== null && value !== undefined && rows.push(`  ${label.padEnd(24)} ${value}`);

  rows.push(`LEITURA DO CONTRATO — dados lidos no bloco ${h.bloco} da ${h.rede}`, "");
  row("Contrato", `${h.contrato.rotulo}`);
  row("Endereço", h.contrato.endereco);
  row("Ver no explorer", h.contrato.explorer);
  row("Bloco da leitura", h.bloco);

  if (!state.isContract) {
    rows.push("", "  Nenhum contrato encontrado neste endereço.");
  } else {
    row("Tamanho do código", h.tamanhoDoCodigo);
    if (h.token) {
      rows.push("", "  TOKEN");
      row("Nome", h.token.nome);
      row("Símbolo", h.token.simbolo);
      row("Casas decimais", h.token.decimais);
      row("Total em circulação", h.token.totalEmCirculacao);
      row("Valor bruto on-chain", `${h.token.totalBruto} (÷ 10^${h.token.decimais})`);
    }
    rows.push("", "  CONTROLE");
    row("Proprietário (owner)", state.owner ? tagged(state.owner, labels) : "não tem / não expõe owner()");
    row("Pausado", state.paused === null ? "não expõe paused()" : state.paused ? "SIM — transferências bloqueadas" : "não");
    row("Proxy", h.proxy ? `sim (padrão ${h.proxy.padrao})` : "não detectado");
    if (h.proxy) {
      row("Implementação", tagged(h.proxy.implementacao, labels));
      if (h.proxy.administrador) row("Admin do proxy", tagged(h.proxy.administrador, labels));
    }
    row("Saldo PROS do contrato", h.saldoPROSdoContrato);
  }

  if (h.carteira) {
    rows.push("", "  CARTEIRA CONSULTADA");
    row("Endereço", tagged(h.carteira.endereco, labels));
    row(`Saldo ${state.token?.symbol ?? "token"}`, h.carteira.saldoToken ?? "não disponível");
    row("Saldo PROS", h.carteira.saldoPROS);
  }

  rows.push("", "EM LINGUAGEM SIMPLES", "", wrap(plainSummary(state), 78, "  "));
  return rows.join("\n");
}

const tagged = (address, labels) => `${address}  [${labels[address.toLowerCase()]}]`;

function wrap(text, width, indent) {
  const out = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > width) {
      out.push(indent + line.trim());
      line = word;
    } else line += " " + word;
  }
  if (line.trim()) out.push(indent + line.trim());
  return out.join("\n");
}
