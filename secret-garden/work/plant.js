// Plant a Thought owns the temporary draft. Only a completed flower reaches the garden.
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const forms = { cup: "Cup", flared: "Flared", tall: "Tall" };
  const colors = { peach: "Peach", lilac: "Lilac", blue: "Ice blue" };
  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });
  const sharedView = () => window.GardenData.status
    ? window.GardenData.status.mode !== "local" : Boolean(window.GardenData.isShared);

  function bloomStage(percent) {
    if (percent === 0) return "Bud";
    if (percent === 100) return "Full bloom";
    return "Partly open";
  }

  function setup({ onMode, onPlant, onClearSelection, onBackToHistory, onReplay }) {
    const entry = byId("open-plant");
    const panel = byId("plant-panel");
    const back = byId("plant-back");
    const thoughtForm = byId("thought-form");
    const input = byId("thought-input");
    const nickname = byId("nickname-input");
    const associationList = byId("association-list");
    const growTarget = byId("grow-target");
    const growRange = byId("grow-range");
    const growProgress = byId("grow-progress");
    const plantStage = byId("plant-stage-summary");
    const confirm = byId("plant-confirm");
    const detail = byId("flower-detail");
    const detailTitle = byId("detail-title");
    const detailBack = byId("detail-back");
    const detailThought = byId("detail-thought");
    const detailFields = byId("detail-fields");
    const detailGrowHint = byId("detail-grow-hint");
    const detailReplay = byId("detail-replay");
    const detailGrowth = byId("detail-growth");
    const status = byId("garden-status");
    const steps = {
      thought: byId("thought-step"),
      style: byId("style-step"),
      grow: byId("grow-step")
    };
    let draft = null;
    let step = null;
    let drag = null;
    let statusTimer;
    let detailBloom;
    let detailId = null;
    let detailCanGrow = true;
    let detailRecord = null;
    let detailOpenness = 0;
    let detailGrowing = false;
    let rangeSource = "mouse";

    function announce(message) {
      clearTimeout(statusTimer);
      status.textContent = message;
      status.dataset.active = String(Boolean(message));
      if (message) statusTimer = setTimeout(() => announce(""), 4400);
    }

    function rememberBloom(source, force = false) {
      const previous = draft.growth.at(-1);
      if (previous && previous.openness === draft.openness) return;
      const now = Date.now();
      if (!force && previous && now - Date.parse(previous.at) < 100) return;
      draft.growth.push(window.GardenData.growthPoint(draft.openness, source, new Date(now).toISOString()));
    }

    function setDraftBloom(percent, source) {
      const amount = Math.min(100, Math.max(0, Math.round(percent)));
      draft.openness = amount / 100;
      if (source) rememberBloom(source);
      growRange.value = amount;
      growRange.style.setProperty("--progress", amount + "%");
      growRange.setAttribute("aria-valuetext", bloomStage(amount) + ", " + amount + "%");
      growProgress.textContent = amount + "%";
      plantStage.textContent = amount === 0 ? "Plant as a bud"
        : amount === 100 ? "Plant in full bloom" : "Plant partly open";
    }

    function setHandBloom(openness) {
      if (step !== "grow" || drag || !Number.isFinite(openness)) return;
      const next = Math.min(1, Math.max(0, openness));
      if (Math.round(next * 100) !== Math.round(draft.openness * 100)) setDraftBloom(next * 100, "body");
    }

    function showStep(name) {
      step = name;
      for (const [id, section] of Object.entries(steps)) section.hidden = id !== name;
      back.hidden = name === "thought";
      growTarget.hidden = name !== "grow";
      panel.scrollTop = 0;
      if (name === "thought") input.focus({ preventScroll: true });
      if (name === "style") steps.style.querySelector(".step-title").focus({ preventScroll: true });
      if (name === "grow") {
        if (!draft.growth.length) rememberBloom("seed", true);
        setDraftBloom(draft.openness * 100);
        growRange.focus({ preventScroll: true });
      }
    }

    function open() {
      if (draft) return;
      announce("");
      draft = { thought: "", nickname: "", associations: [], form: "cup", color: "peach", openness: 0, growth: [] };
      thoughtForm.reset();
      nickname.value = window.GardenData.getNickname();
      input.setCustomValidity("");
      steps.style.querySelector('[name="flower-form"][value="cup"]').checked = true;
      steps.style.querySelector('[name="flower-color"][value="peach"]').checked = true;
      panel.hidden = false;
      entry.setAttribute("aria-expanded", "true");
      onMode(true);
      showStep("thought");
    }

    function close(restoreFocus = true) {
      if (!draft) return false;
      draft = null;
      step = null;
      drag = null;
      panel.hidden = true;
      growTarget.hidden = true;
      growTarget.removeAttribute("data-dragging");
      entry.setAttribute("aria-expanded", "false");
      onMode(false);
      if (restoreFocus) entry.focus({ preventScroll: true });
      return true;
    }

    function updateDetailBloom(openness, growing = false) {
      if (detail.hidden) return;
      detailOpenness = openness;
      detailGrowing = growing;
      const percent = Math.round(openness * 100);
      detailBloom.textContent = bloomStage(percent) + " (" + percent + "%)";
      detailGrowHint.hidden = false;
      detailGrowHint.textContent = !detailCanGrow
        ? "Drag to explore. Release to return this flower."
        : growing ? "Release to save bloom."
          : percent < 100 ? "Drag to move. Hold Shift and drag up to bloom."
            : "Drag to move. Release to save its position.";
    }

    function showDetail(record, ordinal, fromHistory = false) {
      detailId = record?.id ?? null;
      detailRecord = record;
      if (!record) {
        detail.hidden = true;
        return;
      }
      refreshDetailAccess();
      detailTitle.textContent = "Flower " + ordinal;
      detailBack.hidden = !fromHistory;
      detailThought.textContent = record.thought;
      const { appearance } = record;
      const information = [
        ["Form", forms[appearance.form]],
        ["Color", colors[appearance.color]],
        ["Bloom", ""],
        ["Size", Math.round(appearance.size * 100) + "% of demo"],
        ["Associations", record.associations.join(" · ")],
        ["Created", dateFormat.format(new Date(record.createdAt))],
        [sharedView() ? "Planted by" : "Nickname", record.author.name]
      ];
      detailFields.replaceChildren(...information.flatMap(([label, value]) => {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value;
        if (label === "Bloom") detailBloom = description;
        return [term, description];
      }));
      detail.dataset.side = record.position.x >= 0.62 ? "left" : "right";
      detail.hidden = false;
      updateDetailBloom(appearance.openness);
      updateDetailGrowth(record);
      detail.scrollTop = 0;
      detailTitle.focus({ preventScroll: true });
    }

    function refreshDetailAccess() {
      if (!detailRecord) return;
      const state = window.GardenData.status;
      const local = !sharedView();
      detailCanGrow = local || ((!state || (state.mode === "shared" && state.ready))
        && window.GardenData.isOwn(detailRecord));
      if (detailCanGrow) detailTitle.setAttribute("aria-keyshortcuts", "ArrowUp");
      else detailTitle.removeAttribute("aria-keyshortcuts");
      if (!detail.hidden && detailBloom) updateDetailBloom(detailOpenness, detailGrowing);
    }

    function updateDetailGrowth(record) {
      const points = window.GardenData.growthFor(record);
      const recorded = points.filter(point => point.source !== "snapshot");
      detailGrowth.textContent = recorded.length
        ? "Recorded from " + dateFormat.format(new Date(recorded[0].at))
        : "Earlier growth wasn’t recorded. View the saved state.";
    }

    entry.addEventListener("click", () => draft ? close() : open());
    byId("plant-close").addEventListener("click", () => close());
    byId("detail-close").addEventListener("click", onClearSelection);
    detailBack.addEventListener("click", onBackToHistory);
    detailReplay.addEventListener("click", event => {
      if (detailId) onReplay(detailId, event);
    });
    back.addEventListener("click", () => showStep(step === "grow" ? "style" : "thought"));

    input.addEventListener("input", () => input.setCustomValidity(""));
    thoughtForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const thought = input.value.trim();
      if (!thought) {
        input.setCustomValidity("Write a thought to continue.");
        input.reportValidity();
        return;
      }
      draft.thought = thought;
      draft.nickname = nickname.value.trim();
      draft.associations = window.GardenData.suggest(thought);
      associationList.replaceChildren(...draft.associations.map((association) => {
        const item = document.createElement("li");
        item.textContent = association;
        return item;
      }));
      showStep("style");
    });
    steps.style.addEventListener("change", (event) => {
      const option = event.target;
      if (option.name === "flower-form") draft.form = option.value;
      if (option.name === "flower-color") draft.color = option.value;
    });
    byId("style-next").addEventListener("click", () => showStep("grow"));
    growRange.addEventListener("pointerdown", () => { rangeSource = "mouse"; });
    growRange.addEventListener("keydown", event => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) rangeSource = "keyboard";
    });
    growRange.addEventListener("input", () => setDraftBloom(Number(growRange.value), rangeSource));
    growRange.addEventListener("change", () => rememberBloom(rangeSource, true));

    growTarget.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      drag = {
        pointer: event.pointerId,
        y: event.clientY,
        percent: draft.openness * 100,
        travel: Math.min(135, Math.max(75, growTarget.offsetHeight))
      };
      growTarget.setPointerCapture(event.pointerId);
      growTarget.dataset.dragging = "";
      event.preventDefault();
    });
    growTarget.addEventListener("pointermove", (event) => {
      if (drag?.pointer === event.pointerId) {
        setDraftBloom(drag.percent + (drag.y - event.clientY) * 100 / drag.travel, "mouse");
      }
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      growTarget.addEventListener(name, (event) => {
        if (drag?.pointer === event.pointerId) {
          rememberBloom("mouse", true);
          drag = null;
          growTarget.removeAttribute("data-dragging");
        }
      });
    }

    confirm.addEventListener("click", () => {
      if (step !== "grow") return;
      rememberBloom(draft.growth.at(-1)?.source === "body" ? "body" : "mouse", true);
      const result = onPlant(draft);
      if (!result) {
        announce("This flower couldn’t be planted. Try again.");
        return;
      }
      if (result.error) {
        announce(result.error);
        return;
      }
      close(false);
      result.target.focus({ preventScroll: true });
      announce(result.message || (result.pending ? "Planted locally. Waiting to share…"
        : result.saved ? "Planted. Click your flower to read your thought."
          : "Planted for this visit. Click your flower to read your thought."));
    });

    return {
      get draft() { return draft; },
      get step() { return step; },
      close, showDetail, updateDetailBloom, updateDetailGrowth, refreshDetailAccess, announce, setHandBloom
    };
  }

  window.GardenPlant = { setup };
})();
