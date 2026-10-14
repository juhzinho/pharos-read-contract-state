import test from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, parseResults, resolveDocsUrl } from "../lib/docs.js";

const REPLY = `Deploy with Foundry. See [Write Your First Token](/developer-guide/foundry/write-your-first-token).

# Sources

- [Uniswap](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract)
- [Write Your First Token](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token)
- [Uniswap](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract)
- [A](https://docs.pharos.xyz/a)
- [B](https://docs.pharos.xyz/b)
- [C](https://docs.pharos.xyz/c)
- [D](https://docs.pharos.xyz/d)`;

test("answer: relative links become absolute, cited source comes first, no duplicates, max 5", () => {
  const { answer, sources, found } = parseAnswer(REPLY);
  assert.equal(found, true);
  assert.match(answer, /\]\(https:\/\/docs\.pharos\.xyz\/developer-guide\/foundry\/write-your-first-token\)/);
  assert.doesNotMatch(answer, /Sources/);
  assert.equal(sources.length, 5);
  assert.equal(sources[0].title, "Write Your First Token");
  assert.equal(new Set(sources.map((s) => s.url)).size, 5);
});

test("answer: 'cannot find' without sources is not an answer", () => {
  assert.equal(parseAnswer("I cannot find information about Brazilian feijoada in the docs.").found, false);
  assert.equal(parseAnswer("").found, false);
});

test("answer: partial answer with sources still counts", () => {
  const reply = `I cannot find information about Moon Network v9 in the docs. The staking guide covers Atlantic Testnet and Pacific Mainnet, see Node Management for the add-validator flow and thresholds.\n\n# Sources\n\n- [Node Management](https://docs.pharos.xyz/node)`;
  assert.equal(parseAnswer(reply).found, true);
});

test("search results: parsed into title, link and content", () => {
  const text = "Title: A\nLink: https://docs.pharos.xyz/a\nContent: alpha\n\nTitle: B\nLink: https://docs.pharos.xyz/b\nContent: beta";
  assert.deepEqual(parseResults(text).map((r) => r.title), ["A", "B"]);
});

test("page urls: paths and docs urls accepted, other sites rejected", () => {
  assert.equal(resolveDocsUrl("/getting-started/token-registry").url, "https://docs.pharos.xyz/getting-started/token-registry");
  assert.equal(resolveDocsUrl("https://google.com").error, "foreign");
});
