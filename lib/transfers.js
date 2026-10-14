import { decodeEventLog, decodeFunctionResult, encodeFunctionData, erc20Abi, toEventSelector } from "viem";
import { callJson } from "./mcp.js";

export const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
export const MAX_WINDOW = 1000; // get_logs rejects ranges larger than 1000 blocks

const ZERO = /^0x0{40}$/i;

export async function readTokenInfo(client, token) {
  const read = async (functionName) => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName });
    const { result } = await callJson(client, "eth_call", { transaction: { to: token, data } });
    return decodeFunctionResult({ abi: erc20Abi, functionName, data: result });
  };
  const [decimals, symbol] = await Promise.all([read("decimals"), read("symbol")]);
  return { decimals, symbol };
}

export async function latestBlock(client) {
  return Number((await callJson(client, "get_block_number")).blockNumber);
}

export const transferKey = (t) => `${t.tx}:${t.logIndex}`;

/** Decoded ERC20 Transfer events of `token` in [fromBlock, toBlock], oldest first. */
export async function fetchTransfers(client, token, fromBlock, toBlock) {
  const transfers = [];
  let skipped = 0;
  for (let start = fromBlock; start <= toBlock; start += MAX_WINDOW) {
    const end = Math.min(start + MAX_WINDOW - 1, toBlock);
    const logs = await callJson(client, "get_logs", { address: token, topics: [TRANSFER_TOPIC], fromBlock: start, toBlock: end });
    for (const log of logs) {
      let args;
      try {
        ({ args } = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics }));
      } catch {
        skipped++; // same topic, different layout (e.g. an NFT Transfer)
        continue;
      }
      transfers.push({
        block: Number(log.blockNumber),
        logIndex: Number(log.logIndex),
        tx: log.transactionHash,
        from: args.from,
        to: args.to,
        value: args.value,
        kind: ZERO.test(args.from) ? "mint" : ZERO.test(args.to) ? "burn" : "transfer",
      });
    }
  }
  transfers.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return { transfers, skipped };
}
