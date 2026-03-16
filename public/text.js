const textForm = document.querySelector("#text-form");
const promptInput = document.querySelector("#text-prompt");
const temperatureInput = document.querySelector("#temperature");
const temperatureValue = document.querySelector("#temperature-value");
const statusLabel = document.querySelector("#text-status");
const submitButton = document.querySelector("#text-submit");
const resultsContainer = document.querySelector("#text-results");
const resultTemplate = document.querySelector("#text-result-template");

const TEXT_MODELS = ["babbage-002", "gpt-3.5-turbo", "gpt-5.4"];

renderTextPlaceholders("Enter a prompt to compare all three text models.");
syncTemperatureLabel();

textForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const temperature = Number(temperatureInput.value);

  if (!prompt) {
    promptInput.focus();
    return;
  }

  setPendingState(true, "Running text comparison...");
  renderTextPlaceholders("Running comparison...");

  try {
    const response = await fetch("/api/text/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt, temperature })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error ?? "Request failed.");
    }

    renderTextResults(payload.results);
    setPendingState(false, "Ready.");
  } catch (error) {
    renderTextPlaceholders(`Text comparison failed: ${error.message}`);
    setPendingState(false, "Last request failed.");
  }
});

temperatureInput.addEventListener("input", () => {
  syncTemperatureLabel();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    textForm.requestSubmit();
  }
});

function renderTextResults(results) {
  resultsContainer.replaceChildren(
    ...results.map((result) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      const body = card.querySelector(".result-body");

      card.classList.toggle("is-error", result.status === "error");
      card.querySelector(".result-title").textContent = result.model;
      card.querySelector(".result-meta").textContent = formatDuration(result.durationMs);
      body.textContent = result.status === "ok" ? result.output : `Error: ${result.error}`;
      return card;
    })
  );
}

function renderTextPlaceholders(message) {
  resultsContainer.replaceChildren(
    ...TEXT_MODELS.map((model) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      card.classList.add("is-placeholder");
      card.querySelector(".result-title").textContent = model;
      card.querySelector(".result-meta").textContent = "Waiting";
      card.querySelector(".result-body").textContent = message;
      return card;
    })
  );
}

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

function syncTemperatureLabel() {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(2);
}
