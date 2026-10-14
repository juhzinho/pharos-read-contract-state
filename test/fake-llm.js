import http from "node:http";

// Stand-in for an OpenAI-compatible API: asks for read_contract_state once, then answers from the tool result.
export function startFakeLlm() {
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { messages, tools } = JSON.parse(body);
    const names = (tools ?? []).map((t) => t.function.name);
    const last = messages.at(-1);

    let message;
    if (!names.includes("read_contract_state") || names.includes("send_raw_transaction")) {
      message = { role: "assistant", content: `FERRAMENTAS INVÁLIDAS: ${names.join(",")}` };
    } else if (last.role === "user") {
      message = {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "read_contract_state", arguments: JSON.stringify({ address: "USDC" }) } }],
      };
    } else {
      const data = JSON.parse(last.content);
      message = {
        role: "assistant",
        content: data.erro
          ? `ERRO DA FERRAMENTA: ${data.erro}`
          : `Contrato ${data.contrato.endereco}, lido no bloco ${data.bloco}. ${data.resumoEmLinguagemSimples}`,
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
