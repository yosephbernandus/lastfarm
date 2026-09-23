import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDialogue,
  resolveDialogueConfiguration,
  validateGeneratedDialogue,
} from "../src/dialogue-generator.js";

const request = {
  requestId: "dialogue-test-01",
  stateRevision: 4,
  npcId: "mira",
  text: "Halo, apa kabar?",
  language: "id",
  context: {
    day: 2,
    timeSlot: 1,
    locationId: "mira",
    questStatus: "offered",
    relationship: 2,
    memories: ["greet:general:day-1"],
  },
};

const semanticResult = {
  requestId: request.requestId,
  stateRevision: request.stateRevision,
  npcId: request.npcId,
  intent: "greet",
  topicId: null,
  referencedQuestId: null,
  decision: "supported",
  confidence: 0.94,
};

const completeResponse = (text) => ({
  ok: true,
  json: async () => ({
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  }),
});

function testConfiguration(overrides = {}) {
  return resolveDialogueConfiguration({
    DIALOGUE_PROVIDER: "openai",
    OPENAI_API_KEY: "fake-loopback-key",
    OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
    DIALOGUE_MODEL: "gpt-5.6-luna",
    DIALOGUE_MAX_OUTPUT_TOKENS: "96",
    ...overrides,
  });
}

test("OpenAI Responses request stays bounded, private, and provider-neutral", async () => {
  let requestOptions;
  const originalSemantic = structuredClone(semanticResult);
  const response = await generateDialogue(request, semanticResult, {
    configuration: testConfiguration({ DIALOGUE_MAX_OUTPUT_TOKENS: "9999" }),
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:9/v1/responses");
      requestOptions = options;
      return completeResponse('“Selamat pagi. Udara terasa sejuk hari ini.”');
    },
  });
  assert.deepEqual(response, { ok: true, provider: "openai", text: "Selamat pagi. Udara terasa sejuk hari ini." });
  assert.equal(requestOptions.headers.authorization, "Bearer fake-loopback-key");
  const body = JSON.parse(requestOptions.body);
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.deepEqual(body.tools, []);
  assert.equal(body.max_output_tokens, 160, "output cap clamps to safe maximum");
  const generationContext = JSON.parse(body.input);
  assert.equal(generationContext.npc.name, "Mira");
  assert.equal(generationContext.semantic.intent, "greet");
  assert.deepEqual(generationContext.village.memories, ["greet:general:day-1"]);
  assert.deepEqual(semanticResult, originalSemantic, "dialogue generation cannot mutate the semantic result");
});

test("dialogue config defaults safely and clamps token limits", () => {
  const defaults = resolveDialogueConfiguration({ OPENAI_API_KEY: "" });
  assert.equal(defaults.provider, "openai");
  assert.equal(defaults.configured, false);
  assert.equal(defaults.model, "gpt-5.6-luna");
  assert.equal(defaults.maxOutputTokens, 96);
  assert.equal(resolveDialogueConfiguration({ DIALOGUE_MAX_OUTPUT_TOKENS: "2" }).maxOutputTokens, 32);
  assert.equal(resolveDialogueConfiguration({ DIALOGUE_MAX_OUTPUT_TOKENS: "9999" }).maxOutputTokens, 160);
  assert.equal(resolveDialogueConfiguration({ DIALOGUE_PROVIDER: "none", OPENAI_API_KEY: "fake" }).configured, false);
  assert.equal(resolveDialogueConfiguration({ DIALOGUE_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "fake" }).configured, true);
});

test("Sundanese selection becomes Indonesian output until reviewed", async () => {
  const sundaneseRequest = { ...request, language: "su" };
  let payload;
  await generateDialogue(sundaneseRequest, semanticResult, {
    configuration: testConfiguration(),
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return completeResponse("Wilujeng enjing.");
    },
  });
  const context = JSON.parse(payload.input);
  assert.equal(context.requestedLanguage, "su");
  assert.equal(context.outputLanguage, "id");
  assert.match(payload.instructions, /respond in Indonesian \(id\)/i);
});

test("generated dialogue is normalized and rejects markup, controls, length, and extra sentences", () => {
  assert.deepEqual(validateGeneratedDialogue("  \"Halo.\nSenang bertemu.\"  "), { ok: true, value: "Halo. Senang bertemu." });
  assert.equal(validateGeneratedDialogue("**hello**").ok, false);
  assert.equal(validateGeneratedDialogue("Hello. Then. And then.").reason, "dialogue-too-many-sentences");
  assert.equal(validateGeneratedDialogue(`a${"x".repeat(321)}`).reason, "dialogue-too-long");
  assert.equal(validateGeneratedDialogue("bad\u0001text").reason, "dialogue-control-character");
  assert.equal(validateGeneratedDialogue("").reason, "dialogue-empty");
});

test("provider errors, timeout, malformed REST output, and absent key return authored-fallback signals", async () => {
  const config = testConfiguration();
  const httpFailure = await generateDialogue(request, semanticResult, {
    configuration: config,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.deepEqual(httpFailure, { ok: false, reason: "dialogue-http-503" });

  const invalidOutput = await generateDialogue(request, semanticResult, {
    configuration: config,
    fetchImpl: async () => completeResponse("# Use a markdown heading"),
  });
  assert.deepEqual(invalidOutput, { ok: false, reason: "dialogue-markdown" });

  const timedOut = await generateDialogue(request, semanticResult, {
    configuration: config,
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
  });
  assert.deepEqual(timedOut, { ok: false, reason: "dialogue-timeout" });

  const unconfigured = await generateDialogue(request, semanticResult, {
    configuration: testConfiguration({ OPENAI_API_KEY: "" }),
  });
  assert.deepEqual(unconfigured, { ok: false, reason: "dialogue-unconfigured" });
});
