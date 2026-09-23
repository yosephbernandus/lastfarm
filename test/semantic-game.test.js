import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNpcInterpretation,
  applyPlotAction,
  createGameState,
  deliverHarvest,
  endDay,
  isCurrentSemanticResponse,
  parseSavedGame,
} from "../src/game-state.js";
import { classifyLocally, makeFallbackResult, parseInterpretRequest, parseSemanticResult } from "../src/semantic.js";

function requestFor(state, { requestId = "request-0001", npcId = "mira", text = "Halo, apa kabar kebun?" } = {}) {
  return {
    requestId,
    stateRevision: state.revision,
    npcId,
    text,
    language: "id",
    context: {
      day: state.day,
      timeSlot: state.timeSlot,
      locationId: npcId,
      questStatus: state.promise.status,
      relationship: state.relationships[npcId],
      memories: state.memories[npcId].slice(-5),
    },
  };
}

test("semantic request and response boundaries reject malformed and extra data", () => {
  const state = createGameState();
  const request = requestFor(state);
  const parsed = parseInterpretRequest(request);
  assert.equal(parsed.ok, true);
  assert.equal(parseInterpretRequest({ ...request, stateRevision: -1 }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, npcId: "unknown" }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, context: { ...request.context, relationship: 21 } }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, context: { ...request.context, memories: Array(6).fill("memory") } }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, context: { ...request.context, memories: ["m".repeat(161)] } }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, context: { ...request.context, save: { inventory: {} } } }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, language: "xx" }).ok, false);
  assert.equal(parseInterpretRequest({ ...request, unusedSave: { inventory: { harvest: 99 } } }).ok, false);

  const result = classifyLocally(parsed.value);
  assert.equal(parseSemanticResult(result, parsed.value).ok, true);
  assert.equal(parseSemanticResult({ ...result, inventoryGrant: 9 }, parsed.value).ok, false);
  assert.equal(parseSemanticResult({ ...result, confidence: 1.2 }, parsed.value).ok, false);
});

test("local fallback is deterministic and never emits game mutations", () => {
  const state = createGameState();
  const request = requestFor(state, { text: "Saya janji akan mengantar hasil panen ke warung." });
  const parsed = parseInterpretRequest(request).value;
  const first = makeFallbackResult(parsed);
  const second = makeFallbackResult(parsed);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), [
    "confidence", "decision", "intent", "npcId", "referencedQuestId", "requestId", "stateRevision", "topicId",
  ]);
  assert.equal(first.intent, "make_promise");
  assert.equal(first.referencedQuestId, "delivery-first-harvest");
  assert.equal(state.promise.status, "offered");
  assert.equal(state.inventory.harvest, 0);
  assert.deepEqual(state.relationships, { mira: 0, asep: 0 });
});

test("the same greeting gets a different authored response after memory changes", () => {
  let state = createGameState();
  const firstRequest = requestFor(state, { requestId: "greeting-first" });
  const firstResult = makeFallbackResult(firstRequest);
  assert.equal(isCurrentSemanticResponse(state, firstRequest, firstResult), true);
  const first = applyNpcInterpretation(state, firstRequest, firstResult, { inRange: true });
  assert.equal(first.ok, true);
  assert.equal(first.dialogue.lineId, "greet");
  state = first.state;

  const secondRequest = requestFor(state, { requestId: "greeting-second" });
  const secondResult = makeFallbackResult(secondRequest);
  const second = applyNpcInterpretation(state, secondRequest, secondResult, { inRange: true });
  assert.equal(second.ok, true);
  assert.equal(second.dialogue.lineId, "greet-again");
  assert.equal(second.state.relationships.mira, 2);
});

test("stale, duplicate, and out-of-range interpretations leave state unchanged", () => {
  const state = createGameState();
  const request = requestFor(state);
  const result = makeFallbackResult(request);
  const progressed = endDay(state).state;
  assert.equal(isCurrentSemanticResponse(progressed, request, result), false);
  assert.equal(applyNpcInterpretation(progressed, request, result, { inRange: true }).reason, "stale-or-duplicate");
  assert.equal(applyNpcInterpretation(state, request, result, { inRange: false }).reason, "out-of-range");
  assert.equal(state.revision, 0);
  assert.equal(state.relationships.mira, 0);

  const accepted = applyNpcInterpretation(state, request, result, { inRange: true });
  assert.equal(applyNpcInterpretation(accepted.state, request, result, { inRange: true }).reason, "stale-or-duplicate");
});

test("promise can be kept through deterministic plant, water, day, harvest, and delivery actions", () => {
  let state = createGameState();
  const promiseRequest = requestFor(state, { text: "Saya janji akan mengantar hasil panen ke warung." });
  const promiseResult = makeFallbackResult(promiseRequest);
  const promised = applyNpcInterpretation(state, promiseRequest, promiseResult, { inRange: true });
  assert.equal(promised.ok, true);
  state = promised.state;
  assert.equal(state.promise.status, "promised");
  assert.equal(state.inventory.harvest, 0);

  state = applyPlotAction(state, { plotId: "plot-1", action: "plant", inRange: true }).state;
  state = applyPlotAction(state, { plotId: "plot-1", action: "water", inRange: true }).state;
  state = endDay(state).state;
  assert.equal(state.day, 2);
  assert.equal(state.plots[0].stage, "ready");
  state = applyPlotAction(state, { plotId: "plot-1", action: "harvest", inRange: true }).state;
  assert.equal(state.inventory.harvest, 1);
  state = deliverHarvest(state, { inRange: true }).state;
  assert.equal(state.promise.status, "kept");
  assert.equal(state.inventory.harvest, 0);
});

test("an unkept delivery promise becomes a recorded consequence at end of day three", () => {
  let state = createGameState();
  const request = requestFor(state, { text: "Saya janji akan mengantar hasil panen ke warung." });
  state = applyNpcInterpretation(state, request, makeFallbackResult(request), { inRange: true }).state;
  state = endDay(state).state;
  state = endDay(state).state;
  state = endDay(state).state;
  assert.equal(state.ended, true);
  assert.equal(state.promise.status, "broken");
  assert.match(state.eventLog.at(-2), /delivery was not made/i);
});

test("low-confidence provider output clarifies without relationship or promise mutation", () => {
  const state = createGameState();
  const request = requestFor(state, { text: "Maybe something, I suppose." });
  const result = {
    ...makeFallbackResult(request),
    intent: "greet",
    decision: "supported",
    confidence: 0.2,
  };
  const committed = applyNpcInterpretation(state, request, result, { inRange: true });
  assert.equal(committed.dialogue.lineId, "clarify");
  assert.equal(committed.state.relationships.mira, 0);
  assert.equal(committed.state.memories.mira.length, 0);
  assert.equal(committed.state.promise.status, "offered");
});

test("corrupt and incompatible local saves fall back safely", () => {
  assert.equal(parseSavedGame("not json"), null);
  assert.equal(parseSavedGame({ version: 1 }), null);
  const parsed = parseSavedGame(JSON.stringify(createGameState()));
  assert.equal(parsed.version, 2);
  assert.equal(parsed.plots.length, 6);
});
