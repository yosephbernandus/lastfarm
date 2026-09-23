export const NPC_PROFILES = Object.freeze({
  mira: Object.freeze({
    id: "mira",
    name: "Mira",
    identity: "Indonesian",
    hometown: "Cisarua, Bogor, West Java",
    languages: ["Bahasa Indonesia", "Sundanese"],
    preferredLanguage: "id",
    fallbackLanguage: "id",
    style: "Quiet, practical, and warm; she speaks in short observations about weather, crops, and shared work.",
  }),
  asep: Object.freeze({
    id: "asep",
    name: "Asep",
    identity: "Sundanese",
    hometown: "Lembang, West Bandung, West Java",
    languages: ["Sundanese", "Bahasa Indonesia"],
    preferredLanguage: "su",
    fallbackLanguage: "id",
    style: "Playful and observant; he likes local place stories and market talk, without assuming the visitor understands Sundanese.",
  }),
});

export const INTENTS = Object.freeze([
  "greet",
  "ask_local_information",
  "offer_help",
  "make_promise",
  "apologize",
  "request_trade",
  "other",
]);

export const TOPICS = Object.freeze([
  "village",
  "farm",
  "weather",
  "delivery",
  "crops",
  "market",
  "volcano",
  "relationship",
]);

export const QUEST_IDS = Object.freeze(["delivery-first-harvest"]);
export const DECISIONS = Object.freeze(["supported", "clarify", "out_of_scope"]);
export const LANGUAGES = Object.freeze(["id", "en", "su"]);

const LOCATIONS = new Set([
  "farmhouse", "warung", "path", "mira", "asep",
  "plot-1", "plot-2", "plot-3", "plot-4", "plot-5", "plot-6",
]);
const QUEST_STATUSES = new Set(["offered", "promised", "kept", "broken"]);
const INTENT_SET = new Set(INTENTS);
const TOPIC_SET = new Set(TOPICS);
const QUEST_SET = new Set(QUEST_IDS);
const DECISION_SET = new Set(DECISIONS);
const LANGUAGE_SET = new Set(LANGUAGES);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(error) {
  return { ok: false, error };
}

export function parseInterpretRequest(input) {
  if (!isRecord(input)) return invalid("body must be an object");
  const allowedKeys = new Set(["requestId", "stateRevision", "npcId", "text", "language", "context"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return invalid("request contains unknown fields");
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(requestId)) return invalid("requestId is invalid");
  if (!Number.isSafeInteger(input.stateRevision) || input.stateRevision < 0) return invalid("stateRevision is invalid");
  if (typeof input.npcId !== "string" || !Object.hasOwn(NPC_PROFILES, input.npcId)) return invalid("npcId is invalid");
  if (typeof input.text !== "string") return invalid("text is required");
  const text = input.text.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 500);
  if (!text) return invalid("text must not be empty");
  if (!LANGUAGE_SET.has(input.language)) return invalid("language is invalid");
  const language = input.language;
  if (!isRecord(input.context)) return invalid("context is required");
  const context = input.context;
  const allowedContextKeys = new Set([
    "day", "timeSlot", "locationId", "questStatus", "relationship", "memories",
  ]);
  if (Object.keys(context).some((key) => !allowedContextKeys.has(key))) return invalid("context contains unknown fields");
  const locationId = typeof context.locationId === "string" && LOCATIONS.has(context.locationId)
    ? context.locationId
    : null;
  if (!locationId) return invalid("context.locationId is invalid");
  if (!Number.isInteger(context.day) || context.day < 1 || context.day > 3) return invalid("context.day is invalid");
  if (!Number.isInteger(context.timeSlot) || context.timeSlot < 0 || context.timeSlot > 3) return invalid("context.timeSlot is invalid");
  if (!QUEST_STATUSES.has(context.questStatus)) return invalid("context.questStatus is invalid");
  if (!Number.isInteger(context.relationship) || context.relationship < -20 || context.relationship > 20) {
    return invalid("context.relationship is invalid");
  }
  if (!Array.isArray(context.memories) || context.memories.length > 5) return invalid("context.memories must contain at most five strings");
  const memories = [];
  for (const memory of context.memories) {
    if (typeof memory !== "string" || memory.length > 160 || /[\u0000-\u001F\u007F]/u.test(memory)) {
      return invalid("context.memories contains an invalid entry");
    }
    memories.push(memory.trim());
  }
  return {
    ok: true,
    value: {
      requestId,
      stateRevision: input.stateRevision,
      npcId: input.npcId,
      text,
      language,
      context: {
        day: context.day,
        timeSlot: context.timeSlot,
        locationId,
        questStatus: context.questStatus,
        relationship: context.relationship,
        memories,
      },
    },
  };
}

export function parseSemanticResult(input, expected) {
  if (!isRecord(input)) return invalid("semantic result must be an object");
  const allowedKeys = new Set([
    "requestId", "stateRevision", "npcId", "intent", "topicId", "referencedQuestId", "decision", "confidence",
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return invalid("semantic result contains unknown fields");
  if (typeof input.requestId !== "string" || input.requestId !== expected.requestId) return invalid("requestId mismatch");
  if (!Number.isSafeInteger(input.stateRevision) || input.stateRevision !== expected.stateRevision) return invalid("stateRevision mismatch");
  if (typeof input.npcId !== "string" || input.npcId !== expected.npcId) return invalid("npcId mismatch");
  if (!INTENT_SET.has(input.intent)) return invalid("intent is invalid");
  if (input.topicId !== null && !TOPIC_SET.has(input.topicId)) return invalid("topicId is invalid");
  if (input.referencedQuestId !== null && !QUEST_SET.has(input.referencedQuestId)) return invalid("referencedQuestId is invalid");
  if (!DECISION_SET.has(input.decision)) return invalid("decision is invalid");
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    return invalid("confidence is invalid");
  }
  return {
    ok: true,
    value: {
      requestId: input.requestId,
      stateRevision: input.stateRevision,
      npcId: input.npcId,
      intent: input.intent,
      topicId: input.topicId,
      referencedQuestId: input.referencedQuestId,
      decision: input.decision,
      confidence: input.confidence,
    },
  };
}

function topicForText(text) {
  if (/harvest|deliver|delivery|panen|antar|bawa hasil|hasil panen|janji|promise/i.test(text)) return "delivery";
  if (/weather|rain|rainy|cuaca|hujan|wind|angin/i.test(text)) return "weather";
  if (/crop|seed|plant|garden|farm|tanam|kebun|bibit|sayur/i.test(text)) return "crops";
  if (/market|warung|trade|jual|beli|tukar|pasar/i.test(text)) return "market";
  if (/volcano|gunung|mountain|kawah/i.test(text)) return "volcano";
  if (/village|desa|jalan|path|where|di mana|dimana/i.test(text)) return "village";
  if (/friend|neighbor|neighbour|relationship|teman|tetangga/i.test(text)) return "relationship";
  if (/farm|kebun|ladang/i.test(text)) return "farm";
  return null;
}

export function classifyLocally(request) {
  const text = request.text.toLocaleLowerCase("id-ID");
  const topicId = topicForText(text);
  let intent = "other";
  let decision = "out_of_scope";
  let confidence = 0.68;
  let referencedQuestId = null;

  if (/\b(halo|hai|hi|hello|sampurasun|wilujeng)\b/i.test(text)) {
    intent = "greet";
    decision = "supported";
    confidence = 0.94;
  } else if (/\b(maaf|punten|hapunten|sorry|apologize|apologi[sz]e)\b/i.test(text)) {
    intent = "apologize";
    decision = "supported";
    confidence = 0.9;
  } else if (/\b(janji|berjanji|promise|akan (?:bawa|antar|mengantar|membawa)|i(?:'| wi)?ll (?:bring|deliver))\b/i.test(text)) {
    intent = "make_promise";
    decision = topicId === "delivery" ? "supported" : "clarify";
    referencedQuestId = topicId === "delivery" ? "delivery-first-harvest" : null;
    confidence = topicId === "delivery" ? 0.91 : 0.57;
  } else if (/\b(bantu|membantu|tolong|help|lend a hand)\b/i.test(text)) {
    intent = "offer_help";
    decision = "supported";
    confidence = 0.87;
  } else if (/\b(tukar|jual|beli|trade|buy|sell|barter)\b/i.test(text)) {
    intent = "request_trade";
    decision = "supported";
    confidence = 0.88;
  } else if (/\b(apa|siapa|kapan|bagaimana|kenapa|dimana|di mana|what|who|when|how|why|where|tell me|ceritakan)\b/i.test(text) || /\?/.test(text)) {
    intent = "ask_local_information";
    decision = topicId ? "supported" : "clarify";
    confidence = topicId ? 0.82 : 0.58;
  }

  return {
    requestId: request.requestId,
    stateRevision: request.stateRevision,
    npcId: request.npcId,
    intent,
    topicId,
    referencedQuestId,
    decision,
    confidence,
  };
}

export function makeFallbackResult(request) {
  const result = classifyLocally(request);
  const parsed = parseSemanticResult(result, request);
  if (!parsed.ok) throw new Error(`local classifier invariant failed: ${parsed.error}`);
  return parsed.value;
}
