(() => {
  "use strict";

  const SAVE_VERSION = 1;
  const SAVE_KEY = "lastlight-farm-save-v1";
  const TEMP_SAVE_KEY = "lastlight-farm-save-v1.pending";
  const MAX_DAYS = 7;
  const MAX_ENERGY = 3;
  const MAX_GREENHOUSE_PROGRESS = 5;

  const LOCATION_DATA = {
    mira: {
      kicker: "Near the warm window",
      title: "Cottage & Mira",
      description: "The cottage porch holds a single lantern. Mira is sorting seed packets beside it.",
      hint: "Choose an activity. Moving between places costs nothing.",
      caption: "Mira is close enough to hear the garden gate.",
    },
    garden: {
      kicker: "Rows silvered with dew",
      title: "Moon Garden",
      description: "The vegetables are small but stubborn, and the night air smells of mint and wet soil.",
      hint: "Care makes a little food and a little warmth.",
      caption: "The garden gives back slowly, if you stay with it.",
    },
    woodland: {
      kicker: "Beyond the low stone wall",
      title: "Woodland",
      description: "Pine shadows fold around a narrow path. Fallen branches wait beneath the ferns.",
      hint: "Foraging finds timber, and sometimes a moonflower for the porch.",
      caption: "The dark between trees is quieter than it looks.",
    },
    greenhouse: {
      kicker: "Glass, moonlight, and a loose frame",
      title: "Broken Greenhouse",
      description: "The glasshouse is still broken; its roofline catches the moon like a missing tooth.",
      hint: "Bring timber from the woodland to set one brace.",
      caption: "The painted scene stays broken; progress is recorded in words below.",
    },
  };

  const MEMORY_TEXT = {
    "mira-first-visit": "You sat beside Mira instead of asking what needed fixing.",
    "mira-shared-lantern": "Mira moved the lantern so its light reached both of you.",
    "mira-lantern-again": "The two of you let a comfortable silence do some of the talking.",
    "note-left": "A moonflower note waited beneath Mira’s seed tin.",
    "note-returned": "Mira answered your note with a pressed leaf and no explanation.",
    "garden-first-care": "You learned which garden rows wake when the moon is high.",
    "garden-rhythm": "Your hands found the garden’s evening rhythm.",
    "woodland-path": "The woodland gave you a straight piece of timber and a pale flower.",
    "woodland-again": "You recognized the safe path by the bent fern at its edge.",
    "first-brace": "The first greenhouse brace held when the wind turned.",
    "brace-ritual": "Repair became a small ritual: measure, lift, and listen.",
    "greenhouse-ready": "On the final brace, the glasshouse stopped feeling like a promise and became a place.",
  };

  const DIALOGUES = {
    welcome: {
      text: "The farm remembers small things. A cleared path can be a kind of hello.",
      note: "Mira is waiting to see what you make of the quiet.",
      status: "Listening",
    },
    "mira-first-visit": {
      text: "You came all this way and did not lead with a list. I can work with that. Sit a minute; the lantern has room for two.",
      note: MEMORY_TEXT["mira-first-visit"],
      status: "Seen",
    },
    "mira-shared-lantern": {
      text: "You remember where the good matches are. Mira shifts over without looking up. Some kinds of trust arrive before either person names them.",
      note: MEMORY_TEXT["mira-shared-lantern"],
      status: "Closer",
    },
    "mira-lantern-again": {
      text: "No explanation tonight? Good. Mira lets the quiet settle between you, warm as the porch boards.",
      note: MEMORY_TEXT["mira-lantern-again"],
      status: "At ease",
    },
    "mira-sees-glass": {
      text: "Look at that line of glass. Mira smiles like she has been carrying the picture of it for years. You made room for a future here.",
      note: "Mira can finally see the lake through a whole roof.",
      status: "Proud",
    },
    "note-left": {
      text: "Mira reads the little note twice. You did not ask for an answer, which may be why she gives you one: tomorrow, bring the blue tin.",
      note: MEMORY_TEXT["note-left"],
      status: "Touched",
    },
    "note-returned": {
      text: "The pressed leaf is an answer in Mira’s handwriting. She tucks the note into her pocket, as if it belongs there now.",
      note: MEMORY_TEXT["note-returned"],
      status: "Remembered",
    },
    "garden-first-care": {
      text: "Those rows were sulking before you arrived. Mira watches your careful hands and says nothing, which is her way of approving the method.",
      note: MEMORY_TEXT["garden-first-care"],
      status: "Noticed",
    },
    "garden-rhythm": {
      text: "There you are. The garden does not need rescuing tonight, Mira says; it needs someone willing to notice what is already growing.",
      note: MEMORY_TEXT["garden-rhythm"],
      status: "In rhythm",
    },
    "woodland-path": {
      text: "You found the dry timber. Mira turns it in her hands and finds the straightest edge. That is a conversation too, in its way.",
      note: MEMORY_TEXT["woodland-path"],
      status: "Useful",
    },
    "woodland-again": {
      text: "You took the bent-fern path without asking. Mira nods toward the dark trees: the farm is starting to teach you its shortcuts.",
      note: MEMORY_TEXT["woodland-again"],
      status: "Learning",
    },
    "first-brace": {
      text: "One brace, Mira says, holding the frame steady while you fasten it. It is not the whole roof, but the wind has less to argue with now.",
      note: MEMORY_TEXT["first-brace"],
      status: "Building",
    },
    "brace-ritual": {
      text: "Measure, lift, listen. Mira repeats the order like a small spell. The glasshouse is beginning to answer back.",
      note: MEMORY_TEXT["brace-ritual"],
      status: "Building",
    },
    "greenhouse-ready": {
      text: "There. The last brace is in. Mira rests her palm on the frame and lets the silence say what neither of you needs to say aloud.",
      note: MEMORY_TEXT["greenhouse-ready"],
      status: "Whole",
    },
    "evening-rest": {
      text: "The lantern burns low. Mira closes the seed tin and leaves the porch light on for your next evening.",
      note: "Another night is kept in the journal.",
      status: "Resting",
    },
  };

  const ENDINGS = {
    "two-lights": {
      title: "A House With Two Lights",
      text: "The greenhouse is whole, and the porch no longer feels like one person’s work. Mira leaves the lantern burning beside yours.",
      memory: "Somewhere between the first brace and the final silence, the farm became shared ground.",
    },
    "glasshouse-bloom": {
      title: "Glasshouse at Last",
      text: "The roof holds. Tiny leaves lift toward the moon, and the repaired glass catches a second version of the stars.",
      memory: "You kept your promise to the greenhouse, one careful evening at a time.",
    },
    "path-between": {
      title: "The Path Between",
      text: "The greenhouse is still a work in progress, but Mira knows your footsteps now. The farm has a path that was not there before.",
      memory: "Not every beginning needs to arrive finished to be real.",
    },
    "quiet-beginning": {
      title: "A Quiet Beginning",
      text: "The week ends with loose boards, a few saved seeds, and the feeling that the next evening might be different.",
      memory: "You left enough light behind to find your way back.",
    },
  };

  function createInitialState() {
    return {
      saveVersion: SAVE_VERSION,
      started: false,
      day: 1,
      energy: MAX_ENERGY,
      inventory: {
        timber: 0,
        moonflower: 0,
        vegetables: 0,
      },
      gardenProgress: 0,
      greenhouseProgress: 0,
      relationship: {
        trust: 0,
        warmth: 0,
      },
      memories: [],
      lastOutcome: null,
      ending: null,
      actionCount: 0,
      foragedCount: 0,
    };
  }

  function clampNumber(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return minimum;
    }
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
  }

  function normalizeState(candidate) {
    if (!candidate || Number(candidate.saveVersion) !== SAVE_VERSION) {
      return null;
    }
    const initial = createInitialState();
    const normalized = {
      ...initial,
      ...candidate,
      saveVersion: SAVE_VERSION,
      started: candidate.started !== false,
      day: clampNumber(candidate.day, 1, MAX_DAYS),
      energy: clampNumber(candidate.energy, 0, MAX_ENERGY),
      inventory: {
        ...initial.inventory,
        ...(candidate.inventory || {}),
      },
      relationship: {
        ...initial.relationship,
        ...(candidate.relationship || {}),
      },
      memories: Array.isArray(candidate.memories) ? [...new Set(candidate.memories.filter((item) => typeof item === "string"))] : [],
      lastOutcome: candidate.lastOutcome && typeof candidate.lastOutcome === "object" ? candidate.lastOutcome : null,
      ending: candidate.ending && typeof candidate.ending === "object" ? candidate.ending : null,
      actionCount: clampNumber(candidate.actionCount, 0, 999),
      foragedCount: clampNumber(candidate.foragedCount, 0, 999),
    };
    Object.keys(normalized.inventory).forEach((key) => {
      normalized.inventory[key] = clampNumber(normalized.inventory[key], 0, 99);
    });
    normalized.gardenProgress = clampNumber(candidate.gardenProgress, 0, MAX_DAYS);
    normalized.greenhouseProgress = clampNumber(candidate.greenhouseProgress, 0, MAX_GREENHOUSE_PROGRESS);
    normalized.relationship.trust = clampNumber(normalized.relationship.trust, 0, 99);
    normalized.relationship.warmth = clampNumber(normalized.relationship.warmth, 0, 99);
    return normalized;
  }

  function readStoredState() {
    try {
      const primary = window.localStorage.getItem(SAVE_KEY);
      const pending = window.localStorage.getItem(TEMP_SAVE_KEY);
      return normalizeState(primary ? JSON.parse(primary) : pending ? JSON.parse(pending) : null);
    } catch (error) {
      return null;
    }
  }

  const interpreter = new (class SemanticInterpreter {
    interpret(context, action) {
      const { state } = context;
      const memories = state.memories;
      const has = (memoryKey) => memories.includes(memoryKey);
      const relation = (trust, warmth) => ({ trust, warmth });

      if (action.id === "visit-mira") {
        if (state.greenhouseProgress >= MAX_GREENHOUSE_PROGRESS) {
          return {
            interpretationId: "visit-mira-after-greenhouse",
            relationshipDelta: relation(2, 2),
            memoryKey: "mira-lantern-again",
            dialogueId: "mira-sees-glass",
          };
        }
        if (has("mira-shared-lantern")) {
          return {
            interpretationId: "visit-mira-with-shared-history",
            relationshipDelta: relation(1, 2),
            memoryKey: "mira-lantern-again",
            dialogueId: "mira-lantern-again",
          };
        }
        if (has("mira-first-visit")) {
          return {
            interpretationId: "visit-mira-second-time",
            relationshipDelta: relation(2, 2),
            memoryKey: "mira-shared-lantern",
            dialogueId: "mira-shared-lantern",
          };
        }
        return {
          interpretationId: "visit-mira-first-time",
          relationshipDelta: relation(2, 1),
          memoryKey: "mira-first-visit",
          dialogueId: "mira-first-visit",
        };
      }

      if (action.id === "leave-note") {
        if (has("note-left")) {
          return {
            interpretationId: "leave-note-returning",
            relationshipDelta: relation(1, 2),
            memoryKey: "note-returned",
            dialogueId: "note-returned",
          };
        }
        return {
          interpretationId: "leave-note-first-time",
          relationshipDelta: relation(2, 1),
          memoryKey: "note-left",
          dialogueId: "note-left",
        };
      }

      if (action.id === "tend-garden") {
        if (has("garden-first-care")) {
          return {
            interpretationId: "tend-garden-with-rhythm",
            relationshipDelta: relation(0, 2),
            memoryKey: "garden-rhythm",
            dialogueId: "garden-rhythm",
          };
        }
        return {
          interpretationId: "tend-garden-first-time",
          relationshipDelta: relation(0, 1),
          memoryKey: "garden-first-care",
          dialogueId: "garden-first-care",
        };
      }

      if (action.id === "forage-woodland") {
        if (has("woodland-path")) {
          return {
            interpretationId: "forage-woodland-known-path",
            relationshipDelta: relation(1, 1),
            memoryKey: "woodland-again",
            dialogueId: "woodland-again",
          };
        }
        return {
          interpretationId: "forage-woodland-first-time",
          relationshipDelta: relation(1, 0),
          memoryKey: "woodland-path",
          dialogueId: "woodland-path",
        };
      }

      if (action.id === "repair-greenhouse") {
        if (state.greenhouseProgress >= MAX_GREENHOUSE_PROGRESS - 1) {
          return {
            interpretationId: "repair-greenhouse-final-brace",
            relationshipDelta: relation(2, 2),
            memoryKey: "greenhouse-ready",
            dialogueId: "greenhouse-ready",
          };
        }
        if (has("first-brace")) {
          return {
            interpretationId: "repair-greenhouse-repeated",
            relationshipDelta: relation(1, 1),
            memoryKey: "brace-ritual",
            dialogueId: "brace-ritual",
          };
        }
        return {
          interpretationId: "repair-greenhouse-first-brace",
          relationshipDelta: relation(1, 1),
          memoryKey: "first-brace",
          dialogueId: "first-brace",
        };
      }

      return {
        interpretationId: "unrecognized-action",
        relationshipDelta: relation(0, 0),
        dialogueId: "welcome",
      };
    }
  })();

  const REMOTE_PROVIDER_PATH = "/api/semantic";
  let remoteProviderState = "unknown";

  function validateRemoteInterpretation(payload) {
    const candidate = payload && payload.interpretation && typeof payload.interpretation === "object"
      ? payload.interpretation
      : payload;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const delta = candidate.relationshipDelta;
    if (
      typeof candidate.interpretationId !== "string" ||
      candidate.interpretationId.length < 1 ||
      candidate.interpretationId.length > 120 ||
      !delta ||
      !Number.isInteger(delta.trust) ||
      !Number.isInteger(delta.warmth) ||
      delta.trust < -10 ||
      delta.trust > 10 ||
      delta.warmth < -10 ||
      delta.warmth > 10 ||
      typeof candidate.dialogueId !== "string" ||
      !DIALOGUES[candidate.dialogueId]
    ) {
      return null;
    }
    if (candidate.memoryKey !== undefined && candidate.memoryKey !== null && !MEMORY_TEXT[candidate.memoryKey]) {
      return null;
    }
    return {
      interpretationId: candidate.interpretationId,
      relationshipDelta: {
        trust: delta.trust,
        warmth: delta.warmth,
      },
      memoryKey: candidate.memoryKey || null,
      dialogueId: candidate.dialogueId,
    };
  }

  async function requestRemoteInterpretation(context, action) {
    if (
      remoteProviderState === "unavailable" ||
      typeof window.fetch !== "function" ||
      window.location.protocol === "file:"
    ) {
      return null;
    }
    const snapshot = context.state;
    const requestBody = {
      context: {
        day: snapshot.day,
        energy: snapshot.energy,
        inventory: snapshot.inventory,
        gardenProgress: snapshot.gardenProgress,
        greenhouseProgress: snapshot.greenhouseProgress,
        relationship: snapshot.relationship,
        memories: snapshot.memories,
        lastOutcome: snapshot.lastOutcome,
      },
      action: {
        id: action.id,
        title: action.title,
      },
    };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = window.setTimeout(() => controller?.abort(), 900);
    try {
      const response = await window.fetch(REMOTE_PROVIDER_PATH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller?.signal,
        credentials: "same-origin",
      });
      if (!response.ok) {
        if (response.status === 404 || response.status === 405 || response.status === 503) {
          remoteProviderState = "unavailable";
        }
        return null;
      }
      const interpretation = validateRemoteInterpretation(await response.json());
      if (interpretation) {
        remoteProviderState = "available";
      }
      return interpretation;
    } catch (error) {
      remoteProviderState = "unavailable";
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const elements = {
    dayLabel: document.getElementById("dayLabel"),
    energyLabel: document.getElementById("energyLabel"),
    energyPips: document.getElementById("energyPips"),
    objectiveText: document.getElementById("objectiveText"),
    saveStatus: document.getElementById("saveStatus"),
    sceneCaption: document.getElementById("sceneCaption"),
    locationKicker: document.getElementById("locationKicker"),
    locationTitle: document.getElementById("locationTitle"),
    locationDescription: document.getElementById("locationDescription"),
    locationHint: document.getElementById("locationHint"),
    actionList: document.getElementById("actionList"),
    endEveningButton: document.getElementById("endEveningButton"),
    endEveningNote: document.getElementById("endEveningNote"),
    miraDialogue: document.getElementById("miraDialogue"),
    memoryNote: document.getElementById("memoryNote"),
    miraStatus: document.getElementById("miraStatus"),
    startOverlay: document.getElementById("startOverlay"),
    beginButton: document.getElementById("beginButton"),
    endingOverlay: document.getElementById("endingOverlay"),
    endingTitle: document.getElementById("endingTitle"),
    endingText: document.getElementById("endingText"),
    endingStats: document.getElementById("endingStats"),
    endingMemory: document.getElementById("endingMemory"),
    endingRestartButton: document.getElementById("endingRestartButton"),
    inventoryList: document.getElementById("inventoryList"),
    relationshipList: document.getElementById("relationshipList"),
    memoryCount: document.getElementById("memoryCount"),
    memoryList: document.getElementById("memoryList"),
    journalLastOutcome: document.getElementById("journalLastOutcome"),
    journalDialog: document.getElementById("journalDialog"),
    aboutDialog: document.getElementById("aboutDialog"),
  };

  let state = readStoredState() || createInitialState();
  let currentLocation = "mira";
  let transitionLocked = false;
  let transitionTimer = null;

  const ACTIONS = {
    mira: [
      {
        id: "visit-mira",
        title: "Visit Mira",
        detail: "Sit beside the porch lantern and let the evening be unhurried.",
        preview: "Build the thread between you.",
      },
      {
        id: "leave-note",
        title: "Leave a moonflower note",
        detail: "Tuck a short note beneath the blue seed tin.",
        preview: "Give a moonflower; trust grows.",
      },
    ],
    garden: [
      {
        id: "tend-garden",
        title: "Tend the garden",
        detail: "Loosen the soil, tie a vine, and gather what is ready.",
        preview: "Gather +1 vegetable; warmth grows.",
      },
    ],
    woodland: [
      {
        id: "forage-woodland",
        title: "Forage the woodland",
        detail: "Follow the low path for straight timber and pale flowers.",
        preview: "Gather +1 timber; every second trip finds a moonflower.",
      },
    ],
    greenhouse: [
      {
        id: "repair-greenhouse",
        title: "Repair one greenhouse brace",
        detail: "Hold the frame steady and set one piece of timber into place.",
        preview: "Spend 1 timber; greenhouse progress +1.",
      },
    ],
  };

  function actionFor(id) {
    return Object.values(ACTIONS).flat().find((action) => action.id === id) || null;
  }

  function getUnavailableReason(action) {
    if (state.energy < 1) {
      return "No energy left — end the evening or return another night.";
    }
    if (action.id === "leave-note" && state.inventory.moonflower < 1) {
      return "Bring a moonflower from the woodland first.";
    }
    if (action.id === "repair-greenhouse" && state.greenhouseProgress >= MAX_GREENHOUSE_PROGRESS) {
      return "The greenhouse is whole for now. Stay with the people around it.";
    }
    if (action.id === "repair-greenhouse" && state.inventory.timber < 1) {
      return "You need 1 timber. Forage the woodland first.";
    }
    return "";
  }

  function displayInventoryName(key) {
    return {
      timber: "Timber",
      moonflower: "Moonflowers",
      vegetables: "Vegetables",
    }[key] || key;
  }

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function persistState() {
    const serialized = JSON.stringify({ ...state, saveVersion: SAVE_VERSION });
    try {
      window.localStorage.setItem(TEMP_SAVE_KEY, serialized);
      window.localStorage.setItem(SAVE_KEY, serialized);
      window.localStorage.removeItem(TEMP_SAVE_KEY);
      setText(elements.saveStatus, "Saved locally");
      elements.saveStatus.classList.remove("is-saving");
    } catch (error) {
      setText(elements.saveStatus, "Session only");
      elements.saveStatus.classList.add("is-saving");
    }
  }

  function renderEnergy() {
    setText(elements.energyLabel, `${state.energy} / ${MAX_ENERGY}`);
    elements.energyPips.replaceChildren();
    for (let index = 0; index < MAX_ENERGY; index += 1) {
      const pip = document.createElement("span");
      pip.className = `energy-pip${index < state.energy ? " is-full" : ""}`;
      elements.energyPips.append(pip);
    }
  }

  function renderTopbar() {
    setText(elements.dayLabel, `${state.day} / ${MAX_DAYS}`);
    renderEnergy();
    const objective = state.greenhouseProgress >= MAX_GREENHOUSE_PROGRESS
      ? "The greenhouse is whole. Keep the lantern warm, and notice who helps."
      : "Restore the greenhouse before the last light fades, and notice who helps.";
    setText(elements.objectiveText, objective);
  }

  function renderHotspots() {
    document.querySelectorAll(".hotspot").forEach((button) => {
      const selected = button.dataset.location === currentLocation;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function getLocationDescription(location) {
    if (location === "greenhouse") {
      return `${LOCATION_DATA.greenhouse.description} Progress: ${state.greenhouseProgress} / ${MAX_GREENHOUSE_PROGRESS} braces set.`;
    }
    if (location === "garden") {
      return `${LOCATION_DATA.garden.description} Rows tended this week: ${state.gardenProgress}.`;
    }
    return LOCATION_DATA[location].description;
  }

  function renderActions() {
    const actions = ACTIONS[currentLocation] || [];
    elements.actionList.replaceChildren();
    actions.forEach((action) => {
      const reason = getUnavailableReason(action);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-card";
      button.dataset.action = action.id;
      button.disabled = Boolean(reason) || transitionLocked || Boolean(state.ending);
      button.setAttribute("aria-disabled", String(button.disabled));

      const title = document.createElement("span");
      title.className = "action-name";
      title.textContent = action.title;
      button.append(title);

      const cost = document.createElement("span");
      cost.className = "action-cost";
      cost.textContent = "1 energy";
      button.append(cost);

      const detail = document.createElement("span");
      detail.className = reason ? "action-reason" : "action-detail";
      detail.textContent = reason || `${action.detail} ${action.preview}`;
      button.append(detail);
      elements.actionList.append(button);
    });
  }

  function renderLocation() {
    const location = LOCATION_DATA[currentLocation];
    setText(elements.locationKicker, location.kicker);
    setText(elements.locationTitle, location.title);
    setText(elements.locationDescription, getLocationDescription(currentLocation));
    setText(elements.locationHint, location.hint);
    setText(elements.sceneCaption, location.caption);
    renderActions();
  }

  function renderDialogue(dialogueId, memoryKey) {
    const dialogue = DIALOGUES[dialogueId] || DIALOGUES.welcome;
    setText(elements.miraDialogue, `“${dialogue.text}”`);
    setText(elements.memoryNote, memoryKey && MEMORY_TEXT[memoryKey] ? MEMORY_TEXT[memoryKey] : dialogue.note);
    setText(elements.miraStatus, dialogue.status);
    elements.miraDialogue.classList.remove("dialogue-enter");
    void elements.miraDialogue.offsetWidth;
    elements.miraDialogue.classList.add("dialogue-enter");
  }

  function renderJournal() {
    elements.inventoryList.replaceChildren();
    Object.entries(state.inventory).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "inventory-item";
      const label = document.createElement("span");
      label.textContent = displayInventoryName(key);
      const amount = document.createElement("strong");
      amount.textContent = String(value);
      item.append(label, amount);
      elements.inventoryList.append(item);
    });

    elements.relationshipList.replaceChildren();
    Object.entries(state.relationship).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "relationship-item";
      const label = document.createElement("span");
      label.textContent = key === "trust" ? "Trust" : "Warmth";
      const amount = document.createElement("strong");
      amount.textContent = String(value);
      item.append(label, amount);
      elements.relationshipList.append(item);
    });

    setText(elements.memoryCount, `${state.memories.length} kept`);
    elements.memoryList.replaceChildren();
    if (!state.memories.length) {
      const empty = document.createElement("li");
      empty.className = "empty-memory";
      empty.textContent = "Nothing is written yet. The night is young.";
      elements.memoryList.append(empty);
    } else {
      state.memories.forEach((memoryKey) => {
        const memory = document.createElement("li");
        memory.textContent = MEMORY_TEXT[memoryKey] || memoryKey;
        elements.memoryList.append(memory);
      });
    }

    if (state.lastOutcome && state.lastOutcome.kind === "action") {
      const action = actionFor(state.lastOutcome.actionId);
      setText(elements.journalLastOutcome, `Last choice: ${action ? action.title.toLowerCase() : "an evening choice"}. Mira answered differently because of what came before.`);
    } else if (state.lastOutcome && state.lastOutcome.kind === "evening-rest") {
      setText(elements.journalLastOutcome, "You ended the last evening with the lantern still lit.");
    } else {
      setText(elements.journalLastOutcome, "The first evening is waiting.");
    }
  }

  function renderEnding() {
    if (!state.ending) {
      elements.endingOverlay.hidden = true;
      return;
    }
    const ending = ENDINGS[state.ending.id] || ENDINGS["quiet-beginning"];
    setText(elements.endingTitle, ending.title);
    setText(elements.endingText, ending.text);
    elements.endingStats.replaceChildren();
    const stats = [
      ["Greenhouse", `${state.greenhouseProgress}/${MAX_GREENHOUSE_PROGRESS}`],
      ["Trust", state.relationship.trust],
      ["Warmth", state.relationship.warmth],
      ["Memories", state.memories.length],
    ];
    stats.forEach(([label, value]) => {
      const stat = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      stat.append(strong, ` ${label}`);
      elements.endingStats.append(stat);
    });
    setText(elements.endingMemory, ending.memory);
    elements.endingOverlay.hidden = false;
  }

  function render() {
    renderTopbar();
    renderHotspots();
    renderLocation();
    renderJournal();
    if (state.lastOutcome && state.lastOutcome.dialogueId) {
      renderDialogue(state.lastOutcome.dialogueId, state.lastOutcome.memoryKey);
    } else {
      renderDialogue("welcome");
    }
    renderEnding();
    elements.endEveningButton.disabled = transitionLocked || Boolean(state.ending);
    setText(elements.endEveningNote, state.day === MAX_DAYS ? "End the seventh evening to see what the week made." : "You can rest at any time, even with energy left.");
  }

  function addMemory(memoryKey) {
    if (memoryKey && !state.memories.includes(memoryKey)) {
      state.memories.push(memoryKey);
    }
  }

  function mutateInventory(key, amount) {
    state.inventory[key] = Math.max(0, (state.inventory[key] || 0) + amount);
  }

  function applyActionMutation(actionId) {
    if (actionId === "leave-note") {
      mutateInventory("moonflower", -1);
    }
    if (actionId === "tend-garden") {
      mutateInventory("vegetables", 1);
      state.gardenProgress = Math.min(MAX_DAYS, state.gardenProgress + 1);
    }
    if (actionId === "forage-woodland") {
      state.foragedCount += 1;
      mutateInventory("timber", 1);
      if (state.foragedCount % 2 === 0) {
        mutateInventory("moonflower", 1);
      }
    }
    if (actionId === "repair-greenhouse") {
      mutateInventory("timber", -1);
      state.greenhouseProgress = Math.min(MAX_GREENHOUSE_PROGRESS, state.greenhouseProgress + 1);
    }
  }

  function beginTransition() {
    transitionLocked = true;
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
    }
    renderActions();
    elements.endEveningButton.disabled = true;
  }

  function finishTransition(duration = 330) {
    transitionTimer = window.setTimeout(() => {
      transitionLocked = false;
      renderActions();
      elements.endEveningButton.disabled = Boolean(state.ending);
    }, duration);
  }

  async function commitAction(actionId) {
    if (transitionLocked || state.ending) {
      return;
    }
    const action = actionFor(actionId);
    if (!action || !ACTIONS[currentLocation].some((candidate) => candidate.id === actionId)) {
      return;
    }
    if (getUnavailableReason(action)) {
      return;
    }

    const context = {
      state: JSON.parse(JSON.stringify(state)),
      currentLocation,
      memories: [...state.memories],
    };
    const fallbackInterpretation = interpreter.interpret(context, action);

    beginTransition();
    const interpretation = await requestRemoteInterpretation(context, action) || fallbackInterpretation;
    state.energy -= 1;
    state.actionCount += 1;
    applyActionMutation(actionId);
    state.relationship.trust = Math.max(0, state.relationship.trust + interpretation.relationshipDelta.trust);
    state.relationship.warmth = Math.max(0, state.relationship.warmth + interpretation.relationshipDelta.warmth);
    addMemory(interpretation.memoryKey);
    state.lastOutcome = {
      kind: "action",
      day: state.day,
      location: currentLocation,
      actionId,
      interpretationId: interpretation.interpretationId,
      dialogueId: interpretation.dialogueId,
      memoryKey: interpretation.memoryKey || null,
    };
    persistState();
    render();
    finishTransition();
  }

  function deriveEnding() {
    const { greenhouseProgress, relationship, memories, gardenProgress } = state;
    if (greenhouseProgress >= MAX_GREENHOUSE_PROGRESS && relationship.trust >= 8 && relationship.warmth >= 8 && memories.includes("mira-shared-lantern")) {
      return "two-lights";
    }
    if (greenhouseProgress >= MAX_GREENHOUSE_PROGRESS && gardenProgress >= 3) {
      return "glasshouse-bloom";
    }
    if (relationship.trust >= 8 && relationship.warmth >= 7 && memories.includes("mira-first-visit")) {
      return "path-between";
    }
    return "quiet-beginning";
  }

  function endEvening() {
    if (transitionLocked || state.ending) {
      return;
    }
    beginTransition();
    if (state.day >= MAX_DAYS) {
      const endingId = deriveEnding();
      const ending = ENDINGS[endingId];
      state.ending = {
        id: endingId,
        title: ending.title,
        completedOnDay: state.day,
      };
      persistState();
      render();
      finishTransition(460);
      return;
    }

    const previousDay = state.day;
    state.day += 1;
    state.energy = MAX_ENERGY;
    state.lastOutcome = {
      kind: "evening-rest",
      day: previousDay,
      dialogueId: "evening-rest",
      memoryKey: null,
    };
    persistState();
    render();
    finishTransition(460);
  }

  function selectLocation(location) {
    if (transitionLocked || !LOCATION_DATA[location]) {
      return;
    }
    currentLocation = location;
    renderHotspots();
    renderLocation();
  }

  function openDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function showStartOverlay() {
    elements.endingOverlay.hidden = true;
    elements.startOverlay.hidden = false;
    window.setTimeout(() => elements.beginButton.focus(), 0);
  }

  function beginStory() {
    state.started = true;
    state.ending = null;
    persistState();
    elements.startOverlay.hidden = true;
    render();
  }

  function restartStory() {
    const confirmed = window.confirm("Restart Lastlight Farm? This will clear the saved seven-evening story from this browser.");
    if (!confirmed) {
      return;
    }
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
    }
    transitionLocked = false;
    state = createInitialState();
    currentLocation = "mira";
    persistState();
    render();
    showStartOverlay();
  }

  document.querySelectorAll(".hotspot").forEach((button) => {
    button.addEventListener("click", () => selectLocation(button.dataset.location));
  });

  elements.actionList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) {
      void commitAction(button.dataset.action);
    }
  });

  elements.endEveningButton.addEventListener("click", endEvening);
  document.getElementById("restartButton").addEventListener("click", restartStory);
  elements.endingRestartButton.addEventListener("click", restartStory);
  elements.beginButton.addEventListener("click", beginStory);
  document.getElementById("journalButton").addEventListener("click", () => openDialog(elements.journalDialog));
  document.getElementById("aboutButton").addEventListener("click", () => openDialog(elements.aboutDialog));

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
  });

  render();
  if (!state.started) {
    showStartOverlay();
  } else if (state.ending) {
    renderEnding();
  } else {
    elements.startOverlay.hidden = true;
  }
})();
