import {
  DECISIONS,
  INTENTS,
  NPC_PROFILES,
  parseSemanticResult,
  QUEST_IDS,
  TOPICS,
} from "./semantic.js";

const NONE = "none";

const CRITERIA_DESCRIPTIONS = Object.freeze({
  greet: "The player greets this neighbor.",
  ask_local_information: "The player asks for information about this village or its immediate surroundings.",
  offer_help: "The player offers practical help.",
  make_promise: "The player clearly commits to a future in-game action.",
  apologize: "The player apologizes for something.",
  request_trade: "The player asks to trade, buy, sell, or barter.",
  other: "The message does not fit another listed intent.",
  village: "The village, paths, or nearby places.",
  farm: "The farm or shared village work.",
  weather: "Weather, rain, or wind.",
  delivery: "The promised first-harvest delivery to the warung.",
  crops: "Seeds, planting, crops, or the garden plots.",
  market: "The warung, market, or trading.",
  volcano: "The volcano or mountain landscape.",
  relationship: "Friendship, neighbors, or the relationship.",
  "delivery-first-harvest": "The one story promise: bring one harvest to Asep’s warung by the end of day three.",
  supported: "The message fits an authored interaction in this small game.",
  clarify: "The message is plausibly in scope but ambiguous; ask for clarification.",
  out_of_scope: "The message asks for something outside this authored village prototype.",
  none: "No single listed topic or quest is referenced.",
});

const QUESTION_SPEC = Object.freeze({
  intent: {
    instructions: "Classify the player's message intent. Choose one exact option. Do not perform actions or write dialogue.",
    options: INTENTS,
  },
  topic: {
    instructions: "Choose the single topic most directly referenced by the player's message, or none if no topic is clear.",
    options: [...TOPICS, NONE],
  },
  referenced_quest: {
    instructions: "Choose the story quest explicitly referenced by the player's message, or none. Do not infer that a quest is completed.",
    options: [...QUEST_IDS, NONE],
  },
  decision: {
    instructions: "Decide whether the message maps to authored village content, needs clarification, or is outside this game's scope.",
    options: DECISIONS,
  },
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record, keys) {
  const actual = Object.keys(record).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function criteriaFor(options) {
  return Object.fromEntries(options.map((option) => [option, CRITERIA_DESCRIPTIONS[option] ?? null]));
}

export function resolveJevConfiguration(env = process.env) {
  return {
    configured: Boolean(env.JEV_API_URL && env.JEV_API_KEY),
    url: env.JEV_API_URL || "",
    key: env.JEV_API_KEY || "",
    protocol: env.JEV_API_PROTOCOL?.trim() || "typesafe-systemone",
    model: env.JEV_MODEL?.trim() || "jev-latest",
    genericAuthHeader: env.JEV_API_AUTH_HEADER?.trim() || "Authorization",
    genericAuthPrefix: env.JEV_API_AUTH_PREFIX === undefined ? "Bearer" : env.JEV_API_AUTH_PREFIX,
  };
}

export function buildTypeSafeRequest(request, model = "jev-latest") {
  const profile = NPC_PROFILES[request.npcId];
  return {
    model,
    state: {
      requestId: request.requestId,
      stateRevision: request.stateRevision,
      message: {
        speakerId: request.npcId,
        text: request.text,
        language: request.language,
      },
      neighbor: {
        name: profile.name,
        hometown: profile.hometown,
        languages: profile.languages,
        preferredLanguage: profile.preferredLanguage,
        style: profile.style,
      },
      village: {
        day: request.context.day,
        timeSlot: request.context.timeSlot,
        locationId: request.context.locationId,
        quest: {
          id: QUEST_IDS[0],
          status: request.context.questStatus,
          dueDay: 3,
        },
      },
    },
    questions: Object.fromEntries(Object.entries(QUESTION_SPEC).map(([id, specification]) => [id, {
      type: "choice",
      instructions: specification.instructions,
      criteria: criteriaFor(specification.options),
    }])),
  };
}

function parseChoiceAnswer(answer, questionId) {
  const options = QUESTION_SPEC[questionId].options;
  const optionSet = new Set(options);
  if (!isRecord(answer) || !hasExactKeys(answer, ["type", "choice", "confidence", "probabilities"])) {
    return { ok: false, error: `answers.${questionId} has an invalid shape` };
  }
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !optionSet.has(answer.choice)) {
    return { ok: false, error: `answers.${questionId}.choice is invalid` };
  }
  if (typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    return { ok: false, error: `answers.${questionId}.confidence is invalid` };
  }
  if (!isRecord(answer.probabilities) || !hasExactKeys(answer.probabilities, options)) {
    return { ok: false, error: `answers.${questionId}.probabilities is invalid` };
  }
  const probabilities = Object.values(answer.probabilities);
  if (probabilities.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
    return { ok: false, error: `answers.${questionId}.probabilities contain invalid values` };
  }
  const probabilityTotal = probabilities.reduce((sum, value) => sum + value, 0);
  if (Math.abs(probabilityTotal - 1) > 0.02) {
    return { ok: false, error: `answers.${questionId}.probabilities do not sum to one` };
  }
  const selectedProbability = answer.probabilities[answer.choice];
  if (selectedProbability + 1e-9 < Math.max(...probabilities)) {
    return { ok: false, error: `answers.${questionId}.choice is not a highest-probability option` };
  }
  return { ok: true, value: answer };
}

export function parseTypeSafeResponse(response, expected) {
  if (!isRecord(response) || !hasExactKeys(response, ["model", "answers", "usage"])) {
    return { ok: false, error: "TypeSafe response has an invalid top-level shape" };
  }
  if (typeof response.model !== "string" || !response.model.trim() || response.model.length > 200) {
    return { ok: false, error: "TypeSafe response model is invalid" };
  }
  if (!isRecord(response.usage)) return { ok: false, error: "TypeSafe response usage is invalid" };
  if (!isRecord(response.answers) || !hasExactKeys(response.answers, Object.keys(QUESTION_SPEC))) {
    return { ok: false, error: "TypeSafe answers are missing or contain unknown questions" };
  }

  const answers = {};
  for (const questionId of Object.keys(QUESTION_SPEC)) {
    const parsed = parseChoiceAnswer(response.answers[questionId], questionId);
    if (!parsed.ok) return parsed;
    answers[questionId] = parsed.value;
  }

  const topicId = answers.topic.choice === NONE ? null : answers.topic.choice;
  const referencedQuestId = answers.referenced_quest.choice === NONE ? null : answers.referenced_quest.choice;
  const internalResult = {
    requestId: expected.requestId,
    stateRevision: expected.stateRevision,
    npcId: expected.npcId,
    intent: answers.intent.choice,
    topicId,
    referencedQuestId,
    decision: answers.decision.choice,
    // Conservative: use the least-certain answer among all four fields because each constrains authored game behavior.
    confidence: Math.min(...Object.values(answers).map((answer) => answer.confidence)),
  };
  return parseSemanticResult(internalResult, expected);
}

export function typeSafeQuestionOptions() {
  return Object.fromEntries(Object.entries(QUESTION_SPEC).map(([id, specification]) => [id, [...specification.options]]));
}
