const imageForm = document.querySelector("#image-form");
const promptInput = document.querySelector("#image-prompt");
const statusLabel = document.querySelector("#image-status");
const submitButton = document.querySelector("#image-submit");
const resultsContainer = document.querySelector("#image-results");
const resultTemplate = document.querySelector("#image-result-template");

const IMAGE_MODELS = ["dall-e-2", "dall-e-3", "gpt-image-1.5"];

renderImagePlaceholders("Enter a prompt to compare all three image models.");

imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();

  if (!prompt) {
    promptInput.focus();
    return;
  }

  setPendingState(true, "Running image comparison...");
  renderImagePlaceholders("Generating image...");

  try {
    const response = await fetch("/api/image/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error ?? "Request failed.");
    }

    renderImageResults(payload.results, prompt);
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

function renderImageResults(results, prompt) {
  resultsContainer.replaceChildren(
    ...results.map((result) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      const image = card.querySelector(".result-image");
      const emptyText = card.querySelector(".result-empty");

      card.classList.toggle("is-error", result.status === "error");
      card.querySelector(".result-title").textContent = result.model;
      card.querySelector(".result-meta").textContent = formatDuration(result.durationMs);

      if (result.status === "ok") {
        image.hidden = false;
        image.src = result.src;
        image.alt = `${result.model}: ${prompt}`;
        emptyText.textContent = result.size;
      } else {
        image.hidden = true;
        emptyText.textContent = `Error: ${result.error}`;
      }

      return card;
    })
  );
}

function renderImagePlaceholders(message) {
  resultsContainer.replaceChildren(
    ...IMAGE_MODELS.map((model) => {
      const card = resultTemplate.content.firstElementChild.cloneNode(true);
      card.classList.add("is-placeholder");
      card.querySelector(".result-title").textContent = model;
      card.querySelector(".result-meta").textContent = "Waiting";
      card.querySelector(".result-empty").textContent = message;
      return card;
    })
  );
}

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
