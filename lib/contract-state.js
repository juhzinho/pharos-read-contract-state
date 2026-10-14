import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  hexToString,
  isAddress,
  parseAbi,
  sliceHex,
} from "viem";
import { callJson, isTransient } from "./mcp.js";

const extraAbi = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
]);
const bytes32Abi = parseAbi(["function name() view returns (bytes32)", "function symbol() view returns (bytes32)"]);

// Proxy storage slots: EIP-1967 and the older ZeppelinOS layout (used by Circle's FiatTokenProxy).
const PROXY_SLOTS = {
  "EIP-1967": {
    implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  },
  ZeppelinOS: {
    implementation: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
    admin: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
  },
};

const ZERO_WORD = /^0x0*$/;

function slotToAddress(value) {
  if (!value || ZERO_WORD.test(value)) return null;
  return getAddress(sliceHex(value, 12));
}

function settledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

/**
 * Reads the live state of a contract through Chain MCP, every value pinned to the same block.
 * Each Chain MCP request costs ~2s, so all reads go out in a single parallel round.
 */
export async function readContractState(client, address, { holder, block } = {}) {
  if (!isAddress(address)) throw new Error(`endereço de contrato inválido: ${address}`);
  if (holder && !isAddress(holder)) throw new Error(`endereço de carteira inválido: ${holder}`);

  const chain = await callJson(client, "get_chain_info");
  const blockNumber = block ?? Number(chain.latestBlock);

  async function call(abi, functionName, args = []) {
    const data = encodeFunctionData({ abi, functionName, args });
    const { result } = await callJson(client, "eth_call", { transaction: { to: address, data }, block: blockNumber });
    if (!result || result === "0x") throw new Error(`${functionName}() não existe neste contrato`);
    return { raw: result, value: decodeFunctionResult({ abi, functionName, data: result }) };
  }

  async function text(functionName) {
    const { raw } = await call(erc20Abi, functionName);
    try {
      return decodeFunctionResult({ abi: erc20Abi, functionName, data: raw });
    } catch {
      return hexToString(decodeFunctionResult({ abi: bytes32Abi, functionName, data: raw }), { size: 32 }).replace(/\0+$/, "");
    }
  }

  const value = async (abi, fn, args) => (await call(abi, fn, args)).value;
  const storage = (position) => callJson(client, "get_storage_at", { address, position, block: blockNumber });

  const tasks = {
    code: callJson(client, "get_code", { address, block: blockNumber }),
    native: callJson(client, "get_balance", { address, block: blockNumber }),
    name: text("name"),
    symbol: text("symbol"),
    decimals: value(erc20Abi, "decimals"),
    totalSupply: value(erc20Abi, "totalSupply"),
    owner: value(extraAbi, "owner"),
    paused: value(extraAbi, "paused"),
    ...Object.fromEntries(
      Object.entries(PROXY_SLOTS).flatMap(([standard, slots]) => [
        [`${standard}:implementation`, storage(slots.implementation)],
        [`${standard}:admin`, storage(slots.admin)],
      ])
    ),
    ...(holder && {
      holderToken: value(erc20Abi, "balanceOf", [holder]),
      holderNative: callJson(client, "get_balance", { address: holder, block: blockNumber }),
    }),
  };

  const keys = Object.keys(tasks);
  const results = await Promise.allSettled(Object.values(tasks));

  // A missing function is a valid answer; a network failure is not — never report it as "not available".
  const networkFailure = results.find((s) => s.status === "rejected" && isTransient(s.reason));
  if (networkFailure) throw networkFailure.reason;
  const required = ["code", "native", "holderNative"].find((k) => keys.includes(k) && results[keys.indexOf(k)].status === "rejected");
  if (required) throw results[keys.indexOf(required)].reason;

  const r = Object.fromEntries(keys.map((k, i) => [k, settledValue(results[i])]));
  const bytecode = r.code?.code ?? "0x";

  let proxy = null;
  for (const standard of Object.keys(PROXY_SLOTS)) {
    const implementation = slotToAddress(r[`${standard}:implementation`]?.value);
    if (implementation) {
      proxy = { standard, implementation, admin: slotToAddress(r[`${standard}:admin`]?.value) };
      break;
    }
  }

  const isToken = r.totalSupply !== null && r.decimals !== null;
  return {
    chainId: chain.chainId,
    block: blockNumber,
    address: getAddress(address),
    isContract: bytecode !== "0x",
    bytecodeBytes: bytecode === "0x" ? 0 : (bytecode.length - 2) / 2,
    nativeBalanceWei: r.native?.balanceWei ?? null,
    token: isToken
      ? { name: r.name, symbol: r.symbol, decimals: Number(r.decimals), totalSupply: r.totalSupply.toString() }
      : null,
    owner: r.owner,
    paused: r.paused,
    proxy,
    holder: holder
      ? {
          address: getAddress(holder),
          tokenBalance: r.holderToken?.toString() ?? null,
          nativeBalanceWei: r.holderNative?.balanceWei ?? null,
        }
      : null,
  };
}
