// Minimal OpenAI-compatible chat client with tool calling. Works with any provider exposing /chat/completions.

const PRESETS = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyVar: "OPENAI_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keyVar: "GEMINI_API_KEY" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyVar: "GROQ_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", keyVar: "OPENROUTER_API_KEY" },
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.1", keyVar: null },
};

export function loadEnv(path = ".env") {
  try {
    process.loadEnvFile(path);
  } catch {
    // no .env file is fine
  }
}

export function llmConfig(env = process.env) {
  const provider =
    env.LLM_PROVIDER?.toLowerCase() ??
    Object.entries(PRESETS).find(([, p]) => p.keyVar && env[p.keyVar])?.[0] ??
    (env.LLM_BASE_URL ? "custom" : null);
  if (!provider) {
    throw new Error(
      "nenhum provedor de IA configurado. Crie um arquivo .env com, por exemplo, GEMINI_API_KEY=... (veja .env.example)"
    );
  }
  const preset = PRESETS[provider];
  if (!preset && provider !== "custom") {
    throw new Error(`LLM_PROVIDER desconhecido: ${provider}. Use ${Object.keys(PRESETS).join(", ")} ou defina LLM_BASE_URL.`);
  }
  const apiKey = env.LLM_API_KEY ?? (preset?.keyVar ? env[preset.keyVar] : undefined);
  if (preset?.keyVar && !apiKey) throw new Error(`defina ${preset.keyVar} (ou LLM_API_KEY) no arquivo .env`);
  return {
    provider,
    baseUrl: (env.LLM_BASE_URL ?? preset?.baseUrl).replace(/\/$/, ""),
    model: env.LLM_MODEL ?? preset?.model,
    apiKey,
  };
}

export async function chat(config, { messages, tools }, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(config.apiKey && { authorization: `Bearer ${config.apiKey}` }) },
        body: JSON.stringify({ model: config.model, messages, tools, tool_choice: tools?.length ? "auto" : undefined, temperature: 0.2 }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(`não foi possível falar com a IA em ${config.baseUrl} (${error.cause?.message ?? error.message})`);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    const body = await response.text();
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403 ? " — confira a chave de API no .env" : "";
      throw new Error(`a IA respondeu ${response.status}${hint}: ${body.slice(0, 300)}`);
    }
    const message = JSON.parse(body).choices?.[0]?.message;
    if (!message) throw new Error(`resposta inesperada da IA: ${body.slice(0, 300)}`);
    return message;
  }
}
