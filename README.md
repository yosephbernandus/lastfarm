# Lastlight Farm — Foot of the Volcano

A small browser-first 3D prototype about one village in the volcanic foothills of West Java. Walk between six crop plots, a farmhouse, a warung, Mira, and Asep over three days. This is a playable vertical slice, not an open-world map.

## Run locally

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:8787>. The Node server serves the built static game and an optional same-origin semantic proxy. `npm run start` runs the same local server. Babylon.js is bundled locally; gameplay has no CDN or runtime network dependency.

## Play

- Move with WASD or arrow keys; press E near a neighbor, plot, or warung. Drag in the scene to look around. Touch users get an on-screen direction pad.
- Plant and water a plot. Watered crops become ready after the day changes; harvest one and deliver it to Asep after promising Mira.
- A useful interaction spends one time slot. The story spans three days, and the day can be ended early. Promise status is kept or becomes broken when its due day passes.
- Jev classifies meaning into a constrained schema; an optional OpenAI adapter voices the NPC naturally. Deterministic authored rules alone update game state, and authored lines take over whenever dialogue generation is unavailable or invalid. Repeating a greeting changes the response through memory. Neither provider can award inventory, complete the promise, move the player, or change relationships.
- Save data is versioned and stored in this browser. Reset asks before clearing it. Corrupt or incompatible saves start a safe new story.

## Semantic adapter (optional)

The browser sends a bounded message to the same-origin `POST /api/npc/interpret` route. The server first asks Jev to classify the message (or uses the deterministic local classifier), then optionally asks a separate dialogue generator to write one short line. The server returns separate `semanticProvider` and `dialogueProvider` metadata. Dialogue generation sees only the NPC's trusted profile, the validated semantic result, selected language, relationship number, the current quest status, and at most five bounded memory strings—not the whole save or chat history. Generated dialogue cannot change deterministic game rules. Low-confidence, clarify, and out-of-scope interpretations may still receive a natural clarification, but the prompt restricts it to an NPC reply and forbids claims of game-state changes.

Without configured providers, the deterministic local classifier and authored lines keep the game playable. `server.mjs` reads `.env`; `JEV_API_KEY` and `OPENAI_API_KEY` stay server-side. OpenAI is called only after semantic interpretation and once per unique request; the server caches the combined interpretation and dialogue response by request ID so retries do not create another generation request.

Copy `.env.example` to `.env`. Required variables for a configured adapter:

- `JEV_API_URL`: full endpoint URL. For TypeSafe System One this is `https://api.typesafe.ai/v1/systemone`.
- `JEV_API_KEY`: server-only TypeSafe API key.

Optional configuration:

- `JEV_API_PROTOCOL` defaults to `typesafe-systemone` when URL and key are configured. Set it to `generic` for the prior custom adapter contract.
- `JEV_MODEL` defaults to `jev-latest`.
- `JEV_API_AUTH_HEADER` (default `Authorization`) and `JEV_API_AUTH_PREFIX` (default `Bearer`) customize authentication only for `generic`; TypeSafe always uses `Authorization: Bearer <key>`.
- `PORT` changes the local server port (default `8787`).

### Natural dialogue voice (optional)

Set `DIALOGUE_PROVIDER=openai` to enable the current provider, then provide `OPENAI_API_KEY`. The adapter uses the OpenAI Responses API; `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1` and is intended only for an explicitly configured compatible endpoint. `DIALOGUE_MODEL` defaults to `gpt-5.6-luna`. `DIALOGUE_MAX_OUTPUT_TOKENS` defaults to `96` and is clamped to 32–160; requests also use a four-second timeout, `store:false`, no tools, and reasoning effort `none`. Leave the key blank or set `DIALOGUE_PROVIDER=none` to use authored dialogue only. Future providers belong behind the `src/dialogue-generator.js` registry and must preserve the same bounded inputs and output validation.

The configured model's published rates are $0.20 per million input tokens and $1.20 per million output tokens; at the default 96-token output ceiling, the output-token portion is at most about $0.0001152 per newly generated reply, excluding input tokens. Actual billed usage depends on the provider's current rates and response. Keep the token cap low, monitor account usage, and disable generation when not needed. See the [Responses API reference](https://platform.openai.com/docs/api-reference/responses/create) and [GPT-5.6 Luna model page](https://platform.openai.com/docs/models/gpt-5.6-luna).

The provider prompt uses the selected language (`id`, `en`, or `su`); `su` is explicitly routed to Indonesian output until Sundanese lines receive speaker review. It treats player text as quoted data, follows trusted NPC profiles and the validated quest context, and forbids markdown, choices, metadata, promises of state changes, and claims of item or quest completion. Provider failures and invalid lines fall back to authored dialogue.

The TypeSafe adapter sends `POST /v1/systemone` a bounded `state`, selected `model`, and four `choice` questions. The question IDs route answers back to our code; the model can only choose these authored labels:

```json
{
  "model": "jev-latest",
  "state": {
    "requestId": "example-0001",
    "stateRevision": 4,
    "message": { "speakerId": "mira", "text": "Saya janji akan mengantar hasil panen ke warung.", "language": "id" },
    "neighbor": { "name": "Mira", "hometown": "Cisarua, Bogor, West Java", "languages": ["Bahasa Indonesia", "Sundanese"] },
    "village": { "day": 1, "timeSlot": 0, "locationId": "mira", "quest": { "id": "delivery-first-harvest", "status": "offered", "dueDay": 3 } }
  },
  "questions": {
    "intent": { "type": "choice", "instructions": "Classify the player's message intent.", "criteria": { "greet": "…", "ask_local_information": "…", "offer_help": "…", "make_promise": "…", "apologize": "…", "request_trade": "…", "other": "…" } },
    "topic": { "type": "choice", "instructions": "Choose a topic or none.", "criteria": { "village": "…", "farm": "…", "weather": "…", "delivery": "…", "crops": "…", "market": "…", "volcano": "…", "relationship": "…", "none": "…" } },
    "referenced_quest": { "type": "choice", "instructions": "Choose a referenced quest or none.", "criteria": { "delivery-first-harvest": "…", "none": "…" } },
    "decision": { "type": "choice", "instructions": "Select the content-scope decision.", "criteria": { "supported": "…", "clarify": "…", "out_of_scope": "…" } }
  }
}
```

Each answer must be a TypeSafe `ChoiceAnswer` with `choice`, `confidence`, and probabilities for exactly the submitted criteria. The server strictly validates the four answers, maps the `none` sentinel to `null`, and constructs the internal semantic result using IDs from the original request rather than trusting any provider-supplied game IDs. Overall confidence is the minimum of the four answer confidences, a conservative rule because every answer constrains authored behavior. TypeSafe responses are expected in the documented `{ model, answers, usage }` shape.

```json
{
  "model": "jev-1.x",
  "answers": {
    "intent": { "type": "choice", "choice": "make_promise", "confidence": 0.9, "probabilities": { "greet": 0.05, "ask_local_information": 0.02, "offer_help": 0.02, "make_promise": 0.82, "apologize": 0.01, "request_trade": 0.03, "other": 0.05 } },
    "topic": { "type": "choice", "choice": "delivery", "confidence": 0.9, "probabilities": { "village": 0.02, "farm": 0.01, "weather": 0.01, "delivery": 0.86, "crops": 0.05, "market": 0.02, "volcano": 0.01, "relationship": 0.005, "none": 0.015 } },
    "referenced_quest": { "type": "choice", "choice": "delivery-first-harvest", "confidence": 0.9, "probabilities": { "delivery-first-harvest": 0.94, "none": 0.06 } },
    "decision": { "type": "choice", "choice": "supported", "confidence": 0.9, "probabilities": { "supported": 0.92, "clarify": 0.04, "out_of_scope": 0.04 } }
  },
  "usage": { "input_tokens": 120, "output_tokens": 0 }
}
```

For a custom adapter, set `JEV_API_PROTOCOL=generic`; it receives the original internal request and returns the constrained semantic result directly or under `result`. The server never calls a real provider during tests. If the adapter is unset, unavailable, times out, returns invalid JSON, or violates its protocol schema, the deterministic local interpreter handles the message instead. A repeated request ID is deduplicated; reusing one for different input is rejected. A late or stale client result is ignored.

The official API contract is published at <https://api.typesafe.ai/openapi.json>.

## Place and language note

Mira and Asep have explicit fictional profiles, including hometown, languages, preference, and speaking style; language is not inferred from appearance. Mira’s hometown is listed as Cisarua, Bogor; Asep’s as Lembang, West Bandung. These are authored prototype details, not claims of community review. Indonesian lines are drafts; Sundanese lines are not yet authored or speaker-reviewed, so the game provides Indonesian fallback subtitles.

## Verify

```sh
npm test
npm run smoke
node --check dist/game.bundle.js
git diff --check
```

`npm run smoke` rebuilds, runs deterministic state/schema/dialogue tests, then starts local server processes plus fake loopback Jev and OpenAI adapters. It verifies server-only credentials, Responses payload settings, combined-response deduplication, and authored fallback without contacting real providers.
