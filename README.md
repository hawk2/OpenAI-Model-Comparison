# Text and Image Comparison UI

Minimal local interface with three pages:

- `/` to choose text or image comparison
- `/text` to compare `babbage-002`, `gpt-3.5-turbo`, and `gpt-5.4`
- `/image` to compare `dall-e-2`, `dall-e-3`, and `gpt-image-1.5`

## Setup

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` to your API key.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Notes

- The browser never sees your API key. Requests go through `server.js`.
- Text comparison uses:
  - `babbage-002` via `POST /v1/completions`
  - `gpt-3.5-turbo` via `POST /v1/chat/completions`
  - `gpt-5.4` via `POST /v1/chat/completions`
- Image comparison uses `POST /v1/images/generations` for `dall-e-2`, `dall-e-3`, and `gpt-image-1.5`, always requesting one `1024x1024` image. The DALL-E models request `response_format: "b64_json"`; `gpt-image-1.5` does not accept that parameter.
- There are no model or route fallbacks. `OPENAI_API_KEY` is required, and unknown paths return `404`.
- As of March 15, 2026, OpenAI documents `babbage-002`, `gpt-3.5-turbo`, `dall-e-2`, and `dall-e-3` as legacy or deprecated models, while `gpt-5.4` and `gpt-image-1.5` are current.
- `gpt-image-1.5` may require API organization verification before image generation succeeds.
