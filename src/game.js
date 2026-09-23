import {
  applyNpcInterpretation,
  applyPlotAction,
  createGameState,
  deliverHarvest,
  endDay,
  isCurrentSemanticResponse,
  movePlayer,
  parseSavedGame,
  TIME_NAMES,
} from "./game-state.js";
import {
  makeFallbackResult,
  NPC_PROFILES,
  parseInterpretRequest,
  parseSemanticResult,
} from "./semantic.js";
import { createWorld, FEATURES } from "./world.js";

const SAVE_KEY = "lastlight-farm-3d-save-v2";
const CLIENT_TIMEOUT_MS = 5000;
const DIALOGUE = {
  welcome: {
    mira: ["Pagi. The foothill air keeps the soil cool; let’s see what the day gives us.", "Selamat pagi. Udara pegunungan membuat tanah tetap sejuk. Kita lihat hari ini membawa apa."],
  },
  greet: {
    mira: ["Good to see you on the path. The seedlings have been waiting for a little company.", "Senang bertemu lagi di jalan. Bibit-bibit itu menunggu ditemani."],
    asep: ["Halo! The kettle is warm and the road is dry—for now.", "Halo! Air ketel masih hangat dan jalan masih kering—untuk sekarang."],
  },
  "greet-again": {
    mira: ["You found your way back. I saved the quiet side of the porch for you.", "Kamu kembali juga. Aku sisakan tempat yang tenang di beranda."],
    asep: ["Back already? The good tea is still here. I had a feeling you’d return.", "Sudah kembali? Teh yang enak masih ada. Entah kenapa aku merasa kamu akan datang lagi."],
  },
  "ask-local-information": {
    mira: ["The volcanic soil is kind to leafy crops. Give a seed water before dusk, then look again tomorrow.", "Tanah vulkanik cocok untuk sayuran daun. Siram bibit sebelum senja, lalu periksa lagi besok."],
    asep: ["The warung sits where the footpath bends. On a clear afternoon, you can see the ridge from here.", "Warung ada di tikungan jalan setapak. Saat sore cerah, punggung gunung terlihat dari sini."],
  },
  "ask-again": {
    mira: ["The same answer, maybe, but the rain clouds have shifted a little since we last spoke.", "Jawabannya masih sama, mungkin. Tapi awan hujan sudah bergeser sejak kita bicara."],
    asep: ["You ask good questions twice. The mountain is still north; the market is still down the path.", "Pertanyaanmu menarik untuk ditanyakan lagi. Gunung tetap di utara; pasar tetap di ujung jalan."],
  },
  offer_help: {
    mira: ["A pair of hands is welcome. Start with the nearest plot; the soil tells you what it needs.", "Bantuanmu berarti. Mulailah dari petak terdekat; tanah akan menunjukkan kebutuhannya."],
    asep: ["That’s generous. If you grow a little extra, I can make room for it at the warung.", "Baik sekali. Kalau kamu menanam lebih, aku bisa menyediakan tempat di warung."],
  },
  make_promise: {
    mira: ["Then I’ll trust your word. Bring one harvest to Asep before the third day is over.", "Kalau begitu, aku percaya padamu. Antarkan satu hasil panen ke Asep sebelum hari ketiga berakhir."],
    asep: ["A promise travels faster than a cart downhill. I’ll keep a space ready at the warung.", "Janji melaju lebih cepat daripada gerobak menuruni bukit. Akan kusiapkan tempat di warung."],
  },
  "promise-confirmed": {
    mira: ["I’ll remember that. One harvest to Asep’s warung before the third day ends.", "Aku akan mengingatnya. Satu hasil panen ke warung Asep sebelum hari ketiga berakhir."],
    asep: ["Mira tells me you gave your word. I’ll keep a place clear at the counter.", "Mira bilang kamu sudah berjanji. Akan kusiapkan tempat di meja."],
  },
  "promise-already": {
    mira: ["You already gave your word. One harvest at the warung is all it asks.", "Kamu sudah berjanji. Cukup antarkan satu hasil panen ke warung."],
    asep: ["I heard Mira’s plan. I’ll be right here when the harvest is ready.", "Aku sudah dengar rencana Mira. Aku akan di sini saat panenmu siap."],
  },
  "promise-kept": {
    mira: ["You carried it all the way here. I knew I could trust your word.", "Kamu membawanya sampai ke sini. Aku tahu kata-katamu bisa dipercaya."],
    asep: ["Delivered and kept safe. That promise has a place on my shelf now.", "Sudah diterima dan kusimpan baik-baik. Janjimu kini punya tempat di rak warung."],
  },
  "promise-broken": {
    mira: ["The rain came before the harvest. We can speak plainly about that; it still mattered.", "Hujan datang sebelum panen. Kita bisa membicarakannya dengan jujur; itu tetap berarti."],
    asep: ["The season got ahead of us. There’ll be another chance, but this one has passed.", "Musim berjalan lebih cepat. Akan ada kesempatan lain, tapi yang ini sudah lewat."],
  },
  apologize: {
    mira: ["Thank you for saying so. We can start with the next small thing.", "Terima kasih sudah mengatakannya. Kita mulai lagi dari hal kecil berikutnya."],
    asep: ["It’s all right. The road is long enough to make room for another try.", "Tidak apa-apa. Jalan ini cukup panjang untuk memberi ruang pada kesempatan berikutnya."],
  },
  request_trade: {
    mira: ["I keep seeds, not a stall. Asep knows the market better than I do.", "Aku menyimpan benih, bukan membuka kios. Asep lebih paham pasar."],
    asep: ["We can talk trade at the counter, but I won’t take what you need for the promise.", "Kita bisa bicara soal tukar-menukar di meja, tapi aku tak akan mengambil yang kamu perlukan untuk janji itu."],
  },
  clarify: {
    mira: ["I’m not sure which part you mean. Ask me about the farm, the weather, or the delivery.", "Aku belum yakin maksudmu. Tanyakan tentang kebun, cuaca, atau pengantaran."],
    asep: ["Could you say a little more? I know the village, the warung, and the path up the hill.", "Bisa ceritakan sedikit lagi? Aku tahu desa ini, warung, dan jalan ke atas bukit."],
  },
  "out-of-scope": {
    mira: ["I can’t help with that from here. The soil and sky are simpler company.", "Aku tak bisa membantu soal itu. Tanah dan langit lebih sederhana untuk ditemani."],
    asep: ["That one’s outside my little warung. Tell me about the village instead.", "Itu di luar urusan warung kecilku. Ceritakan tentang desa ini saja."],
  },
  "ask-again-weather": {
    mira: ["The wind is turning south. I’d water early today and keep an eye on the ridge.", "Angin mulai berembus dari selatan. Sebaiknya siram lebih pagi dan perhatikan punggung gunung."],
    asep: ["The clouds are gathering over the ridge. I’ll bring the tea inside if it starts to rain.", "Awan berkumpul di atas punggung gunung. Akan kubawa teh ke dalam kalau hujan mulai turun."],
  },
};

const ACTION_LABELS = {
  plant: "Plant a seed",
  water: "Water the seedling",
  harvest: "Harvest the crop",
};
const FEATURE_LOCATIONS = {
  farmhouse: { x: -19.8, z: -4.84 },
  mira: { x: -15.84, z: .55 },
  asep: { x: 17.71, z: -1.54 },
  warung: { x: 20.02, z: 3.74 },
  path: { x: 0, z: 17.6 },
  "plot-1": { x: -12.76, z: -9.24 },
  "plot-2": { x: -7.7, z: -9.24 },
  "plot-3": { x: -2.64, z: -9.24 },
  "plot-4": { x: 2.42, z: -9.24 },
  "plot-5": { x: 7.48, z: -9.24 },
  "plot-6": { x: 12.54, z: -9.24 },
};

const elements = {
  canvas: document.getElementById("gameCanvas"),
  renderState: document.getElementById("renderState"),
  dayValue: document.getElementById("dayValue"),
  timeValue: document.getElementById("timeValue"),
  worldTime: document.getElementById("worldTime"),
  providerStatus: document.getElementById("providerStatus"),
  providerStatusText: document.querySelector("#providerStatus span"),
  nearbyPrompt: document.getElementById("nearbyPrompt"),
  nearbyPromptText: document.getElementById("nearbyPromptText"),
  nearbyTitle: document.getElementById("nearbyTitle"),
  nearbyDescription: document.getElementById("nearbyDescription"),
  interactionActions: document.getElementById("interactionActions"),
  questStatus: document.getElementById("questStatus"),
  questDescription: document.getElementById("questDescription"),
  questProgressFill: document.getElementById("questProgressFill"),
  questFootText: document.getElementById("questFootText"),
  harvestCount: document.getElementById("harvestCount"),
  seedCount: document.getElementById("seedCount"),
  harvestInventory: document.getElementById("harvestInventory"),
  memoryCount: document.getElementById("memoryCount"),
  endDayButton: document.getElementById("endDayButton"),
  dayActionHint: document.getElementById("dayActionHint"),
  neighborMira: document.getElementById("neighborMira"),
  neighborAsep: document.getElementById("neighborAsep"),
  conversationDialog: document.getElementById("conversationDialog"),
  conversationTitle: document.getElementById("conversationTitle"),
  speakerHometown: document.getElementById("speakerHometown"),
  speakerStyle: document.getElementById("speakerStyle"),
  speakerMark: document.getElementById("speakerMark"),
  languageSelect: document.getElementById("languageSelect"),
  conversationTranscript: document.getElementById("conversationTranscript"),
  conversationForm: document.getElementById("conversationForm"),
  conversationInput: document.getElementById("conversationInput"),
  sendMessageButton: document.getElementById("sendMessageButton"),
  conversationFeedback: document.getElementById("conversationFeedback"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  beginButton: document.getElementById("beginButton"),
  endingScreen: document.getElementById("endingScreen"),
  endingTitle: document.getElementById("endingTitle"),
  endingText: document.getElementById("endingText"),
  endingDetail: document.getElementById("endingDetail"),
  toast: document.getElementById("toast"),
  textNavigation: document.getElementById("textNavigation"),
  journalDialog: document.getElementById("journalDialog"),
  journalLog: document.getElementById("journalLog"),
  journalQuestCopy: document.getElementById("journalQuestCopy"),
  menuPanel: document.getElementById("menuPanel"),
};

let stored = null;
try {
  stored = parseSavedGame(window.localStorage.getItem(SAVE_KEY));
} catch (error) {
  stored = null;
}
let state = stored || createGameState();
let world = null;
let worldReady = false;
let accessibleMovement = false;
let currentFeature = null;
let currentNpc = null;
let currentLanguage = "id";
let requestInFlight = null;
let generation = 0;
let toastTimeout = null;
let saveTimeout = null;
let proximityTimeout = 0;
let lastProximityId = "";
const keyMovement = new Set();
const touchMovement = new Set();

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: 2 }));
  } catch (error) {
    showToast("This browser can’t save locally. The story will last until you close this tab.");
  }
}

function saveMovementSoon() {
  if (saveTimeout) window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(saveGame, 700);
}

function setProviderStatus(kind, message) {
  elements.providerStatus.classList.toggle("is-offline", kind === "offline");
  elements.providerStatus.classList.toggle("is-error", kind === "error");
  elements.providerStatusText.textContent = message;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => { elements.toast.hidden = true; }, 2700);
}

function profileFor(npcId) {
  return NPC_PROFILES[npcId] || NPC_PROFILES.mira;
}

function inConversation() {
  return elements.conversationDialog.open;
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]")) || !elements.menuPanel.hidden;
}

function gameLine(npcId, dialogue, language) {
  const lineId = dialogue.lineId || dialogue.key;
  let chosen = dialogue.key;
  if (lineId.startsWith("ask-again-weather")) chosen = "ask-again-weather";
  else if (lineId.startsWith("ask-again")) chosen = "ask-again";
  else if (lineId === "greet-again") chosen = "greet-again";
  else if (!DIALOGUE[lineId]) chosen = dialogue.key;
  const pair = DIALOGUE[chosen]?.[npcId] || DIALOGUE["out-of-scope"][npcId];
  return pair[language === "en" ? 0 : 1];
}

function setLineForCurrentState() {
  const last = state.lastDialogue;
  const speech = gameLine(last.speakerId, { key: last.key, lineId: last.lineId }, currentLanguage);
  last.line = speech;
  if (state.ended) return;
}

function appendMessage(type, speaker, text) {
  const message = document.createElement("p");
  message.className = `chat-message ${type}`;
  const label = document.createElement("small");
  label.textContent = speaker;
  const body = document.createElement("span");
  body.textContent = text;
  message.append(label, body);
  elements.conversationTranscript.append(message);
  elements.conversationTranscript.scrollTop = elements.conversationTranscript.scrollHeight;
  return message;
}

function resetTranscript(npcId) {
  elements.conversationTranscript.replaceChildren();
  const last = state.lastDialogue;
  if (last.speakerId === npcId && last.line) {
    appendMessage("npc", profileFor(npcId).name, last.line);
  } else {
    const note = document.createElement("p");
    note.className = "system-line";
    note.textContent = "A quiet moment opens between you.";
    elements.conversationTranscript.append(note);
  }
}

function getLocationId(feature) {
  if (!feature) return "path";
  if (feature.kind === "npc") return feature.id;
  return feature.id;
}

function currentQuestStatus() {
  return state.promise.status;
}

function makeRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `farm_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function currentRange(feature) {
  if (!feature) return false;
  const dx = state.player.x - feature.x;
  const dz = state.player.z - feature.z;
  return Math.hypot(dx, dz) <= feature.radius;
}

function nearestWorldFeature() {
  let nearest = null;
  let distance = Infinity;
  for (const feature of FEATURES) {
    const current = Math.hypot(state.player.x - feature.x, state.player.z - feature.z);
    if (current <= feature.radius && current < distance) {
      nearest = feature;
      distance = current;
    }
  }
  return nearest;
}

function setStatusText(feature) {
  currentFeature = feature;
  const promptLabel = feature?.kind === "npc"
    ? `Talk with ${profileFor(feature.id).name}`
    : feature?.kind === "plot"
      ? `${feature.id.replace("-", " ")} · choose a crop action`
      : feature?.kind === "warung"
        ? state.promise.status === "promised" && state.inventory.harvest > 0 ? "Deliver your promised harvest" : "Visit Asep’s warung"
        : "";
  elements.nearbyPrompt.hidden = !feature || !state.started || state.ended;
  elements.nearbyPromptText.textContent = promptLabel;
  elements.neighborMira.classList.toggle("is-near", Boolean(feature?.id === "mira"));
  elements.neighborAsep.classList.toggle("is-near", Boolean(feature?.id === "asep"));
  elements.neighborMira.querySelector(".neighbor-range").setAttribute("aria-label", feature?.id === "mira" ? "Nearby" : "Not nearby");
  elements.neighborAsep.querySelector(".neighbor-range").setAttribute("aria-label", feature?.id === "asep" ? "Nearby" : "Not nearby");
  if (lastProximityId === (feature?.id || "")) return;
  lastProximityId = feature?.id || "";
  renderNearbyActions();
}

function actionButton(label, detail, callback, disabled = false, subtle = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `interaction-button${subtle ? " subtle" : ""}`;
  button.disabled = disabled;
  const text = document.createElement("span");
  text.textContent = label;
  const suffix = document.createElement("span");
  suffix.className = disabled ? "action-cost" : "";
  suffix.textContent = detail;
  button.append(text, suffix);
  button.addEventListener("click", callback);
  elements.interactionActions.append(button);
}

function renderNearbyActions() {
  elements.interactionActions.replaceChildren();
  if (!currentFeature || !currentRange(currentFeature)) {
    elements.nearbyTitle.textContent = "Walk a little closer";
    elements.nearbyDescription.textContent = "The path curves between the plots and the warung. People and places come into reach as you walk.";
    return;
  }
  if (currentFeature.kind === "npc") {
    const profile = profileFor(currentFeature.id);
    elements.nearbyTitle.textContent = `${profile.name} is nearby`;
    elements.nearbyDescription.textContent = `${profile.hometown} · ${profile.style}`;
    actionButton(`Talk with ${profile.name}`, "E", () => openConversation(profile.id));
    return;
  }
  if (currentFeature.kind === "plot") {
    const plot = state.plots.find((item) => item.id === currentFeature.id);
    const names = { empty: "Bare and ready for a seed", seedling: plot.wateredDay === state.day ? "Watered today · wait for tomorrow" : "Seedling needs water", ready: "The crop is ready to harvest" };
    elements.nearbyTitle.textContent = `${currentFeature.id.replace("-", " ")} · ${plot.stage}`;
    elements.nearbyDescription.textContent = names[plot.stage];
    const choices = ["plant", "water", "harvest"];
    choices.forEach((verb) => {
      let disabled = state.ended;
      let reason = "1 turn";
      if (verb === "plant" && plot.stage !== "empty") { disabled = true; reason = "already growing"; }
      if (verb === "plant" && state.inventory.seeds < 1) { disabled = true; reason = "no seeds"; }
      if (verb === "water" && plot.stage !== "seedling") { disabled = true; reason = "not planted"; }
      if (verb === "water" && plot.wateredDay === state.day) { disabled = true; reason = "watered today"; }
      if (verb === "harvest" && plot.stage !== "ready") { disabled = true; reason = "not ready"; }
      actionButton(ACTION_LABELS[verb], disabled ? reason : "1 turn", () => commitPlotAction(plot.id, verb), disabled, disabled);
    });
    return;
  }
  elements.nearbyTitle.textContent = "Asep’s warung";
  elements.nearbyDescription.textContent = "A timber counter faces the path. Asep keeps the kettle warm and a place clear for the harvest.";
  if (state.promise.status === "promised" && state.inventory.harvest > 0) {
    actionButton("Deliver one harvest", "keep promise", () => commitDelivery(), false);
  } else if (state.promise.status === "promised") {
    actionButton("Deliver one harvest", "need a crop", () => commitDelivery(), true, true);
  } else if (state.promise.status === "kept") {
    actionButton("Promise kept", "thank you", () => showToast("Asep already received the promised harvest."), true, true);
  }
  actionButton("Talk with Asep", "E", () => openConversation("asep"), false, true);
}

function renderHud() {
  elements.dayValue.textContent = `${state.day} / 3`;
  elements.timeValue.textContent = TIME_NAMES[state.timeSlot];
  elements.worldTime.textContent = TIME_NAMES[state.timeSlot];
  elements.seedCount.textContent = String(state.inventory.seeds);
  elements.harvestInventory.textContent = String(state.inventory.harvest);
  elements.harvestCount.textContent = `${state.promise.status === "kept" ? 1 : 0} / 1 harvest`;
  elements.memoryCount.textContent = String(state.memories.mira.length + state.memories.asep.length);
  elements.questStatus.textContent = ({ offered: "Offered", promised: "Promised", kept: "Kept", broken: "Missed" })[state.promise.status];
  elements.questStatus.classList.toggle("is-kept", state.promise.status === "kept");
  elements.questStatus.classList.toggle("is-broken", state.promise.status === "broken");
  elements.questDescription.textContent = ({
    offered: "Promise Mira you’ll bring one harvest to Asep’s warung before the third day ends.",
    promised: `You gave your word on day ${state.promise.promisedDay}. Bring one harvest to the warung before dusk on day 3.`,
    kept: "You brought the first harvest to Asep’s warung. Mira remembers a promise kept.",
    broken: "The third day ended before the harvest arrived. The promise is recorded as missed.",
  })[state.promise.status];
  elements.journalQuestCopy.textContent = elements.questDescription.textContent;
  elements.journalLog.replaceChildren(...state.eventLog.slice(-12).map((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    return item;
  }));
  const progress = state.promise.status === "kept" ? 100 : state.promise.status === "promised" && state.inventory.harvest > 0 ? 62 : 0;
  elements.questProgressFill.style.width = `${progress}%`;
  elements.questFootText.textContent = state.promise.status === "kept" ? "Delivered on time" : state.promise.status === "broken" ? "The third day has passed" : `Due by day ${state.promise.dueDay}`;
  elements.endDayButton.disabled = state.ended || Boolean(requestInFlight);
  elements.dayActionHint.textContent = state.ended ? "The three-day visit has ended." : "A conversation, a crop action, or delivery moves time along.";
  if (world) world.applyPlotState(state);
  renderNearbyActions();
  if (world) world.setTimeMood(state.timeSlot);
}

function finishGameIfNeeded() {
  if (!state.ended) {
    elements.endingScreen.hidden = true;
    return;
  }
  elements.endingScreen.hidden = false;
  let title = "A path left open";
  let text = "The mountain path stays in your mind, and the next season is left unwritten.";
  let detail = "A short visit can still leave a lasting shape.";
  if (state.promise.status === "kept") {
    title = "A Promise in Good Hands";
    text = "Asep’s shelf has room for the first harvest, and Mira knows she can trust your word.";
    detail = `You kept the promise on day ${state.day}. ${state.memories.mira.length + state.memories.asep.length} moments joined the village story.`;
  } else if (state.promise.status === "broken") {
    title = "The Season Moved Quickly";
    text = "Not every promise made it through the rain. Still, the village remembers the care you did give.";
    detail = `${state.inventory.harvest} harvest remained in your satchel. The next visit could take a different path.`;
  } else if (state.plots.some((plot) => plot.stage === "ready")) {
    title = "Green Things, Tomorrow";
    text = "A few plots are ready, and the foothills have started to feel like somewhere you might return.";
    detail = `${state.inventory.harvest} harvest collected · ${state.memories.mira.length + state.memories.asep.length} shared moments.`;
  } else if (state.memories.mira.length + state.memories.asep.length >= 2) {
    title = "Neighbors Along the Path";
    text = "The warung kettle cools, but you leave with two new names in your memory.";
    detail = "Some journeys are measured by who recognizes your footsteps.";
  }
  elements.endingTitle.textContent = title;
  elements.endingText.textContent = text;
  elements.endingDetail.textContent = detail;
}

function renderAll() {
  renderHud();
  finishGameIfNeeded();
}

function profileStyle(profile) {
  return `${profile.style} Languages listed: ${profile.languages.join(", ")}.`;
}

function openConversation(npcId) {
  if (!state.started || state.ended || requestInFlight || !["mira", "asep"].includes(npcId)) return;
  const feature = FEATURES.find((item) => item.id === npcId);
  if (!feature || !currentRange(feature)) {
    showToast("Move closer before starting a conversation.");
    return;
  }
  currentNpc = npcId;
  const profile = profileFor(npcId);
  currentLanguage = profile.preferredLanguage;
  elements.languageSelect.value = currentLanguage;
  elements.speakerMark.textContent = profile.name[0];
  elements.conversationTitle.textContent = `Talk with ${profile.name}`;
  elements.speakerHometown.textContent = profile.hometown;
  elements.speakerStyle.textContent = profileStyle(profile);
  elements.conversationFeedback.textContent = currentLanguage === "su"
    ? "Sundanese is listed in Asep’s profile; Sundanese lines are not yet authored, so subtitles use Indonesian."
    : "Jev interprets meaning; optional OpenAI dialogue voices the reply. Authored fallback keeps play available.";
  elements.conversationFeedback.className = "conversation-feedback";
  resetTranscript(npcId);
  if (!elements.conversationDialog.open) elements.conversationDialog.showModal();
  elements.conversationInput.focus();
}

function requestContext(npcId) {
  return {
    day: state.day,
    timeSlot: state.timeSlot,
    locationId: npcId,
    questStatus: currentQuestStatus(),
    relationship: state.relationships[npcId],
    memories: state.memories[npcId].slice(-5).map((memory) => memory.slice(0, 160)),
  };
}

function updateProviderFeedback(envelope) {
  const semanticLabel = envelope.semanticProvider === "jev-adapter" ? "Jev interpretation" : "local interpretation";
  const dialogueLabel = envelope.dialogueProvider === "openai" ? "OpenAI dialogue" : "authored fallback";
  const remoteUsed = envelope.semanticProvider === "jev-adapter" || envelope.dialogueProvider === "openai";
  setProviderStatus(remoteUsed ? "online" : "offline", `${semanticLabel} · ${dialogueLabel}`);
  const reasons = [envelope.semanticFallbackReason, envelope.dialogueFallbackReason].filter(Boolean);
  elements.conversationFeedback.textContent = `${semanticLabel} · ${dialogueLabel}${reasons.length ? ` (${reasons.join("; ")})` : ""}.`;
  elements.conversationFeedback.className = reasons.length ? "conversation-feedback is-warning" : "conversation-feedback";
}

function parseGeneratedDialogue(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 320 || /[\u0000-\u001F\u007F]/u.test(text)) return null;
  if (/[`*_]/u.test(text) || /(?:^|\s)(?:#{1,6}\s|>\s|[-+]\s|\d+\.\s)/u.test(text) || /\[[^\]]+\]\([^)]+\)/u.test(text)) return null;
  if ((text.match(/[.!?…]+(?=\s|$)/gu) || []).length > 2) return null;
  return text.replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() || null;
}

async function fetchInterpretation(request) {
  if (typeof window.fetch !== "function" || window.location.protocol === "file:") {
    return {
      semanticProvider: "local-fallback",
      semanticFallbackReason: "local-server-not-running",
      dialogueProvider: "authored-fallback",
      dialogueFallbackReason: "dialogue-server-not-running",
      generatedDialogue: null,
      result: makeFallbackResult(request),
    };
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await window.fetch("/api/npc/interpret", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || `server-${response.status}`);
    const parsed = parseSemanticResult(data.result, request);
    if (!parsed.ok) throw new Error("invalid-response");
    const generatedDialogue = data.dialogueProvider === "openai" ? parseGeneratedDialogue(data.generatedDialogue) : null;
    const dialogueProvider = generatedDialogue ? data.dialogueProvider : "authored-fallback";
    return {
      semanticProvider: data.semanticProvider === "jev-adapter" ? "jev-adapter" : "local-fallback",
      semanticFallbackReason: data.semanticFallbackReason || null,
      dialogueProvider,
      dialogueFallbackReason: generatedDialogue ? null : (data.dialogueFallbackReason || (data.dialogueProvider === "openai" ? "dialogue-invalid-response" : null)),
      generatedDialogue,
      result: parsed.value,
    };
  } catch (error) {
    const reason = error.name === "AbortError" ? "request-timeout" : "backend-unavailable-or-invalid";
    const result = makeFallbackResult(request);
    return {
      semanticProvider: "local-fallback",
      semanticFallbackReason: reason,
      dialogueProvider: "authored-fallback",
      dialogueFallbackReason: reason,
      generatedDialogue: null,
      result,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function setBusy(isBusy) {
  elements.sendMessageButton.disabled = isBusy;
  elements.sendMessageButton.setAttribute("aria-busy", String(isBusy));
  elements.conversationInput.disabled = isBusy;
  elements.endDayButton.disabled = isBusy || state.ended;
  if (isBusy) elements.conversationFeedback.textContent = "Listening for meaning…";
}

async function submitConversation(text) {
  if (!currentNpc || requestInFlight || !inConversation()) return;
  const cleanText = text.trim();
  if (!cleanText) return;
  const feature = FEATURES.find((item) => item.id === currentNpc);
  if (!feature || !currentRange(feature)) {
    elements.conversationFeedback.textContent = "You moved out of reach. Come closer before sending that message.";
    elements.conversationFeedback.className = "conversation-feedback is-error";
    return;
  }
  const requestRaw = {
    requestId: makeRequestId(),
    stateRevision: state.revision,
    npcId: currentNpc,
    text: cleanText,
    language: elements.languageSelect.value,
    context: requestContext(currentNpc),
  };
  const parsedRequest = parseInterpretRequest(requestRaw);
  if (!parsedRequest.ok) {
    elements.conversationFeedback.textContent = `Message could not be read: ${parsedRequest.error}.`;
    elements.conversationFeedback.className = "conversation-feedback is-error";
    return;
  }
  const request = parsedRequest.value;
  const requestGeneration = generation;
  requestInFlight = request.requestId;
  appendMessage("player", "You", cleanText);
  elements.conversationInput.value = "";
  setBusy(true);
  const envelope = await fetchInterpretation(request);
  if (generation !== requestGeneration || requestInFlight !== request.requestId || !isCurrentSemanticResponse(state, request, envelope.result)) {
    if (requestInFlight === request.requestId) requestInFlight = null;
    setBusy(false);
    elements.conversationFeedback.textContent = "That reply arrived after the village had changed; it was ignored. Please try again.";
    elements.conversationFeedback.className = "conversation-feedback is-warning";
    renderAll();
    return;
  }
  updateProviderFeedback(envelope);
  const committed = applyNpcInterpretation(state, request, envelope.result, { inRange: currentRange(feature) });
  requestInFlight = null;
  setBusy(false);
  if (!committed.ok) {
    elements.conversationFeedback.textContent = committed.reason === "out-of-range" ? "Move closer and try again." : "That interpretation was stale and did not change the story.";
    elements.conversationFeedback.className = "conversation-feedback is-warning";
    return;
  }
  state = committed.state;
  const fallbackLanguage = elements.languageSelect.value === "su" ? "id" : elements.languageSelect.value;
  const line = envelope.generatedDialogue || gameLine(currentNpc, committed.dialogue, fallbackLanguage);
  state.lastDialogue.line = line;
  state.lastDialogue.key = committed.dialogue.key;
  state.lastDialogue.lineId = committed.dialogue.lineId;
  appendMessage("npc", profileFor(currentNpc).name, line);
  saveGame();
  renderAll();
  if (committed.state.promise.status === "promised" && committed.state.promise.promisedDay === committed.state.day && committed.state.lastDialogue.promiseChanged) {
    showToast("Promise recorded · deliver one harvest to the warung before day 3 ends.");
  }
}

function openPlotAction(plotId, action) {
  const feature = FEATURES.find((item) => item.id === plotId);
  if (!feature || !currentRange(feature)) {
    showToast("Move within reach of the plot first.");
    return;
  }
  const result = applyPlotAction(state, { plotId, action, inRange: true });
  if (!result.ok) {
    showToast(({ "not-ready": "The crop needs another day after watering.", "no-seeds": "No seeds remain in your satchel.", "already-watered": "You already watered this plot today.", "not-growing": "Plant a seed before watering.", "plot-not-empty": "Harvest this plot before planting again." })[result.reason] || "That crop action isn’t available yet.");
    return;
  }
  state = result.state;
  saveGame();
  renderAll();
  if (state.ended) finishGameIfNeeded();
  showToast(({ plant: "A seed rests in the cool volcanic soil.", water: "The seedling is watered; check again tomorrow.", harvest: "One crop added to your satchel." })[action]);
}

function commitPlotAction(plotId, action) {
  if (state.ended || requestInFlight) return;
  openPlotAction(plotId, action);
}

function commitDelivery() {
  const feature = FEATURES.find((item) => item.id === "warung");
  if (!feature || !currentRange(feature)) {
    showToast("Carry the harvest to Asep’s warung first.");
    return;
  }
  const result = deliverHarvest(state, { inRange: true });
  if (!result.ok) {
    showToast(result.reason === "no-harvest" ? "Harvest a ready crop before delivery." : "There is no active delivery promise.");
    return;
  }
  state = result.state;
  saveGame();
  renderAll();
  showToast("Delivery made · promise kept.");
}

function finishDay() {
  if (requestInFlight || state.ended) return;
  const result = endDay(state);
  if (!result.ok) return;
  state = result.state;
  saveGame();
  renderAll();
  if (state.ended) {
    showToast("The last light settles over the village.");
  } else {
    showToast(`Day ${state.day} · ${TIME_NAMES[state.timeSlot]} in the foothills.`);
  }
}

function activateFeature(feature = currentFeature) {
  if (!feature || !currentRange(feature) || !state.started || state.ended) return;
  if (feature.kind === "npc") {
    openConversation(feature.id);
  } else if (feature.kind === "plot") {
    const plot = state.plots.find((item) => item.id === feature.id);
    if (plot.stage === "empty") commitPlotAction(feature.id, "plant");
    else if (plot.stage === "seedling") commitPlotAction(feature.id, "water");
    else commitPlotAction(feature.id, "harvest");
  } else if (feature.kind === "warung") {
    if (state.promise.status === "promised" && state.inventory.harvest > 0) commitDelivery();
    else openConversation("asep");
  }
}

function setAccessibleDestination(destination) {
  const target = FEATURE_LOCATIONS[destination];
  if (!target) return;
  accessibleMovement = true;
  state = movePlayer(state, { x: target.x, z: target.z + (destination.startsWith("plot") ? 1.8 : 1.55) });
  saveGame();
  setStatusText(nearestWorldFeature());
  showToast(`Moved to ${destination.replace("-", " ")} using the text map.`);
}

function resetStory() {
  if (!window.confirm("Reset this three-day story and clear its local save?")) return;
  generation += 1;
  requestInFlight = null;
  state = createGameState();
  saveGame();
  if (world) world.setPlayerPosition(state.player.x, state.player.z);
  elements.welcomeScreen.hidden = false;
  elements.endingScreen.hidden = true;
  if (inConversation()) elements.conversationDialog.close();
  setStatusText(null);
  renderAll();
}

function closeDialogFromButton(button) {
  const dialog = button.closest("dialog");
  if (dialog?.open) dialog.close();
}

function checkProviderHealth() {
  if (typeof window.fetch !== "function") {
    setProviderStatus("offline", "Local interpretation · authored dialogue");
    return;
  }
  window.fetch("/api/health", { credentials: "same-origin" })
    .then((response) => response.json())
    .then((health) => {
      const semantic = health.semanticProviderAvailable ? "Jev interpretation" : "local interpretation";
      const dialogue = health.dialogueProviderAvailable ? "OpenAI dialogue" : "authored fallback";
      setProviderStatus(health.semanticProviderAvailable || health.dialogueProviderAvailable ? "online" : "offline", `${semantic} · ${dialogue}`);
    })
    .catch(() => setProviderStatus("offline", "Local interpretation · authored dialogue"));
}

function movementVector() {
  const keys = new Set([...keyMovement, ...touchMovement]);
  let x = 0;
  let z = 0;
  if (keys.has("left")) x -= 1;
  if (keys.has("right")) x += 1;
  if (keys.has("forward")) z -= 1;
  if (keys.has("back")) z += 1;
  return { x, z };
}

function keyToDirection(key) {
  const normalized = key.toLowerCase();
  return ({ w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right" })[normalized] || null;
}

function installControls() {
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLElement && /input|select|textarea/i.test(event.target.tagName)) return;
    const direction = keyToDirection(event.key);
    if (direction && !hasOpenDialog() && elements.welcomeScreen.hidden && !state.ended) {
      event.preventDefault();
      keyMovement.add(direction);
      return;
    }
    if ((event.key === "e" || event.key === "E") && !event.repeat && !hasOpenDialog() && elements.welcomeScreen.hidden && !state.ended) {
      event.preventDefault();
      activateFeature();
    }
  });
  window.addEventListener("keyup", (event) => {
    const direction = keyToDirection(event.key);
    if (direction) keyMovement.delete(direction);
  });
  window.addEventListener("blur", () => { keyMovement.clear(); touchMovement.clear(); });
  document.querySelectorAll(".touch-pad [data-move]").forEach((button) => {
    const direction = button.dataset.move;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchMovement.add(direction);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => button.addEventListener(name, () => touchMovement.delete(direction)));
  });
  document.querySelectorAll("[data-suggest]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.conversationInput.value = button.dataset.suggest;
      elements.conversationInput.focus();
    });
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialogFromButton(button)));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  elements.conversationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitConversation(elements.conversationInput.value);
  });
  elements.languageSelect.addEventListener("change", () => {
    currentLanguage = elements.languageSelect.value;
    elements.conversationFeedback.textContent = currentLanguage === "su"
      ? "Sundanese is listed in Asep’s profile; Sundanese lines are not yet authored, so subtitles use Indonesian."
      : "Messages are interpreted from text; they are never sent directly as generated dialogue.";
  });
  document.getElementById("beginButton").addEventListener("click", () => {
    state.started = true;
    state.revision += 1;
    saveGame();
    elements.welcomeScreen.hidden = true;
    renderAll();
    elements.canvas.focus();
  });
  elements.endDayButton.addEventListener("click", finishDay);
  document.getElementById("resetButton").addEventListener("click", resetStory);
  document.getElementById("endingResetButton").addEventListener("click", resetStory);
  document.getElementById("journalButton").addEventListener("click", () => elements.journalDialog.showModal());
  document.getElementById("menuButton").addEventListener("click", (event) => {
    const button = event.currentTarget;
    elements.menuPanel.hidden = !elements.menuPanel.hidden;
    button.setAttribute("aria-expanded", String(!elements.menuPanel.hidden));
  });
  document.getElementById("helpButton").addEventListener("click", () => {
    elements.menuPanel.hidden = true;
    document.getElementById("menuButton").setAttribute("aria-expanded", "false");
    document.getElementById("helpDialog").showModal();
  });
  document.getElementById("aboutButton").addEventListener("click", () => {
    elements.menuPanel.hidden = true;
    document.getElementById("menuButton").setAttribute("aria-expanded", "false");
    document.getElementById("aboutDialog").showModal();
  });
  document.getElementById("aboutControlsButton").addEventListener("click", () => {
    document.getElementById("aboutDialog").close();
    document.getElementById("helpDialog").showModal();
  });
  elements.textNavigation.querySelectorAll("[data-destination]").forEach((button) => button.addEventListener("click", () => setAccessibleDestination(button.dataset.destination)));
}

function showRenderError(error) {
  worldReady = false;
  accessibleMovement = true;
  elements.renderState.classList.add("is-error");
  const strong = elements.renderState.querySelector("strong");
  const detail = elements.renderState.querySelector("span:last-child");
  strong.textContent = error.code === "WEBGL_UNSUPPORTED" ? "3D rendering isn’t available here." : "The village scene could not start.";
  detail.textContent = `${error.message || "Unknown rendering error."} The text map below still lets you reach people, crops, and the warung.`;
  elements.textNavigation.hidden = false;
}

function initializeWorld() {
  try {
    world = createWorld(elements.canvas, state);
    worldReady = true;
    elements.renderState.hidden = true;
    elements.canvas.setAttribute("tabindex", "0");
    world.engine.runRenderLoop(() => {
      const delta = world.engine.getDeltaTime() / 1000;
      const overlaysBlockPlay = hasOpenDialog() || !elements.welcomeScreen.hidden || !state.started || state.ended;
      if (overlaysBlockPlay) {
        keyMovement.clear();
        touchMovement.clear();
      }
      if (!overlaysBlockPlay) {
        const movement = movementVector();
        world.update(delta, movement);
        if (movement.x || movement.z) {
          state.player = { x: world.player.position.x, z: world.player.position.z };
          saveMovementSoon();
        }
      }
      world.render();
      proximityTimeout += delta;
      if (proximityTimeout > .12) {
        proximityTimeout = 0;
        setStatusText(nearestWorldFeature());
      }
    });
    window.addEventListener("resize", () => world?.engine.resize());
  } catch (error) {
    showRenderError(error);
  }
}

function initialize() {
  installControls();
  checkProviderHealth();
  if (stored?.started) elements.welcomeScreen.hidden = true;
  if (state.ended) {
    elements.welcomeScreen.hidden = true;
    elements.endingScreen.hidden = false;
  }
  setLineForCurrentState();
  initializeWorld();
  renderAll();
  setStatusText(nearestWorldFeature());
  window.addEventListener("pagehide", () => {
    saveGame();
    world?.dispose();
  }, { once: true });
}

initialize();
