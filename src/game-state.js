import { PLAYER_SPAWN, WORLD_HALF_EXTENT } from "./world-math.js";

export const SAVE_VERSION = 2;
export const DAY_NAMES = Object.freeze(["First light", "High sun", "Last light"]);
export const TIME_NAMES = Object.freeze(["Dawn", "Morning", "Afternoon", "Dusk"]);
export const DELIVERY_QUEST_ID = "delivery-first-harvest";
const WORLD_LIMIT = WORLD_HALF_EXTENT - 6;

const PLOT_IDS = Object.freeze(["plot-1", "plot-2", "plot-3", "plot-4", "plot-5", "plot-6"]);
const CROP_STAGES = new Set(["empty", "seedling", "ready"]);

function clone(value) {
  return structuredClone(value);
}

export function createGameState() {
  return {
    version: SAVE_VERSION,
    revision: 0,
    started: false,
    day: 1,
    timeSlot: 0,
    ended: false,
    player: { ...PLAYER_SPAWN },
    plots: PLOT_IDS.map((id) => ({ id, stage: "empty", plantedDay: null, wateredDay: null })),
    inventory: { seeds: 6, harvest: 0 },
    relationships: { mira: 0, asep: 0 },
    memories: { mira: [], asep: [] },
    promise: { id: DELIVERY_QUEST_ID, status: "offered", promisedDay: null, dueDay: 3 },
    lastDialogue: { speakerId: "mira", key: "welcome", intent: null, line: "The hills are quiet at dawn.", lineId: "The hills are quiet at dawn." },
    handledRequests: [],
    eventLog: ["You arrived in the volcanic foothills on the first morning."],
  };
}

function safeInt(value, min = 0, max = 999) {
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min;
}

export function parseSavedGame(raw) {
  try {
    const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!saved || typeof saved !== "object" || saved.version !== SAVE_VERSION) return null;
    const fresh = createGameState();
    if (!Array.isArray(saved.plots) || !saved.inventory || !saved.relationships || !saved.promise) return null;
    const plotsById = new Map(saved.plots.filter((plot) => plot && PLOT_IDS.includes(plot.id)).map((plot) => [plot.id, plot]));
    const plots = PLOT_IDS.map((id) => {
      const plot = plotsById.get(id) || {};
      return {
        id,
        stage: CROP_STAGES.has(plot.stage) ? plot.stage : "empty",
        plantedDay: Number.isInteger(plot.plantedDay) ? safeInt(plot.plantedDay, 1, 3) : null,
        wateredDay: Number.isInteger(plot.wateredDay) ? safeInt(plot.wateredDay, 1, 3) : null,
      };
    });
    const dialogue = saved.lastDialogue && typeof saved.lastDialogue === "object" ? saved.lastDialogue : fresh.lastDialogue;
    const promiseStatus = new Set(["offered", "promised", "kept", "broken"]).has(saved.promise.status)
      ? saved.promise.status
      : "offered";
    return {
      ...fresh,
      revision: safeInt(saved.revision),
      started: Boolean(saved.started),
      day: safeInt(saved.day, 1, 3),
      timeSlot: safeInt(saved.timeSlot, 0, 3),
      ended: Boolean(saved.ended),
      player: {
        x: Number.isFinite(saved.player?.x) ? Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, saved.player.x)) : PLAYER_SPAWN.x,
        z: Number.isFinite(saved.player?.z) ? Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, saved.player.z)) : PLAYER_SPAWN.z,
      },
      plots,
      inventory: {
        seeds: safeInt(saved.inventory.seeds, 0, 6),
        harvest: safeInt(saved.inventory.harvest, 0, 99),
      },
      relationships: {
        mira: safeInt(saved.relationships.mira, -20, 20),
        asep: safeInt(saved.relationships.asep, -20, 20),
      },
      memories: {
        mira: Array.isArray(saved.memories?.mira) ? saved.memories.mira.filter((item) => typeof item === "string").slice(-30) : [],
        asep: Array.isArray(saved.memories?.asep) ? saved.memories.asep.filter((item) => typeof item === "string").slice(-30) : [],
      },
      promise: {
        id: DELIVERY_QUEST_ID,
        status: promiseStatus,
        promisedDay: Number.isInteger(saved.promise.promisedDay) ? safeInt(saved.promise.promisedDay, 1, 3) : null,
        dueDay: 3,
      },
      lastDialogue: {
        speakerId: dialogue.speakerId === "asep" ? "asep" : "mira",
        key: typeof dialogue.key === "string" ? dialogue.key.slice(0, 80) : "welcome",
        intent: typeof dialogue.intent === "string" ? dialogue.intent.slice(0, 50) : null,
        line: typeof dialogue.line === "string" ? dialogue.line.slice(0, 500) : fresh.lastDialogue.line,
        lineId: typeof dialogue.lineId === "string" ? dialogue.lineId.slice(0, 120) : fresh.lastDialogue.lineId,
      },
      handledRequests: Array.isArray(saved.handledRequests) ? saved.handledRequests.filter((id) => typeof id === "string").slice(-50) : [],
      eventLog: Array.isArray(saved.eventLog) ? saved.eventLog.filter((item) => typeof item === "string").slice(-40) : fresh.eventLog,
    };
  } catch (error) {
    return null;
  }
}

export function isCurrentSemanticResponse(state, request, result) {
  return Boolean(
    state && request && result &&
    state.revision === request.stateRevision &&
    request.requestId === result.requestId &&
    request.stateRevision === result.stateRevision &&
    request.npcId === result.npcId &&
    !state.handledRequests.includes(request.requestId)
  );
}

function dialogueFor(state, result) {
  const priorCount = state.memories[result.npcId].filter((memory) => memory.startsWith(`${result.intent}:`)).length;
  if (result.decision === "clarify" || result.confidence < 0.55) return { key: "clarify", lineId: "clarify" };
  if (result.decision === "out_of_scope" || result.intent === "other") return { key: "out-of-scope", lineId: "out-of-scope" };
  if (result.intent === "greet") return { key: priorCount ? "greet-again" : "greet", lineId: priorCount ? "greet-again" : "greet" };
  if (result.intent === "make_promise" && state.promise.status === "promised") return { key: "promise-already", lineId: "promise-already" };
  if (result.intent === "make_promise" && state.promise.status === "kept") return { key: "promise-kept", lineId: "promise-kept" };
  if (result.intent === "make_promise" && state.promise.status === "broken") return { key: "promise-broken", lineId: "promise-broken" };
  if (result.intent === "ask_local_information" && priorCount) return { key: `ask-again-${result.topicId || "local"}`, lineId: `ask-again-${result.topicId || "local"}` };
  const intentKey = result.intent === "ask_local_information" ? "ask-local-information" : result.intent;
  return { key: intentKey, lineId: intentKey };
}

function tick(state) {
  state.timeSlot += 1;
  if (state.timeSlot >= TIME_NAMES.length) advanceDayDraft(state);
}

function advanceDayDraft(state) {
  const oldDay = state.day;
  state.timeSlot = 0;
  state.plots.forEach((plot) => {
    if (plot.stage === "seedling" && plot.wateredDay === oldDay) {
      plot.stage = "ready";
      plot.wateredDay = null;
    }
  });
  if (state.promise.status === "promised" && oldDay >= state.promise.dueDay) {
    state.promise.status = "broken";
    state.eventLog.push("The promised delivery was not made before the third day ended.");
  }
  if (oldDay >= 3) {
    state.day = 3;
    state.ended = true;
    state.eventLog.push("The third day ended. Your time in the foothills is complete.");
  } else {
    state.day = oldDay + 1;
    state.eventLog.push(`Day ${state.day} began beneath the volcano skyline.`);
  }
}

export function endDay(state) {
  if (!state || state.ended) return { ok: false, reason: "ended", state };
  const next = clone(state);
  advanceDayDraft(next);
  next.revision += 1;
  return { ok: true, state: next };
}

export function applyPlotAction(state, { plotId, action, inRange }) {
  if (!state || state.ended) return { ok: false, reason: "ended", state };
  if (inRange !== true) return { ok: false, reason: "out-of-range", state };
  if (!PLOT_IDS.includes(plotId) || !["plant", "water", "harvest"].includes(action)) return { ok: false, reason: "invalid-action", state };
  const next = clone(state);
  const plot = next.plots.find((item) => item.id === plotId);
  if (action === "plant") {
    if (plot.stage !== "empty") return { ok: false, reason: "plot-not-empty", state };
    if (next.inventory.seeds < 1) return { ok: false, reason: "no-seeds", state };
    plot.stage = "seedling";
    plot.plantedDay = next.day;
    plot.wateredDay = null;
    next.inventory.seeds -= 1;
    next.eventLog.push(`You planted a seed in ${plotId}.`);
  } else if (action === "water") {
    if (plot.stage !== "seedling") return { ok: false, reason: "not-growing", state };
    if (plot.wateredDay === next.day) return { ok: false, reason: "already-watered", state };
    plot.wateredDay = next.day;
    next.eventLog.push(`You watered ${plotId}.`);
  } else {
    if (plot.stage !== "ready") return { ok: false, reason: "not-ready", state };
    plot.stage = "empty";
    plot.plantedDay = null;
    plot.wateredDay = null;
    next.inventory.harvest += 1;
    next.eventLog.push(`You harvested ${plotId}.`);
  }
  next.revision += 1;
  tick(next);
  return { ok: true, state: next };
}

export function deliverHarvest(state, { inRange }) {
  if (!state || state.ended) return { ok: false, reason: "ended", state };
  if (inRange !== true) return { ok: false, reason: "out-of-range", state };
  if (state.promise.status !== "promised") return { ok: false, reason: "no-promise", state };
  if (state.inventory.harvest < 1) return { ok: false, reason: "no-harvest", state };
  const next = clone(state);
  next.inventory.harvest -= 1;
  next.promise.status = "kept";
  next.eventLog.push("You delivered the first harvest to the warung on time. The promise was kept.");
  next.revision += 1;
  tick(next);
  return { ok: true, state: next };
}

export function applyNpcInterpretation(state, request, result, { inRange }) {
  if (!state || state.ended) return { ok: false, reason: "ended", state };
  if (inRange !== true) return { ok: false, reason: "out-of-range", state };
  if (!isCurrentSemanticResponse(state, request, result)) return { ok: false, reason: "stale-or-duplicate", state };
  const next = clone(state);
  const npcId = result.npcId;
  let promiseChanged = false;
  if (result.decision === "supported" && result.confidence >= 0.55) {
    if (result.intent === "greet") next.relationships[npcId] = Math.min(20, next.relationships[npcId] + 1);
    if (result.intent === "apologize") next.relationships[npcId] = Math.min(20, next.relationships[npcId] + 1);
    if (
      result.intent === "make_promise" &&
      result.topicId === "delivery" &&
      result.referencedQuestId === DELIVERY_QUEST_ID &&
      next.promise.status === "offered"
    ) {
      next.promise.status = "promised";
      next.promise.promisedDay = next.day;
      next.relationships[npcId] = Math.min(20, next.relationships[npcId] + 2);
      promiseChanged = true;
      next.eventLog.push("You promised Mira to bring the first harvest to the warung before the third day ended.");
    }
  }
  const dialogue = promiseChanged
    ? { key: "promise-confirmed", lineId: "promise-confirmed" }
    : dialogueFor(next, result);
  if (result.decision === "supported" && result.confidence >= 0.55 && result.intent !== "other") {
    next.memories[npcId].push(`${result.intent}:${result.topicId || "general"}:day-${next.day}`);
    next.memories[npcId] = next.memories[npcId].slice(-30);
  }
  next.lastDialogue = {
    speakerId: npcId,
    key: dialogue.key,
    intent: result.intent,
    topicId: result.topicId,
    line: "",
    lineId: dialogue.lineId,
    promiseChanged,
  };
  next.handledRequests.push(request.requestId);
  next.handledRequests = next.handledRequests.slice(-50);
  next.revision += 1;
  tick(next);
  return { ok: true, state: next, dialogue };
}

export function movePlayer(state, { x, z }) {
  if (!state || state.ended || !Number.isFinite(x) || !Number.isFinite(z)) return state;
  const next = clone(state);
  next.player = { x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x)), z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z)) };
  return next;
}
