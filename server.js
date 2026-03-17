import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, ".env");

await loadEnvFile(ENV_PATH);

const API_KEY = requireEnv("OPENAI_API_KEY");
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PAGE_ROUTES = new Map([
  ["/", "/index.html"],
  ["/text", "/text.html"],
  ["/image", "/image.html"]
]);
const TEXT_PROMPT_INSTRUCTION = "You are a concise, helpful assistant. Answer in 120 words or fewer.";
const TEXT_MODELS = [
  {
    id: "babbage-002",
    kind: "completion",
    supportsTemperature: true,
    maxTemperature: 1
  },
  {
    id: "davinci-002",
    kind: "completion",
    supportsTemperature: true
  },
  {
    id: "gpt-3.5-turbo",
    kind: "chat",
    supportsTemperature: true
  },
  {
    id: "gpt-4",
    kind: "chat",
    supportsTemperature: true
  },
  {
    id: "gpt-4o",
    kind: "chat",
    supportsTemperature: true
  },
  {
    id: "gpt-4.1",
    kind: "chat",
    supportsTemperature: true
  },
  {
    id: "o3",
    kind: "chat",
    supportsTemperature: false,
    usesMaxCompletionTokens: true
  },
  {
    id: "gpt-5",
    kind: "chat",
    supportsTemperature: true,
    usesMaxCompletionTokens: true
  },
  {
    id: "gpt-5.1",
    kind: "chat",
    supportsTemperature: true,
    usesMaxCompletionTokens: true
  }
];
const IMAGE_MODELS = [
  {
    id: "dall-e-2",
    sizes: { square: "1024x1024", landscape: "1024x1024", portrait: "1024x1024" }
  },
  {
    id: "dall-e-3",
    sizes: { square: "1024x1024", landscape: "1792x1024", portrait: "1024x1792" },
    styles: ["vivid", "natural"]
  },
  {
    id: "gpt-image-1",
    sizes: { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" },
    qualities: ["low", "medium", "high"],
    noResponseFormat: true
  },
  {
    id: "gpt-image-1.5",
    sizes: { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" },
    qualities: ["low", "medium", "high"],
    noResponseFormat: true
  }
];
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing request URL." });
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/api/text/compare") {
      await handleTextCompare(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/image/compare") {
      await handleImageCompare(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/image/compare-one") {
      await handleImageCompareOne(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error." });
  }
}).listen(PORT, () => {
  console.log(`Model comparison app running at http://localhost:${PORT}`);
});

async function handleTextCompare(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const temperature = normalizeTemperature(body?.temperature);

  if (!prompt) {
    sendJson(res, 400, { error: "Send a non-empty text prompt." });
    return;
  }

  if (prompt.length > 4000) {
    sendJson(res, 400, { error: "Text prompts must be 4000 characters or fewer." });
    return;
  }

  if (temperature === null) {
    sendJson(res, 400, { error: "Temperature must be a number between 0 and 2." });
    return;
  }

  const requestedIds = Array.isArray(body?.modelIds) ? body.modelIds.filter((id) => typeof id === "string") : [];
  const models =
    requestedIds.length >= 2 ? TEXT_MODELS.filter((m) => requestedIds.includes(m.id)) : TEXT_MODELS;

  if (models.length < 2) {
    sendJson(res, 400, { error: "Select at least 2 valid model IDs." });
    return;
  }

  const results = await Promise.all(models.map((model) => compareTextModel(model, prompt, temperature)));

  sendJson(res, 200, { prompt, temperature, results });
}

async function handleImageCompare(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    sendJson(res, 400, { error: "Send a non-empty image prompt." });
    return;
  }

  if (prompt.length > 1000) {
    sendJson(res, 400, { error: "Image prompts must be 1000 characters or fewer." });
    return;
  }

  const settings = extractImageSettings(body);
  const requestedIds = Array.isArray(body?.modelIds) ? body.modelIds.filter((id) => typeof id === "string") : [];
  const models =
    requestedIds.length >= 2 ? IMAGE_MODELS.filter((m) => requestedIds.includes(m.id)) : IMAGE_MODELS;

  if (models.length < 2) {
    sendJson(res, 400, { error: "Select at least 2 valid model IDs." });
    return;
  }

  const results = await Promise.all(models.map((model) => compareImageModel(model, prompt, settings)));

  sendJson(res, 200, { prompt, results });
}

async function handleImageCompareOne(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const modelId = typeof body?.modelId === "string" ? body.modelId.trim() : "";
  const model = IMAGE_MODELS.find((m) => m.id === modelId);

  if (!prompt) {
    sendJson(res, 400, { error: "Send a non-empty image prompt." });
    return;
  }

  if (!model) {
    sendJson(res, 400, { error: "Unknown model ID." });
    return;
  }

  const settings = extractImageSettings(body);
  const result = await compareImageModel(model, prompt, settings);

  sendJson(res, 200, { result });
}

function extractImageSettings(body) {
  const validSizeKeys = ["square", "landscape", "portrait"];
  const sizeKey = validSizeKeys.includes(body?.sizeKey) ? body.sizeKey : "square";
  const validStyles = ["vivid", "natural"];
  const style = validStyles.includes(body?.style) ? body.style : "vivid";
  const validQualities = ["low", "medium", "high"];
  const quality = validQualities.includes(body?.quality) ? body.quality : "medium";
  return { sizeKey, style, quality };
}

async function compareTextModel(model, prompt, temperature) {
  const startedAt = Date.now();
  const effectiveTemperature = getEffectiveTemperature(model, temperature);

  if (model.kind === "completion") {
    const requestBody = {
      model: model.id,
      prompt: buildLegacyPrompt(prompt),
      max_tokens: 300,
      stop: ["\nUser:", "\nSystem:"]
    };

    if (model.supportsTemperature) {
      requestBody.temperature = effectiveTemperature;
    }

    const result = await requestOpenAiJson("https://api.openai.com/v1/completions", requestBody);

    if (!result.ok) {
      return buildErrorResult(model.id, Date.now() - startedAt, result.error, {
        temperatureUsed: effectiveTemperature
      });
    }

    const output = normalizeText(result.payload?.choices?.[0]?.text);

    if (!output) {
      return buildErrorResult(model.id, Date.now() - startedAt, "No text returned by the API.", {
        temperatureUsed: effectiveTemperature
      });
    }

    return {
      model: model.id,
      status: "ok",
      durationMs: Date.now() - startedAt,
      temperatureUsed: effectiveTemperature,
      output
    };
  }

  const requestBody = {
    model: model.id,
    messages: buildChatMessages(prompt)
  };

  if (model.supportsTemperature) {
    requestBody.temperature = effectiveTemperature;
  }

  if (model.usesMaxCompletionTokens) {
    requestBody.max_completion_tokens = 300;
  } else {
    requestBody.max_tokens = 300;
  }

  const result = await requestOpenAiJson("https://api.openai.com/v1/chat/completions", requestBody);

  if (!result.ok) {
    return buildErrorResult(model.id, Date.now() - startedAt, result.error, {
      temperatureUsed: effectiveTemperature
    });
  }

  const output = normalizeChatMessage(result.payload?.choices?.[0]?.message?.content);

  if (!output) {
    return buildErrorResult(model.id, Date.now() - startedAt, "No text returned by the API.", {
      temperatureUsed: effectiveTemperature
    });
  }

  return {
    model: model.id,
    status: "ok",
    durationMs: Date.now() - startedAt,
    temperatureUsed: effectiveTemperature,
    output
  };
}

async function compareImageModel(model, prompt, settings = {}) {
  const startedAt = Date.now();
  const { sizeKey = "square", style = "vivid", quality = "medium" } = settings;
  const size = model.sizes?.[sizeKey] ?? "1024x1024";

  const requestBody = {
    model: model.id,
    prompt,
    n: 1,
    size
  };

  if (!model.noResponseFormat) {
    requestBody.response_format = "b64_json";
  }

  if (model.id === "dall-e-3" && model.styles?.includes(style)) {
    requestBody.style = style;
  }

  if (model.qualities?.includes(quality)) {
    requestBody.quality = quality;
  }

  const result = await requestOpenAiJsonWithRetry(
    "https://api.openai.com/v1/images/generations",
    requestBody,
    3
  );

  if (!result.ok) {
    return buildErrorResult(model.id, Date.now() - startedAt, result.error);
  }

  const item = result.payload?.data?.[0];
  const src = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url ?? "";

  if (!src) {
    return buildErrorResult(model.id, Date.now() - startedAt, "No image returned by the API.");
  }

  return {
    model: model.id,
    status: "ok",
    durationMs: Date.now() - startedAt,
    size,
    src
  };
}

async function serveStatic(requestPath, res) {
  const mappedPath = PAGE_ROUTES.get(requestPath) ?? requestPath;
  const filePath = path.resolve(PUBLIC_DIR, `.${path.normalize(mappedPath)}`);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext];

    if (!contentType) {
      sendJson(res, 415, { error: `Unsupported file type: ${ext || "unknown"}` });
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function buildChatMessages(prompt) {
  return [
    {
      role: "system",
      content: TEXT_PROMPT_INSTRUCTION
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

function buildLegacyPrompt(prompt) {
  return `${TEXT_PROMPT_INSTRUCTION}\n\nUser: ${formatLegacyContent(prompt)}\nAssistant:`;
}

function formatLegacyContent(content) {
  return content
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTemperature(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function getEffectiveTemperature(model, requestedTemperature) {
  if (!model.supportsTemperature) {
    return null;
  }

  if (typeof model.maxTemperature === "number") {
    return Math.min(requestedTemperature, model.maxTemperature);
  }

  return requestedTemperature;
}

function normalizeChatMessage(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (item && item.type === "text" && typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .join("\n")
    .trim();
}

function buildErrorResult(model, durationMs, error, extra = {}) {
  return {
    model,
    status: "error",
    durationMs,
    error,
    ...extra
  };
}

async function requestOpenAiJson(url, body) {
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `Failed to reach the OpenAI API: ${error.message}`,
      retryable: true
    };
  }

  let payload;
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id");

  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      error: "OpenAI API returned a non-JSON response.",
      requestId,
      retryable: true
    };
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `OpenAI request failed with status ${response.status}.`;

    return {
      ok: false,
      status: response.status,
      error: requestId ? `${errorMessage} Request ID: ${requestId}` : errorMessage,
      requestId,
      retryable: response.status >= 500 || response.status === 429
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
    requestId
  };
}

async function requestOpenAiJsonWithRetry(url, body, maxAttempts) {
  let attempt = 0;
  let lastResult;

  while (attempt < maxAttempts) {
    lastResult = await requestOpenAiJson(url, body);

    if (lastResult.ok || !lastResult.retryable || attempt === maxAttempts - 1) {
      return lastResult;
    }

    const backoffMs = 800 * (attempt + 1);
    await sleep(backoffMs);
    attempt += 1;
  }

  return lastResult;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

async function loadEnvFile(envPath) {
  try {
    const contents = await readFile(envPath, "utf8");

    for (const rawLine of contents.split(/\r?\n/u)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");

      if (equalsIndex === -1) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim();

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
