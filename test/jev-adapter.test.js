import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTypeSafeRequest,
  parseTypeSafeResponse,
  resolveJevConfiguration,
  typeSafeQuestionOptions,
} from "../src/jev-adapter.js";

const internalRequest = {
  requestId: "adapter-test-01",
  stateRevision: 12,
  npcId: "mira",
  text: "Saya berjanji akan mengantar panen ke warung.",
  language: "id",
  context: { day: 2, timeSlot: 1, locationId: "mira", questStatus: "offered", relationship: 0, memories: [] },
};

function choice(choiceValue, options, confidence = 0.9) {
  const probabilities = Object.fromEntries(options.map((option) => [option, option === choiceValue ? 1 : 0]));
  return { type: "choice", choice: choiceValue, confidence, probabilities };
}

function officialResponse(overrides = {}) {
  const options = typeSafeQuestionOptions();
  return {
    model: "jev-concrete-version",
    answers: {
      intent: choice("make_promise", options.intent, 0.9),
      topic: choice("delivery", options.topic, 0.8),
      referenced_quest: choice("delivery-first-harvest", options.referenced_quest, 0.7),
      decision: choice("supported", options.decision, 0.95),
    },
    usage: { input_tokens: 10, output_tokens: 0 },
    ...overrides,
  };
}

test("configured TypeSafe defaults to Jev System One protocol and model", () => {
  const resolved = resolveJevConfiguration({ JEV_API_URL: "http://127.0.0.1/test", JEV_API_KEY: "not-displayed" });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.protocol, "typesafe-systemone");
  assert.equal(resolved.model, "jev-latest");
  assert.equal(resolveJevConfiguration({ JEV_API_URL: "", JEV_API_KEY: "" }).configured, false);
  assert.equal(resolveJevConfiguration({ JEV_API_URL: "local", JEV_API_KEY: "key", JEV_API_PROTOCOL: "generic" }).protocol, "generic");
});

test("TypeSafe request translates bounded context into four constrained choice questions", () => {
  const payload = buildTypeSafeRequest(internalRequest);
  assert.deepEqual(Object.keys(payload).sort(), ["model", "questions", "state"]);
  assert.equal(payload.model, "jev-latest");
  assert.deepEqual(Object.keys(payload.questions).sort(), ["decision", "intent", "referenced_quest", "topic"]);
  assert.equal(payload.state.message.text, internalRequest.text);
  assert.equal(payload.state.neighbor.name, "Mira");
  assert.equal(payload.state.village.quest.status, "offered");
  for (const [id, question] of Object.entries(payload.questions)) {
    assert.equal(question.type, "choice");
    assert.equal(typeof question.instructions, "string");
    assert.deepEqual(Object.keys(question.criteria), typeSafeQuestionOptions()[id]);
  }
  assert.deepEqual(Object.keys(payload.questions.intent.criteria), [
    "greet", "ask_local_information", "offer_help", "make_promise", "apologize", "request_trade", "other",
  ]);
  assert.equal(Object.hasOwn(payload.questions.topic.criteria, "none"), true);
  assert.equal(Object.hasOwn(payload.questions.referenced_quest.criteria, "none"), true);
});

test("strict official ChoiceAnswer response maps to internal semantic result conservatively", () => {
  const parsed = parseTypeSafeResponse(officialResponse(), internalRequest);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, {
    requestId: "adapter-test-01",
    stateRevision: 12,
    npcId: "mira",
    intent: "make_promise",
    topicId: "delivery",
    referencedQuestId: "delivery-first-harvest",
    decision: "supported",
    confidence: 0.7,
  });

  const nullable = officialResponse({
    answers: {
      intent: choice("greet", typeSafeQuestionOptions().intent),
      topic: choice("none", typeSafeQuestionOptions().topic),
      referenced_quest: choice("none", typeSafeQuestionOptions().referenced_quest),
      decision: choice("supported", typeSafeQuestionOptions().decision),
    },
  });
  const nullableParsed = parseTypeSafeResponse(nullable, internalRequest);
  assert.equal(nullableParsed.ok, true);
  assert.equal(nullableParsed.value.topicId, null);
  assert.equal(nullableParsed.value.referencedQuestId, null);
});

test("TypeSafe parser rejects missing, extra, malformed, and inconsistent answers", () => {
  const good = officialResponse();
  assert.equal(parseTypeSafeResponse({ ...good, untrusted: true }, internalRequest).ok, false);
  assert.equal(parseTypeSafeResponse({ ...good, answers: { ...good.answers, extra: {} } }, internalRequest).ok, false);
  assert.equal(parseTypeSafeResponse({ ...good, answers: { ...good.answers, intent: { ...good.answers.intent, extra: true } } }, internalRequest).ok, false);

  const badProbability = structuredClone(good);
  badProbability.answers.intent.probabilities.other = 0.4;
  assert.equal(parseTypeSafeResponse(badProbability, internalRequest).ok, false);

  const badChoice = structuredClone(good);
  badChoice.answers.intent.choice = "grant_inventory";
  assert.equal(parseTypeSafeResponse(badChoice, internalRequest).ok, false);

  const inconsistentWinner = structuredClone(good);
  inconsistentWinner.answers.intent.choice = "other";
  assert.equal(parseTypeSafeResponse(inconsistentWinner, internalRequest).ok, false);
});
