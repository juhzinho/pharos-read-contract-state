import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import { detectLanguage, parseQuestion } from "../lib/intent.js";
import { TOKENS } from "../lib/tokens.js";

const USDC = getAddress(TOKENS.USDC);
const WPROS = getAddress(TOKENS.WPROS);
const WALLET = "0x9F8Ea09770Dc38fc61f5a62031b3BE0526D54D92";
const OTHER = "0x46f958BdEFfD33495E058873cDd114c79Ec13F1b";

const cases = [
  // [question, memory, expected subset]
  ["O que é o contrato do USDC?", {}, { language: "pt", intents: ["overview"], contract: USDC }],
  ["What is the USDC contract?", {}, { language: "en", intents: ["overview"], contract: USDC }],
  ["Quem é o dono do USDC?", {}, { language: "pt", intents: ["owner"], contract: USDC }],
  ["Who owns the USDC contract?", {}, { language: "en", intents: ["owner"], contract: USDC }],
  ["Who controls WPROS?", {}, { intents: ["owner"], contract: WPROS }],
  ["Qual o total de WPROS em circulação?", {}, { intents: ["supply"], contract: WPROS }],
  ["What is the total supply of USDC?", {}, { language: "en", intents: ["supply"], contract: USDC }],
  ["How much USDC is there?", {}, { language: "en", contract: USDC, holder: null, includes: "supply" }],
  ["O USDC está pausado?", {}, { intents: ["paused"], contract: USDC }],
  ["Is USDC paused?", {}, { language: "en", intents: ["paused"], contract: USDC }],
  ["Is the USDC contract upgradeable?", {}, { language: "en", intents: ["proxy"], contract: USDC }],
  ["Quantas casas decimais tem o WPROS?", {}, { intents: ["decimals"], contract: WPROS }],
  [`Saldo de USDC da carteira ${WALLET}`, {}, { intents: ["balance"], contract: USDC, holder: WALLET }],
  [`What is the USDC balance of wallet ${WALLET}?`, {}, { language: "en", intents: ["balance"], contract: USDC, holder: WALLET }],
  [`Explain the contract ${OTHER}`, {}, { language: "en", intents: ["overview"], contract: OTHER, holder: null }],
  [`${OTHER}`, {}, { intents: ["overview"], contract: OTHER }],
  [`Balance of wallet ${WALLET} in contract ${OTHER}`, {}, { contract: OTHER, holder: WALLET }],
  [`E o saldo da carteira ${WALLET}?`, { contract: USDC }, { intents: ["balance"], contract: USDC, holder: WALLET, contractSource: "memory" }],
  ["And who owns it?", { contract: USDC, language: "pt" }, { language: "en", intents: ["owner"], contract: USDC, contractSource: "memory" }],
  ["e quem é o dono?", { contract: WPROS }, { intents: ["owner"], contract: WPROS }],
  ["What about USDT?", {}, { unknownToken: "USDT", contract: null }],
  ["Ajuda", {}, { intents: ["help"], contract: null }],
  ["help", {}, { intents: ["help"], language: "en" }],
  ["bom dia", {}, { intents: ["unknown"], contract: null }],
  ["Explain 0x1234", {}, { invalidAddress: "0x1234", contract: null }],
  ["What is the current block?", {}, { intents: ["network"], contract: null }],
  ["What is the current block?", { contract: USDC }, { intents: ["network"], contract: null }],
  ["bom dia", { contract: USDC }, { intents: ["unknown"], contract: null }],
  ["ajuda", { contract: USDC }, { intents: ["help"], contract: null }],
  ["Is it upgradeable?", { contract: USDC }, { intents: ["proxy"], contract: USDC }],
  [`and wallet ${WALLET}?`, { contract: WPROS }, { intents: ["balance"], contract: WPROS, holder: WALLET }],
  ["Tell me everything about USDC", {}, { language: "en", intents: ["overview"], contract: USDC }],
  ["qual o nome e o símbolo do token 0x52c48d4213107b20bc583832b0d951fb9ca8f0b0", {}, { intents: ["identity"], contract: WPROS }],
];

for (const [question, memory, expected] of cases) {
  test(`entende: ${question}`, () => {
    const plan = parseQuestion(question, memory);
    const { includes, ...fields } = expected;
    for (const [key, value] of Object.entries(fields)) assert.deepEqual(plan[key], value, `${key} em "${question}"`);
    if (includes) assert.ok(plan.intents.includes(includes), `intents ${plan.intents} deveria incluir ${includes}`);
  });
}

test("idioma: empate mantém o idioma da conversa", () => {
  assert.equal(detectLanguage("USDC?", "en"), "en");
  assert.equal(detectLanguage("USDC?", "pt"), "pt");
});

test("entrada vazia ou estranha não quebra", () => {
  for (const input of ["", "   ", null, undefined, "0x", "!!!", "x".repeat(5000)]) {
    assert.doesNotThrow(() => parseQuestion(input));
  }
});
