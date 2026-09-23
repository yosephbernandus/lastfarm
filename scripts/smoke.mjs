import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      JEV_API_URL: "",
      JEV_API_KEY: "",
      DIALOGUE_PROVIDER: "none",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      ...extraEnv,
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error("local server exited during startup");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return child;
    } catch {}
    await delay(50);
  }
  child.kill("SIGTERM");
  throw new Error("local server did not become healthy");
}

function interpretRequest(requestId, text = "Halo, bagaimana kabar kebun?") {
  return {
    requestId,
    stateRevision: 7,
    npcId: "mira",
    text,
    language: "id",
    context: { day: 2, timeSlot: 1, locationId: "mira", questStatus: "offered", relationship: 2, memories: ["greet:general:day-1"] },
  };
}

const children = [];
let providerServer;
try {
  const projectBundle = await readFile(new URL("../dist/game.bundle.js", import.meta.url), "utf8");
  assert.equal(projectBundle.includes("JEV_API_KEY"), false, "provider secret setting name must not enter browser code");
  assert.equal(projectBundle.includes("JEV_API_URL"), false, "provider URL setting must remain server configuration");
  assert.equal(projectBundle.includes("OPENAI_API_KEY"), false, "OpenAI secret setting name must not enter browser code");
  assert.equal(projectBundle.includes("OPENAI_BASE_URL"), false, "OpenAI URL setting must remain server configuration");

  const ignoreRules = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignoreRules, /^\.env$/m);
  assert.match(ignoreRules, /^!\.env\.example$/m);

  const fallbackPort = await freePort();
  const fallbackChild = await startServer(fallbackPort);
  children.push(fallbackChild);
  const base = `http://127.0.0.1:${fallbackPort}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health, {
    ok: true,
    providerAvailable: false,
    semanticProviderAvailable: false,
    dialogueProviderAvailable: false,
  });

  const pageResponse = await fetch(base);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /<canvas id="gameCanvas"/);
  assert.match(page, /game\.bundle\.js/);
  assert.equal((await fetch(`${base}/game.bundle.js`)).status, 200);
  assert.equal((await fetch(`${base}/.env`)).status, 404);

  const input = interpretRequest("fallback-0001");
  const fallbackResponse = await fetch(`${base}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const fallbackEnvelope = await fallbackResponse.json();
  assert.equal(fallbackResponse.status, 200);
  assert.equal(fallbackEnvelope.semanticProvider, "local-fallback");
  assert.equal(fallbackEnvelope.dialogueProvider, "authored-fallback");
  assert.equal(fallbackEnvelope.result.intent, "greet");
  assert.equal((await fetch(`${base}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, stateRevision: -1 }),
  })).status, 400);

  let fakeJevCalls = 0;
  let fakeOpenAiCalls = 0;
  let sawServerAuth = false;
  let sawOpenAiServerAuth = false;
  let sawGenericServerAuth = false;
  let observedProviderPayload = null;
  let observedOpenAiPayload = null;
  providerServer = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const inputBody = JSON.parse(body);
      if (request.url === "/v1/responses") {
        fakeOpenAiCalls += 1;
        sawOpenAiServerAuth = request.headers.authorization === "Bearer test-only-openai-secret";
        observedOpenAiPayload = inputBody;
        const context = JSON.parse(inputBody.input);
        const responseText = context.playerMessageAsQuotedData === "force invalid dialogue"
          ? "**not plain dialogue**"
          : "Selamat pagi. Kebun terasa tenang hari ini.";
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({
            status: "completed",
            output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: responseText }] }],
          }));
        }, 40);
        return;
      }
      if (inputBody.model && inputBody.questions) {
        fakeJevCalls += 1;
        sawServerAuth = request.headers.authorization === "Bearer test-only-secret";
        observedProviderPayload = inputBody;
      } else {
        fakeJevCalls += 1;
        sawGenericServerAuth = request.headers["x-fake-auth"] === "Token test-only-secret";
      }
      if (!inputBody.model || !inputBody.questions) {
        const result = {
          requestId: inputBody.requestId,
          stateRevision: inputBody.stateRevision,
          npcId: inputBody.npcId,
          intent: "greet",
          topicId: null,
          referencedQuestId: null,
          decision: "supported",
          confidence: 0.99,
        };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ result }));
        return;
      }
      const selected = {
        intent: "greet",
        topic: "none",
        referenced_quest: "none",
        decision: "supported",
      };
      const answers = Object.fromEntries(Object.entries(observedProviderPayload.questions).map(([questionId, question]) => {
        const choices = Object.keys(question.criteria);
        const choice = selected[questionId];
        return [questionId, {
          type: "choice",
          choice,
          confidence: 0.99,
          probabilities: Object.fromEntries(choices.map((name) => [name, name === choice ? 1 : 0])),
        }];
      }));
      if (observedProviderPayload.state.message.text === "force invalid") answers.intent.unexpected = true;
      const payload = {
        model: "jev-test-model",
        answers,
        usage: { input_tokens: 32, output_tokens: 0 },
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", resolve);
  });

  const providerPort = providerServer.address().port;
  const configuredPort = await freePort();
  const configuredChild = await startServer(configuredPort, {
    JEV_API_URL: `http://127.0.0.1:${providerPort}/v1/systemone`,
    JEV_API_KEY: "test-only-secret",
    JEV_API_PROTOCOL: "",
    JEV_MODEL: "",
    DIALOGUE_PROVIDER: "openai",
    OPENAI_API_KEY: "test-only-openai-secret",
    OPENAI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    DIALOGUE_MODEL: "gpt-5.6-luna",
    DIALOGUE_MAX_OUTPUT_TOKENS: "96",
  });
  children.push(configuredChild);
  const configuredBase = `http://127.0.0.1:${configuredPort}`;

  const providerInput = interpretRequest("configured-0001");
  const providerRequest = () => fetch(`${configuredBase}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(providerInput),
  });
  const [providerResponse, duplicateResponse] = await Promise.all([providerRequest(), providerRequest()]);
  const providerEnvelope = await providerResponse.json();
  const concurrentDuplicate = await duplicateResponse.json();
  assert.equal(providerResponse.status, 200);
  assert.equal(providerEnvelope.semanticProvider, "jev-adapter");
  assert.equal(providerEnvelope.dialogueProvider, "openai");
  assert.equal(providerEnvelope.generatedDialogue, "Selamat pagi. Kebun terasa tenang hari ini.");
  assert.equal(providerEnvelope.result.intent, "greet");
  assert.equal(concurrentDuplicate.deduplicated, true);
  assert.equal(fakeJevCalls, 1);
  assert.equal(fakeOpenAiCalls, 1, "concurrent duplicate must not create a second dialogue request");
  assert.equal(sawServerAuth, true);
  assert.equal(sawOpenAiServerAuth, true);
  assert.equal(JSON.stringify(providerEnvelope).includes("test-only-secret"), false);
  assert.equal(JSON.stringify(providerEnvelope).includes("test-only-openai-secret"), false);
  assert.deepEqual(Object.keys(observedProviderPayload).sort(), ["model", "questions", "state"]);
  assert.equal(observedProviderPayload.model, "jev-latest");
  assert.equal(observedProviderPayload.state.message.text, providerInput.text);
  assert.equal(observedProviderPayload.state.neighbor.name, "Mira");
  assert.deepEqual(Object.keys(observedProviderPayload.questions).sort(), ["decision", "intent", "referenced_quest", "topic"]);
  assert.deepEqual(Object.keys(observedProviderPayload.questions.intent.criteria), [
    "greet", "ask_local_information", "offer_help", "make_promise", "apologize", "request_trade", "other",
  ]);
  assert.equal(Object.hasOwn(observedProviderPayload.questions.topic.criteria, "none"), true);
  assert.equal(Object.hasOwn(observedProviderPayload.questions.referenced_quest.criteria, "none"), true);
  assert.deepEqual(Object.keys(observedOpenAiPayload).sort(), [
    "input", "instructions", "max_output_tokens", "model", "reasoning", "store", "tools",
  ]);
  assert.equal(observedOpenAiPayload.model, "gpt-5.6-luna");
  assert.equal(observedOpenAiPayload.store, false);
  assert.deepEqual(observedOpenAiPayload.reasoning, { effort: "none" });
  assert.deepEqual(observedOpenAiPayload.tools, []);
  assert.equal(observedOpenAiPayload.max_output_tokens, 96);
  const generationContext = JSON.parse(observedOpenAiPayload.input);
  assert.equal(generationContext.playerMessageAsQuotedData, providerInput.text);
  assert.equal(generationContext.village.relationship, providerInput.context.relationship);
  assert.deepEqual(generationContext.village.memories, providerInput.context.memories);
  assert.equal(Object.hasOwn(generationContext, "inventory"), false);
  assert.equal(Object.hasOwn(generationContext, "eventLog"), false);

  const conflictResponse = await fetch(`${configuredBase}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...providerInput, text: "different message" }),
  });
  assert.equal(conflictResponse.status, 409);

  const invalidResponse = await fetch(`${configuredBase}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(interpretRequest("invalid-0001", "force invalid")),
  });
  const invalidEnvelope = await invalidResponse.json();
  assert.equal(invalidEnvelope.semanticProvider, "local-fallback");
  assert.equal(invalidEnvelope.semanticFallbackReason, "provider-invalid-result");
  assert.equal(invalidEnvelope.dialogueProvider, "openai", "dialogue may naturally voice a local semantic fallback");

  const invalidDialogueResponse = await fetch(`${configuredBase}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(interpretRequest("invalid-dialogue-0001", "force invalid dialogue")),
  });
  const invalidDialogueEnvelope = await invalidDialogueResponse.json();
  assert.equal(invalidDialogueEnvelope.dialogueProvider, "authored-fallback");
  assert.equal(invalidDialogueEnvelope.generatedDialogue, null);
  assert.equal(invalidDialogueEnvelope.dialogueFallbackReason, "dialogue-markdown");
  assert.equal(fakeOpenAiCalls, 3, "each distinct request calls the dialogue provider once");

  const genericPort = await freePort();
  const genericChild = await startServer(genericPort, {
    JEV_API_URL: `http://127.0.0.1:${providerPort}/custom-adapter`,
    JEV_API_KEY: "test-only-secret",
    JEV_API_PROTOCOL: "generic",
    JEV_API_AUTH_HEADER: "X-Fake-Auth",
    JEV_API_AUTH_PREFIX: "Token",
  });
  children.push(genericChild);
  const genericInput = interpretRequest("generic-0001");
  const genericResponse = await fetch(`http://127.0.0.1:${genericPort}/api/npc/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(genericInput),
  });
  const genericEnvelope = await genericResponse.json();
  assert.equal(genericResponse.status, 200);
  assert.equal(genericEnvelope.semanticProvider, "jev-adapter");
  assert.equal(genericEnvelope.dialogueProvider, "authored-fallback");
  assert.equal(genericEnvelope.result.intent, "greet");
  assert.equal(sawGenericServerAuth, true);

  console.log("smoke ok: static shell, secret containment, Jev/OpenAI loopback adapters, authored fallbacks, bounded context, and combined-response deduplication");
} finally {
  for (const child of children) child.kill("SIGTERM");
  if (providerServer) {
    providerServer.closeAllConnections?.();
    await new Promise((resolve) => providerServer.close(() => resolve()));
  }
}
