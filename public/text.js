import {
  TEXT_MODELS,
  DEFAULT_TEXT_MODEL_IDS,
  compareTextInBrowser,
  getTextNotice,
  hasBrowserApiKey,
  initApiKeyPanel,
  estimateInputTokens
} from "./shared.js";

const TEXT_MODEL_SELECTION_KEY = "text-model-selection";

const textForm = document.querySelector("#text-form");
const promptInput = document.querySelector("#text-prompt");
const temperatureInput = document.querySelector("#temperature");
const temperatureValue = document.querySelector("#temperature-value");
const statusLabel = document.querySelector("#text-status");
const submitButton = document.querySelector("#text-submit");
const resultsContainer = document.querySelector("#text-results");
const resultTemplate = document.querySelector("#text-result-template");
const modelPickerEl = document.querySelector("#text-model-picker");
const tokenEstimateEl = document.querySelector("#text-token-estimate");

initApiKeyPanel();
renderModelPicker();
syncTemperatureLabel();
renderTextPlaceholders("Select models and enter a prompt to compare.");
updateTokenEstimate();

textForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const temperature = Number(temperatureInput.value);
  const selectedIds = getSelectedModelIds();

  if (!prompt) {
    promptInput.focus();
    return;
  }

  if (selectedIds.length < 2) {
    statusLabel.textContent = "Select at least 2 models first.";
    return;
  }

  setPendingState(true, "Running text comparison...");
  renderTextPlaceholders("Running comparison...", selectedIds);

  try {
    const payload = hasBrowserApiKey()
      ? await compareTextInBrowser(prompt, temperature, selectedIds)
      : await requestLocalCompare(prompt, temperature, selectedIds);

    renderTextResults(payload.results);
    setGridColumns(resultsContainer, payload.results.length);
    setPendingState(false, "Ready.");
  } catch (error) {
    renderTextPlaceholders(`Text comparison failed: ${error.message}`, selectedIds);
    setPendingState(false, "Last request failed.");
  }
});

temperatureInput.addEventListener("input", () => {
  syncTemperatureLabel();
});

promptInput.addEventListener("input", () => {
  updateTokenEstimate();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    textForm.requestSubmit();
  }
});

// ── Model picker ───────────────────────────────────────────────────────────

function loadSavedSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEXT_MODEL_SELECTION_KEY));
    if (Array.isArray(saved) && saved.length >= 2) return saved;
  } catch {
    // ignore
  }
  return DEFAULT_TEXT_MODEL_IDS;
}

function saveSelection(ids) {
  localStorage.setItem(TEXT_MODEL_SELECTION_KEY, JSON.stringify(ids));
}

function getSelectedModelIds() {
  return [...modelPickerEl.querySelectorAll("input[type='checkbox']:checked")].map((el) => el.value);
}

function renderModelPicker() {
  const savedIds = loadSavedSelection();

  modelPickerEl.replaceChildren(
    ...TEXT_MODELS.map((model) => {
      const optionId = `text-picker-${model.id}`;

      const wrapper = document.createElement("span");
      wrapper.className = "model-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = optionId;
      checkbox.value = model.id;
      checkbox.checked = savedIds.includes(model.id);
      checkbox.addEventListener("change", () => {
        saveSelection(getSelectedModelIds());
        updateTokenEstimate();
        validateSelection();
      });

      const label = document.createElement("label");
      label.htmlFor = optionId;
      label.textContent = model.id;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      return wrapper;
    })
  );
}

function validateSelection() {
  const count = getSelectedModelIds().length;
  if (count < 2) {
    statusLabel.textContent = "Select at least 2 models.";
  } else {
    statusLabel.textContent = "Ready.";
  }
}

// ── Token estimate ─────────────────────────────────────────────────────────

function updateTokenEstimate() {
  const selectedIds = getSelectedModelIds();
  const promptText = promptInput.value;

  if (selectedIds.length < 2) {
    tokenEstimateEl.textContent = "Select at least 2 models.";
    tokenEstimateEl.classList.add("token-estimate--warn");
    return;
  }

  tokenEstimateEl.classList.remove("token-estimate--warn");
  const userTokens = Math.max(1, Math.ceil(promptText.length / 4));
  const totalTokens = estimateInputTokens(selectedIds, promptText);
  const perModel = userTokens + 16;

  tokenEstimateEl.textContent =
    `~${totalTokens} total input tokens across ${selectedIds.length} models` +
    ` (${perModel} tokens × ${selectedIds.length})`;
}

// ── Results rendering ──────────────────────────────────────────────────────

function renderTextResults(results) {
  resultsContainer.replaceChildren(
    ...results.map((result) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      const body = card.querySelector(".result-body");
      const notice = card.querySelector(".result-notice");

      card.classList.toggle("is-error", result.status === "error");
      card.querySelector(".result-title").textContent = result.model;
      card.querySelector(".result-meta").textContent = formatMeta(result);
      applyNotice(notice, getTextNotice(result.model));
      body.textContent = result.status === "ok" ? result.output : `Error: ${result.error}`;
      return card;
    })
  );
}

function renderTextPlaceholders(message, modelIds = DEFAULT_TEXT_MODEL_IDS) {
  const models = TEXT_MODELS.filter((m) => modelIds.includes(m.id));
  setGridColumns(resultsContainer, models.length);

  resultsContainer.replaceChildren(
    ...models.map((model) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      const notice = card.querySelector(".result-notice");
      card.classList.add("is-placeholder");
      card.querySelector(".result-title").textContent = model.id;
      card.querySelector(".result-meta").textContent = "Waiting";
      applyNotice(notice, getTextNotice(model.id));
      card.querySelector(".result-body").textContent = message;
      return card;
    })
  );
}

// ── Grid layout ────────────────────────────────────────────────────────────

function setGridColumns(container, count) {
  const cols = count <= 2 ? 2 : 3;
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function setPendingState(isPending, text) {
  promptInput.disabled = isPending;
  temperatureInput.disabled = isPending;
  submitButton.disabled = isPending;
  statusLabel.textContent = text;

  if (!isPending) {
    promptInput.focus();
  }
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatMeta(result) {
  const parts = [formatDuration(result.durationMs)];

  if (typeof result.temperatureUsed === "number") {
    parts.push(`temp ${result.temperatureUsed.toFixed(2)}`);
  }

  return parts.join(" | ");
}

function syncTemperatureLabel() {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(2);
}

function applyNotice(node, text) {
  node.hidden = !text;
  node.textContent = text;
}

async function requestLocalCompare(prompt, temperature, selectedModelIds) {
  const response = await fetch("/api/text/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, temperature, modelIds: selectedModelIds })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed.");
  }

  return payload;
}
