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

## GitHub Pages

- GitHub Pages cannot keep your server-side API key secret.
- This app now supports pasting an API key into the page and storing it in your browser `localStorage` so direct browser requests can work from a static host.
- That key is only as safe as the browser profile you save it in. Anyone with access to that browser session can use it.
- For anything public or shared, use a backend instead of a pasted browser key.

## Notes

- Without a pasted browser key, requests go through `server.js` and the browser never sees your server-side API key.
- If you paste a key into the browser UI, the browser uses that key directly and stores it locally so the app can work from GitHub Pages.
- Do not commit your real API key to GitHub. If you deploy this app with a backend, store the key as a platform secret or environment variable on the server.
- Text comparison uses:
  - `babbage-002` via `POST /v1/completions`
  - `gpt-3.5-turbo` via `POST /v1/chat/completions`
  - `gpt-5.4` via `POST /v1/chat/completions`
- The text page includes a temperature control and only sends `temperature` to models marked as supporting it.
- Image comparison uses `POST /v1/images/generations` for `dall-e-2`, `dall-e-3`, and `gpt-image-1.5`, always requesting one `1024x1024` image. The DALL-E models request `response_format: "b64_json"`; `gpt-image-1.5` does not accept that parameter.
- There are no model or route fallbacks. `OPENAI_API_KEY` is required, and unknown paths return `404`.
- As of March 15, 2026, OpenAI documents `babbage-002`, `gpt-3.5-turbo`, `dall-e-2`, and `dall-e-3` as legacy or deprecated models, while `gpt-5.4` and `gpt-image-1.5` are current.
- The UI shows countdown notices for models with published shutdown dates: `babbage-002` on September 28, 2026, and `dall-e-2` plus `dall-e-3` on May 12, 2026.
- `gpt-image-1.5` may require API organization verification before image generation succeeds.
