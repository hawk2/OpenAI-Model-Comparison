const API_KEY_STORAGE_KEY = "openai-model-comparison-api-key";

export const TEXT_MODELS = [
  {
    id: "babbage-002",
    kind: "completion",
    supportsTemperature: true,
    maxTemperature: 1,
    advisory: "Temperature is capped at 1.00 for stability.",
    shutdownDate: "2026-09-28"
  },
  {
    id: "gpt-3.5-turbo",
    kind: "chat",
    supportsTemperature: true
  },
  {
    id: "gpt-5.4",
    kind: "chat",
    supportsTemperature: true
  }
];

export const IMAGE_MODELS = [
  {
    id: "dall-e-2",
    size: "1024x1024",
    shutdownDate: "2026-05-12"
  },
  {
    id: "dall-e-3",
    size: "1024x1024",
    shutdownDate: "2026-05-12"
  },
  {
    id: "gpt-image-1.5",
    size: "1024x1024"
  }
];

const TEXT_PROMPT_INSTRUCTION = "You are a concise, helpful assistant. Answer in 120 words or fewer.";

export function initApiKeyPanel() {
  const form = document.querySelector("#api-key-form");
  const input = document.querySelector("#api-key-input");
  const status = document.querySelector("#api-key-status");
  const clearButton = document.querySelector("#api-key-clear");

  if (!form || !input || !status || !clearButton) {
    return;
  }

  input.value = readApiKey();
  renderApiKeyStatus(status);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    writeApiKey(input.value.trim());
    renderApiKeyStatus(status);
  });

  clearButton.addEventListener("click", () => {
    writeApiKey("");
    input.value = "";
    renderApiKeyStatus(status);
    input.focus();
  });
}

export function hasBrowserApiKey() {
  return readApiKey() !== "";
}

export function getTextNotice(modelId) {
  return buildModelNotice(TEXT_MODELS.find((model) => model.id === modelId));
}

export function getImageNotice(modelId) {
  return buildModelNotice(IMAGE_MODELS.find((model) => model.id === modelId));
}

export async function compareTextInBrowser(prompt, temperature) {
  const results = await Promise.all(TEXT_MODELS.map((model) => compareTextModel(model, prompt, temperature)));
  return { prompt, temperature, results };
}

export async function compareImagesInBrowser(prompt) {
  const results = await Promise.all(IMAGE_MODELS.map((model) => compareImageModel(model, prompt)));
  return { prompt, results };
}

function readApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

function writeApiKey(value) {
  if (value) {
    localStorage.setItem(API_KEY_STORAGE_KEY, value);
    return;
  }

  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

function renderApiKeyStatus(statusNode) {
  statusNode.textContent = hasBrowserApiKey()
    ? "Browser mode enabled. Requests use the pasted key from this browser only."
    : "No pasted key saved. This app will use the local server when available.";
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

    const result = await openAiJson("https://api.openai.com/v1/completions", requestBody);

    if (!result.ok) {
      return buildErrorResult(model.id, Date.now() - startedAt, result.error, {
        temperatureUsed: effectiveTemperature
      });
    }

    const output = typeof result.payload?.choices?.[0]?.text === "string" ? result.payload.choices[0].text.trim() : "";

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
    messages: [
      { role: "system", content: TEXT_PROMPT_INSTRUCTION },
      { role: "user", content: prompt }
    ]
  };

  if (model.supportsTemperature) {
    requestBody.temperature = effectiveTemperature;
  }

  if (model.id === "gpt-5.4") {
    requestBody.max_completion_tokens = 300;
  } else {
    requestBody.max_tokens = 300;
  }

  const result = await openAiJson("https://api.openai.com/v1/chat/completions", requestBody);

  if (!result.ok) {
    return buildErrorResult(model.id, Date.now() - startedAt, result.error, {
      temperatureUsed: effectiveTemperature
    });
  }

  const output = normalizeChatContent(result.payload?.choices?.[0]?.message?.content);

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

async function compareImageModel(model, prompt) {
  const startedAt = Date.now();
  const requestBody = {
    model: model.id,
    prompt,
    n: 1,
    size: model.size
  };

  if (model.id !== "gpt-image-1.5") {
    requestBody.response_format = "b64_json";
  }

  const result = await openAiJsonWithRetry("https://api.openai.com/v1/images/generations", requestBody, 3);

  if (!result.ok) {
    return buildErrorResult(model.id, Date.now() - startedAt, result.error);
  }

  const imageBase64 = result.payload?.data?.[0]?.b64_json;

  if (!imageBase64) {
    return buildErrorResult(model.id, Date.now() - startedAt, "No image returned by the API.");
  }

  return {
    model: model.id,
    status: "ok",
    durationMs: Date.now() - startedAt,
    size: model.size,
    src: `data:image/png;base64,${imageBase64}`
  };
}

async function openAiJson(url, body) {
  const apiKey = readApiKey();

  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      error: "No browser API key saved."
    };
  }

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

  const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  let payload;

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

async function openAiJsonWithRetry(url, body, maxAttempts) {
  let attempt = 0;
  let lastResult;

  while (attempt < maxAttempts) {
    lastResult = await openAiJson(url, body);

    if (lastResult.ok || !lastResult.retryable || attempt === maxAttempts - 1) {
      return lastResult;
    }

    await sleep(800 * (attempt + 1));
    attempt += 1;
  }

  return lastResult;
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

function normalizeChatContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => (item && item.type === "text" && typeof item.text === "string" ? item.text : ""))
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

function buildModelNotice(model) {
  if (!model) {
    return "";
  }

  const notices = [];
  const shutdownNotice = getShutdownNotice(model);

  if (model.advisory) {
    notices.push(model.advisory);
  }

  if (shutdownNotice) {
    notices.push(shutdownNotice);
  }

  return notices.join(" ");
}

function getShutdownNotice(model) {
  if (!model?.shutdownDate) {
    return "";
  }

  const now = new Date();
  const shutdownDate = new Date(`${model.shutdownDate}T00:00:00`);

  if (Number.isNaN(shutdownDate.getTime())) {
    return "";
  }

  if (now >= shutdownDate) {
    return `Scheduled shutdown date passed on ${formatDate(shutdownDate)}.`;
  }

  const months = monthDiff(now, shutdownDate);
  const anchor = addMonths(now, months);
  const days = Math.max(0, Math.floor((stripTime(shutdownDate) - stripTime(anchor)) / 86400000));
  const parts = [];

  if (months > 0) {
    parts.push(`${months} month${months === 1 ? "" : "s"}`);
  }

  parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return `Scheduled shutdown in ${parts.join(", ")} on ${formatDate(shutdownDate)}.`;
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

function monthDiff(startDate, endDate) {
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  const anchored = addMonths(startDate, months);

  if (anchored > endDate) {
    months -= 1;
  }

  return Math.max(0, months);
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(day, daysInMonth(result.getFullYear(), result.getMonth())));
  return stripTime(result);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
