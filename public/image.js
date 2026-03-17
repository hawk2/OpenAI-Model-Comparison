import {
  IMAGE_MODELS,
  compareImagesInBrowser,
  compareOneImageInBrowser,
  getImageNotice,
  hasBrowserApiKey,
  initApiKeyPanel
} from "./shared.js";

const PROMPT_HISTORY_KEY = "image-comparison-prompt-history";
const MAX_PROMPT_HISTORY = 10;
const MAX_SESSION_HISTORY = 5;

const imageForm = document.querySelector("#image-form");
const promptInput = document.querySelector("#image-prompt");
const statusLabel = document.querySelector("#image-status");
const submitButton = document.querySelector("#image-submit");
const resultsContainer = document.querySelector("#image-results");
const resultTemplate = document.querySelector("#image-result-template");
const promptHistoryEl = document.querySelector("#prompt-history");
const historyPanel = document.querySelector("#history-panel");
const historyList = document.querySelector("#history-list");

let sessionHistory = [];

initApiKeyPanel();
renderImagePlaceholders("Enter a prompt to compare all three image models.");
renderPromptHistory();

imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();

  if (!prompt) {
    promptInput.focus();
    return;
  }

  const settings = getSettings();

  savePromptToHistory(prompt);
  renderPromptHistory();
  setPendingState(true, "Running image comparison...");
  renderImagePlaceholders("Generating image...");

  try {
    const payload = hasBrowserApiKey()
      ? await compareImagesInBrowser(prompt, settings)
      : await requestLocalCompare(prompt, settings);

    renderImageResults(payload.results, prompt, settings);
    addToSessionHistory(prompt, settings, payload.results);
    renderHistoryPanel();
    setPendingState(false, "Ready.");
  } catch (error) {
    renderImagePlaceholders(`Image comparison failed: ${error.message}`);
    setPendingState(false, "Last request failed.");
  }
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    imageForm.requestSubmit();
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

function getSettings() {
  const sizeKey = document.querySelector('input[name="image-size"]:checked')?.value ?? "square";
  const style = document.querySelector('input[name="dalle3-style"]:checked')?.value ?? "vivid";
  const quality = document.querySelector('input[name="gpt-quality"]:checked')?.value ?? "medium";
  return { sizeKey, style, quality };
}

// ── Prompt history ─────────────────────────────────────────────────────────

function loadPromptHistory() {
  try {
    return JSON.parse(localStorage.getItem(PROMPT_HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePromptToHistory(prompt) {
  const history = loadPromptHistory().filter((p) => p !== prompt);
  history.unshift(prompt);
  localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_PROMPT_HISTORY)));
}

function renderPromptHistory() {
  const history = loadPromptHistory();

  if (history.length === 0) {
    promptHistoryEl.hidden = true;
    return;
  }

  promptHistoryEl.hidden = false;
  promptHistoryEl.replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "prompt-history-label",
      textContent: "Recent:"
    }),
    ...history.map((prompt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "prompt-chip";
      btn.textContent = prompt;
      btn.title = prompt;
      btn.addEventListener("click", () => {
        promptInput.value = prompt;
        promptInput.focus();
      });
      return btn;
    })
  );
}

// ── Results rendering ──────────────────────────────────────────────────────

function renderImageResults(results, prompt, settings) {
  resultsContainer.replaceChildren(
    ...results.map((result) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      applyResultToCard(card, result, prompt, settings);
      return card;
    })
  );
}

function applyResultToCard(card, result, prompt, settings) {
  const image = card.querySelector(".result-image");
  const emptyText = card.querySelector(".result-empty");
  const notice = card.querySelector(".result-notice");
  const imageActions = card.querySelector(".image-actions");
  const copyBtn = card.querySelector(".copy-button");
  const downloadBtn = card.querySelector(".download-button");
  const regenBtn = card.querySelector(".regenerate-button");
  const metaEl = card.querySelector(".result-meta");

  card.classList.remove("is-error", "is-placeholder");
  card.classList.toggle("is-error", result.status === "error");
  card.querySelector(".result-title").textContent = result.model;
  metaEl.textContent = formatDuration(result.durationMs);
  applyNotice(notice, getImageNotice(result.model));

  if (result.status === "ok") {
    image.hidden = false;
    image.src = result.src;
    image.alt = `${result.model}: ${prompt}`;
    emptyText.textContent = result.size ?? "";
    imageActions.hidden = false;

    downloadBtn.onclick = () => {
      const link = document.createElement("a");
      link.href = result.src;
      link.download = `${result.model}-${Date.now()}.png`;
      link.click();
    };

    copyBtn.onclick = async () => {
      try {
        const blob = await fetch(result.src).then((r) => r.blob());
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        const orig = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = orig;
        }, 1500);
      } catch {
        copyBtn.textContent = "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1500);
      }
    };
  } else {
    image.hidden = true;
    imageActions.hidden = true;
    emptyText.textContent = result.status === "error" ? `Error: ${result.error}` : "";
  }

  regenBtn.hidden = false;
  regenBtn.disabled = false;
  regenBtn.onclick = () => {
    regenBtn.disabled = true;
    regenerateModel(result.model, prompt, settings, card);
  };
}

async function regenerateModel(modelId, prompt, settings, card) {
  const image = card.querySelector(".result-image");
  const emptyText = card.querySelector(".result-empty");
  const imageActions = card.querySelector(".image-actions");
  const regenBtn = card.querySelector(".regenerate-button");
  const metaEl = card.querySelector(".result-meta");

  card.classList.remove("is-error");
  image.hidden = true;
  imageActions.hidden = true;
  emptyText.textContent = "Regenerating…";
  metaEl.textContent = "Generating…";

  try {
    const result = hasBrowserApiKey()
      ? await compareOneImageInBrowser(modelId, prompt, settings)
      : await requestLocalModelCompare(modelId, prompt, settings);

    applyResultToCard(card, result, prompt, settings);
  } catch (error) {
    card.classList.add("is-error");
    emptyText.textContent = `Error: ${error.message}`;
    regenBtn.disabled = false;
  }
}

// ── Placeholders ───────────────────────────────────────────────────────────

function renderImagePlaceholders(message) {
  resultsContainer.replaceChildren(
    ...IMAGE_MODELS.map((model) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      const notice = card.querySelector(".result-notice");
      card.classList.add("is-placeholder");
      card.querySelector(".result-title").textContent = model.id;
      card.querySelector(".result-meta").textContent = "Waiting";
      applyNotice(notice, getImageNotice(model.id));
      card.querySelector(".result-empty").textContent = message;
      return card;
    })
  );
}

// ── Session history ────────────────────────────────────────────────────────

function addToSessionHistory(prompt, settings, results) {
  sessionHistory.unshift({ prompt, settings, results, timestamp: Date.now() });

  if (sessionHistory.length > MAX_SESSION_HISTORY) {
    sessionHistory = sessionHistory.slice(0, MAX_SESSION_HISTORY);
  }
}

function renderHistoryPanel() {
  if (sessionHistory.length === 0) {
    historyPanel.hidden = true;
    return;
  }

  historyPanel.hidden = false;
  historyList.replaceChildren(
    ...sessionHistory.map((entry) => {
      const el = document.createElement("div");
      el.className = "history-entry";

      const promptEl = document.createElement("p");
      promptEl.className = "history-prompt";
      promptEl.textContent = `"${entry.prompt}"`;
      promptEl.title = entry.prompt;
      el.appendChild(promptEl);

      const thumbs = document.createElement("div");
      thumbs.className = "history-thumbs";

      for (const result of entry.results) {
        const item = document.createElement("div");
        item.className = "history-thumb-item";

        const label = document.createElement("p");
        label.className = "history-thumb-label";
        label.textContent = result.model;
        item.appendChild(label);

        if (result.status === "ok") {
          const img = document.createElement("img");
          img.className = "history-thumb";
          img.src = result.src;
          img.alt = result.model;
          item.appendChild(img);
        } else {
          const empty = document.createElement("div");
          empty.className = "history-thumb-empty";
          const errText = document.createElement("p");
          errText.className = "history-thumb-error";
          errText.textContent = "Error";
          empty.appendChild(errText);
          item.appendChild(empty);
        }

        thumbs.appendChild(item);
      }

      el.appendChild(thumbs);
      return el;
    })
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function setPendingState(isPending, text) {
  promptInput.disabled = isPending;
  submitButton.disabled = isPending;
  statusLabel.textContent = text;

  if (!isPending) {
    promptInput.focus();
  }
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function applyNotice(node, text) {
  node.hidden = !text;
  node.textContent = text;
}

async function requestLocalCompare(prompt, settings) {
  const response = await fetch("/api/image/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...settings })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed.");
  }

  return payload;
}

async function requestLocalModelCompare(modelId, prompt, settings) {
  const response = await fetch("/api/image/compare-one", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId, prompt, ...settings })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed.");
  }

  return payload.result;
}
