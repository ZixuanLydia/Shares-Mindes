// Scene controller. Future mouse, hand-tracking, and replay inputs can share setBloom().
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const garden = byId("garden");
  const canvas = byId("scene");
  const ctx = canvas.getContext("2d");
  const landscape = byId("landscape");
  const foreground = byId("foreground");
  const focusShade = byId("focus-shade");
  const camera = byId("camera");
  const hint = byId("scene-hint");
  const flower = byId("flower-target");
  const demoControls = byId("demo-controls");
  const plantedTargets = byId("planted-targets");
  const growTarget = byId("grow-target");
  const historyPanel = byId("history-panel");
  const detailPanel = byId("flower-detail");
  const range = byId("bloom");
  const progress = byId("progress");
  const play = byId("play");
  const reset = byId("reset");
  const stages = [...document.querySelectorAll(".stage")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const narrowScreen = matchMedia("(max-width: 760px)");
  const touchScreen = matchMedia("(hover: none)");
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const mix = (a, b, amount) => a + (b - a) * amount;

  if (!ctx) {
    hint.textContent = "This browser couldn’t draw the flower.";
    for (const control of [camera, range, play, reset, byId("open-plant"), ...stages]) control.disabled = true;
    return;
  }

  const view = { width: 0, height: 0, scale: 1, backdrop: null };
  const gardenImage = new Image();
  const specimen = { id: "glass-flower", position: { x: 0.60, y: 0.49, z: 0 }, openness: 0.5 };
  const plants = [];
  let depthOrder = [];
  const plantingSpots = [
    { x: 0.82, y: 0.61, z: 0.43 },
    { x: 0.42, y: 0.66, z: 0.24 },
    { x: 0.75, y: 0.35, z: -0.67 },
    { x: 0.92, y: 0.46, z: -0.37 },
    { x: 0.59, y: 0.72, z: 0.66 },
    { x: 0.36, y: 0.77, z: 0.36 },
    { x: 0.85, y: 0.30, z: -0.81 },
    { x: 0.44, y: 0.36, z: -0.52 },
    { x: 0.91, y: 0.74, z: 0.57 },
    { x: 0.70, y: 0.79, z: 0.80 },
    { x: 0.52, y: 0.25, z: -0.84 },
    { x: 0.96, y: 0.59, z: -0.13 }
  ];
  const pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const duration = 4200;
  let parallax = !reducedMotion.matches && !touchScreen.matches;
  let selectedFlower = null;
  let returnToHistoryId = null;
  let bloomDrag = null;
  let positionDrag = null;
  let positionReturnUntil = 0;
  let dragClick = null;
  const positionMotion = window.GardenPositionDrag;
  let animation = null;
  let playbackTime = 0;
  let canResume = false;
  let previousTime = performance.now();
  let displayedPercent = -1;
  let draftProgress = 0;
  let refreshAvailable = true;
  let bodyLiveId = null;
  let pendingSnapshot = null;
  let snapshotSignature = "";
  let previousPending = 0;
  const plant = window.GardenPlant.setup({
    onMode: setPlantMode,
    onPlant: commitPlant,
    onClearSelection: dismissDetail,
    onBackToHistory: reopenHistory,
    onReplay: (id, event) => focusFlower(plants.find(entry => entry.record.id === id), event, true)
  });
  const history = window.GardenHistory.setup({
    listFlowers: () => plants.map(({ record }) => record),
    onOpen: openHistory,
    onSelect: (id) => setSelection(id, true, true)
  });
  const focus = window.GardenFocus.setup({
    garden, reducedMotion, onRestore: restoreGarden, listEntries: listFocusEntries
  });
  const body = window.GardenBodyCamera.setup();
  const bodyMotion = window.GardenBodyMotion.create();

  // Fixed positions keep each point of light attached to its own depth layer.
  const motes = Array.from({ length: 36 }, (_, index) => ({
    x: (0.137 + index * 0.618034) % 1,
    y: 0.12 + ((0.39 + index * 0.414214) % 1) * 0.73,
    z: (index % 4) / 3,
    phase: index * 1.381
  }));

  function fitBackdrop() {
    if (!gardenImage.naturalWidth) return;
    const width = landscape.clientWidth;
    const height = landscape.clientHeight;
    const [xPercent, yPercent] = getComputedStyle(landscape).backgroundPosition.split(" ").map(parseFloat);
    const scale = Math.max(width / gardenImage.naturalWidth, height / gardenImage.naturalHeight);
    const fittedWidth = gardenImage.naturalWidth * scale;
    const fittedHeight = gardenImage.naturalHeight * scale;
    view.backdrop = {
      image: gardenImage,
      scale,
      left: landscape.offsetLeft + (width - fittedWidth) * xPercent / 100,
      top: landscape.offsetTop + (height - fittedHeight) * yPercent / 100,
      x: 0,
      y: 0
    };
  }

  function resize() {
    if (positionDrag) finishPositionDrag(false);
    if (bloomDrag) finishBloomDrag(false);
    view.width = garden.clientWidth;
    view.height = garden.clientHeight;
    view.scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * view.scale);
    canvas.height = Math.round(view.height * view.scale);
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    fitBackdrop();
  }

  function setBloom(amount) {
    specimen.openness = clamp(amount, 0, 1);
    const wholePercent = Math.round(specimen.openness * 100);
    const percent = specimen.openness > 0 && specimen.openness < 1
      ? clamp(wholePercent, 1, 99)
      : wholePercent;
    if (percent === displayedPercent) return;

    displayedPercent = percent;
    range.value = percent;
    range.style.setProperty("--progress", percent + "%");
    progress.value = percent + "%";
    const stageName = percent === 0 ? "bud" : percent === 50 ? "half-open" : percent === 100 ? "bloom" : "";
    range.setAttribute("aria-valuetext", stageName ? percent + "%, " + stageName : percent + "%");
    for (const stage of stages) {
      stage.setAttribute("aria-pressed", String(Number(stage.dataset.bloom) * 100 === percent));
    }
  }

  function updatePlaybackButton() {
    const playing = animation?.type === "play";
    const label = playing ? "Pause demo bloom" : canResume ? "Resume demo bloom" : "Play demo bloom";
    play.dataset.playing = String(playing);
    play.setAttribute("aria-label", label);
    play.title = label;
  }

  function stopPlayback() {
    animation = null;
    canResume = false;
    updatePlaybackButton();
  }

  function goToStage(amount) {
    stopPlayback();
    if (reducedMotion.matches) {
      setBloom(amount);
      return;
    }
    animation = { type: "stage", from: specimen.openness, to: amount, start: performance.now() };
  }

  function updateAnimation(now) {
    if (animation?.type === "stage") {
      const amount = clamp((now - animation.start) / 690, 0, 1);
      setBloom(mix(animation.from, animation.to, amount * amount * (3 - 2 * amount)));
      if (amount === 1) animation = null;
    } else if (animation?.type === "play") {
      playbackTime = clamp(now - animation.start, 0, duration);
      const t = playbackTime / duration;
      setBloom(t * t * (3 - 2 * t));
      if (t === 1) stopPlayback();
    }
  }

  function updateSceneHint() {
    const action = touchScreen.matches ? "Tap" : "Click";
    hint.textContent = selectedFlower === specimen.id
      ? "Drag to explore · Use the slider to bloom."
      : plants.length
        ? "Drag to move · " + action + " a flower to look closer."
        : "Drag the flower to move · " + action + " to look closer.";
  }

  function setParallax(enabled) {
    parallax = enabled;
    camera.setAttribute("aria-pressed", String(enabled));
    if (!enabled) pointer.x = pointer.y = 0;
  }

  function setSelection(id, showDetails = true, fromHistory = false) {
    if (positionDrag && positionDrag.id !== id) finishPositionDrag(false);
    if (id) history.close(false);
    if (bloomDrag && bloomDrag.entry.record.id !== id) finishBloomDrag(false);
    const demoSelected = id === specimen.id;
    const focusInDemo = demoControls.contains(document.activeElement);
    if (selectedFlower === specimen.id && !demoSelected) stopPlayback();
    selectedFlower = id;
    demoControls.hidden = !demoSelected;
    flower.setAttribute("aria-pressed", String(demoSelected));
    for (const entry of plants) {
      entry.target.setAttribute("aria-pressed", String(entry.record.id === id));
    }
    const entry = showDetails && plants.find(({ record }) => record.id === id);
    returnToHistoryId = fromHistory && entry ? id : null;
    plant.showDetail(entry ? entry.record : null, entry?.ordinal, Boolean(returnToHistoryId));
    updateSceneHint();
    if (!id && focusInDemo && !plant.draft) flower.focus({ preventScroll: true });
  }

  function dismissDetail() {
    const entry = plants.find(({ record }) => record.id === selectedFlower);
    setSelection(null);
    entry?.target.focus({ preventScroll: true });
  }

  function openHistory() {
    plant.close(false);
    setSelection(null);
  }

  function reopenHistory() {
    if (returnToHistoryId) history.open(returnToHistoryId);
  }

  function setPlantMode(open) {
    if (open) {
      history.close(false);
      stopPlayback();
      setSelection(null);
      draftProgress = 0;
    }
    flower.hidden = open;
    plantedTargets.hidden = open;
  }

  function focusFlower(entry, event, replay = false) {
    if (focus.active || plant.draft || positionDrag) return;
    const id = entry?.record.id ?? specimen.id;
    const depth = entry ? clamp(entry.record.position.z, -1, 1) : 0;
    const yaw = entry?.raster?.yaw ?? look.x * (0.23 + depth * 0.05);
    const pitch = entry?.raster?.pitch ?? look.y * (0.17 + depth * 0.04);
    const source = {
      id, entry, yaw, pitch, replay,
      openness: bodyOpenness(entry?.record.appearance.openness ?? specimen.openness, bodyMotion.effect(id)),
      gardenLook: { ...look },
      poseTime: reducedMotion.matches ? 0 : previousTime / 1000,
      fromHistory: returnToHistoryId === id,
      keyboard: event.detail === 0
    };
    history.close(false);
    setSelection(null);
    pointer.x = look.x;
    pointer.y = look.y;
    focus.enter(source);
  }

  function restoreGarden(subject) {
    look.x = pointer.x = subject.gardenLook.x;
    look.y = pointer.y = subject.gardenLook.y;
    applyPendingSnapshot();
    setSelection(subject.id, true, subject.fromHistory);
    if (!subject.entry) {
      (subject.keyboard ? range : flower).focus({ preventScroll: true });
    }
  }

  function registerPlant(record) {
    const ordinal = plants.length + 1;
    const target = document.createElement("button");
    target.type = "button";
    target.className = "flower-target planted-target";
    target.dataset.flowerId = record.id;
    target.setAttribute("aria-label", "Open flower " + ordinal);
    target.setAttribute("aria-controls", "focus-view flower-detail");
    target.setAttribute("aria-pressed", "false");
    target.setAttribute("data-can-move", "");
    const canGrow = canGrowRecord(record);
    if (canGrow) target.setAttribute("aria-keyshortcuts", "ArrowUp");
    target.toggleAttribute("data-can-grow", canGrow && record.appearance.openness < 1);
    const tag = document.createElement("span");
    tag.className = "selection-tag";
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = "Flower " + ordinal;
    target.append(tag);
    const entry = { record, target, ordinal, raster: null, draggedClick: false };
    target.addEventListener("click", (event) => {
      if (entry.draggedClick && event.detail !== 0) {
        entry.draggedClick = false;
        return;
      }
      focusFlower(entry, event);
    });
    bindGardenDrag(target, entry);
    plantedTargets.append(target);
    plants.push(entry);
    return entry;
  }

  function bindGardenDrag(target, entry = null) {
    target.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (event.shiftKey && entry && canGrowRecord(entry.record) && entry.record.appearance.openness < 1) {
        if (selectedFlower !== entry.record.id) setSelection(entry.record.id, true);
        beginBloomDrag(entry, event);
      } else beginPositionDrag(entry, event);
    });
    target.addEventListener("pointermove", (event) => {
      if (isPositionPointer(target, event)) movePositionDrag(event);
      else if (entry && isBloomPointer(entry, event)) moveBloomDrag(event.clientY);
    });
    target.addEventListener("pointerup", (event) => {
      if (isPositionPointer(target, event)) {
        movePositionDrag(event);
        finishPositionDrag(true);
      } else if (entry && isBloomPointer(entry, event)) {
        moveBloomDrag(event.clientY);
        finishBloomDrag(true);
      }
    });
    for (const type of ["pointercancel", "lostpointercapture"]) {
      target.addEventListener(type, (event) => {
        if (isPositionPointer(target, event)) finishPositionDrag(false);
        else if (entry && isBloomPointer(entry, event)) finishBloomDrag(false);
      });
    }
  }

  function isPositionPointer(target, event) {
    return positionDrag?.target === target && positionDrag.pointerId === event.pointerId;
  }

  function dragPoint(event) {
    return positionMotion.point(event, garden.getBoundingClientRect(), view);
  }

  function beginPositionDrag(entry, event) {
    if (event.button !== 0 || !event.isPrimary || positionDrag || bloomDrag || focus.active || plant.draft) return;
    const target = entry?.target ?? flower;
    const point = dragPoint(event);
    const origin = entry ? displayedPosition(entry) : displayedDemoPosition();
    const anchor = positionMotion.start(origin, point, view);
    if (!anchor) return;
    if (entry) entry.draggedClick = false;
    dragClick = null;
    pointer.x = look.x;
    pointer.y = look.y;
    positionDrag = {
      id: entry?.record.id ?? specimen.id, entry, target, pointerId: event.pointerId,
      anchor, position: { ...origin }, origin: { ...origin }, active: false,
      poseTime: previousTime / 1000, bounds: positionBounds(entry, target, origin)
    };
    target.setPointerCapture(event.pointerId);
  }

  function positionBounds(entry, target, origin) {
    const pose = entry?.viewPose ?? specimen.viewPose;
    if (!pose || narrowScreen.matches) return undefined;
    const rect = target.getBoundingClientRect();
    const frame = garden.getBoundingClientRect();
    const scaleX = view.width / frame.width;
    const scaleY = view.height / frame.height;
    const halfWidth = rect.width * scaleX / 2 + 12;
    const topReach = pose.y - (rect.top - frame.top) * scaleY;
    const bottomReach = (rect.bottom - frame.top) * scaleY - pose.y;
    const offsetX = pose.x - view.width * clamp(origin.x, .08, .96);
    const offsetY = pose.y - view.height * clamp(origin.y, .22, .82);
    const header = garden.querySelector(".masthead").getBoundingClientRect();
    const headerBottom = (header.bottom - frame.top) * scaleY;
    return {
      minX: (halfWidth - offsetX) / view.width,
      maxX: (view.width - halfWidth - offsetX) / view.width,
      minY: (headerBottom + 12 + topReach - offsetY) / view.height,
      maxY: (view.height - 24 - bottomReach - offsetY) / view.height
    };
  }

  function movePositionDrag(event) {
    const gesture = positionDrag;
    if (!gesture) return;
    const point = dragPoint(event);
    if (!point || (!gesture.active && !positionMotion.moved(gesture.anchor, point, view, 6))) return;
    if (!gesture.active) {
      gesture.active = true;
      if (gesture.entry) gesture.entry.positionTransition = null;
      else specimen.positionTransition = null;
      setSelection(gesture.id, false);
      gesture.target.setAttribute("data-moving", "");
      garden.setAttribute("data-position-dragging", "");
      plant.announce("");
    }
    const position = positionMotion.move(gesture.anchor, point, view, { mobile: narrowScreen.matches, bounds: gesture.bounds });
    if (position) gesture.position = position;
  }

  function finishPositionDrag(commit) {
    const gesture = positionDrag;
    if (!gesture) return;
    const { entry, target, pointerId, active } = gesture;
    if (active) {
      dragClick = { target, until: commit ? performance.now() + 400 : Infinity };
      let saved = false;
      if (commit && entry && canGrowRecord(entry.record)) {
        // Keep the live pose until the optimistic data adapter has emitted its
        // snapshot. This avoids a one-frame jump back to the previous position.
        const result = window.GardenData.savePosition(entry.record.id, gesture.position);
        if (result) {
          entry.record = result.record;
          entry.positionTransition = null;
          entry.positionBackdropDirty = true;
          saved = true;
          plant.announce(window.GardenData.isShared
            ? result.saved ? "Position shared." : "Position saved here. Waiting to share…"
            : result.saved ? "Flower moved." : "Flower moved for this visit.");
        }
      } else if (commit && !entry) {
        specimen.position = { ...gesture.position };
        specimen.positionTransition = null;
        saved = true;
        plant.announce("Demo flower moved for this visit.");
      }
      if (!saved) {
        const owner = entry ?? specimen;
        owner.positionTransition = { from: { ...gesture.position }, start: performance.now() };
        positionReturnUntil = performance.now() + 850;
        if (commit) plant.announce("This flower returns to its saved place.");
      }
    }
    positionDrag = null;
    target.removeAttribute("data-moving");
    garden.removeAttribute("data-position-dragging");
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    if (active) sortFlowers();
  }

  function isBloomPointer(entry, event) {
    return bloomDrag?.entry === entry && bloomDrag.pointerId === event.pointerId;
  }

  function beginBloomDrag(entry, event) {
    if (event.button !== 0 || !event.isPrimary || bloomDrag) return;
    if (!canGrowRecord(entry.record)) return;
    entry.draggedClick = false;
    const openness = entry.record.appearance.openness;
    if (focus.active || selectedFlower !== entry.record.id || openness >= 1) return;
    bloomDrag = {
      entry,
      pointerId: event.pointerId,
      startY: event.clientY,
      start: openness,
      openness,
      travel: clamp(entry.target.offsetHeight, 76, 140),
      active: false,
      growth: [window.GardenData.growthPoint(openness, "mouse")]
    };
    pointer.x = look.x;
    pointer.y = look.y;
    entry.target.setPointerCapture(event.pointerId);
  }

  function moveBloomDrag(y) {
    const gesture = bloomDrag;
    const distance = gesture.startY - y;
    const threshold = 4;
    if (!gesture.active && distance <= threshold) return;
    if (!gesture.active) {
      gesture.active = true;
      gesture.entry.target.dataset.growing = "";
      plant.announce("");
    }
    const openness = clamp(gesture.start + Math.max(0, distance - threshold) / gesture.travel, 0, 1);
    const preview = Math.max(gesture.start, Math.round(openness * 100) / 100);
    gesture.openness = preview;
    const previous = gesture.growth.at(-1);
    if (preview !== previous.openness && Date.now() - Date.parse(previous.at) >= 100) {
      gesture.growth.push(window.GardenData.growthPoint(preview, "mouse"));
    }
    plant.updateDetailBloom(preview, true);
  }

  function savePlantBloom(entry, openness, options) {
    if (!canGrowRecord(entry.record)) return;
    const result = window.GardenData.saveBloom(entry.record.id, openness, options);
    if (!result) return;
    entry.record = result.record;
    entry.target.toggleAttribute("data-can-grow", result.openness < 1);
    plant.updateDetailBloom(result.openness);
    plant.updateDetailGrowth(entry.record);
    plant.announce(window.GardenData.isShared
      ? result.saved ? "Bloom shared." : "Bloom saved here. Waiting to share…"
      : result.saved ? "Bloom saved." : "Bloom updated for this visit.");
  }

  function finishBloomDrag(commit) {
    const gesture = bloomDrag;
    bloomDrag = null;
    const { entry, pointerId, active, start, openness } = gesture;
    entry.target.removeAttribute("data-growing");
    if (entry.target.hasPointerCapture(pointerId)) entry.target.releasePointerCapture(pointerId);
    if (!active) return;
    entry.draggedClick = true;
    if (commit && openness > start) savePlantBloom(entry, openness, { source: "mouse", growth: gesture.growth });
    else plant.updateDetailBloom(start);
  }

  function sortFlowers() {
    depthOrder = plants.slice().sort((a, b) => a.record.position.z - b.record.position.z || a.ordinal - b.ordinal);
    // A planted flower has priority over the large demo's broad hit area.
    // Keep depth order between the planted flowers themselves.
    flower.style.zIndex = 1;
    depthOrder.forEach((entry, index) => {
      entry.target.style.zIndex = index + 2;
    });
  }

  function nextPosition(index) {
    const spot = plantingSpots[index % plantingSpots.length];
    if (index < plantingSpots.length) return spot;
    const row = Math.floor(index / plantingSpots.length);
    const angle = row * 2.39996;
    return {
      x: clamp(spot.x + Math.sin(angle) * 0.065, 0.34, 0.96),
      y: clamp(spot.y + Math.cos(angle) * 0.07, 0.23, 0.82),
      z: clamp(spot.z + Math.sin(angle) * 0.10, -0.9, 0.92)
    };
  }

  function commitPlant(draft) {
    if (window.GardenData.status && !window.GardenData.status.ready) {
      return { error: "The shared garden is still connecting. Your flower is ready; try planting in a moment." };
    }
    const index = plants.length;
    if (draft.nickname && draft.nickname !== window.GardenData.getNickname()) {
      window.GardenData.setNickname(draft.nickname);
    }
    const record = window.GardenData.createFlower({
      ...draft,
      size: 0.39 + (index % 5) * 0.034,
      position: nextPosition(index)
    });
    if (!record) return null;
    const entry = registerPlant(record);
    sortFlowers();
    setSelection(record.id, false);
    const saved = window.GardenData.save(plants.map(plant => plant.record));
    return { target: entry.target, saved, pending: window.GardenData.isShared && !saved };
  }

  // Server snapshots update the existing scene. Keep the current presentation
  // intact during a draft, drag, focus orbit, fusion or replay.
  function receiveSnapshot(state) {
    const badge = byId("shared-state");
    if (badge) {
      badge.hidden = state.mode === "local" || state.mode === "checking";
      badge.dataset.phase = state.phase;
      badge.dataset.pending = String(Boolean(state.pending));
      const label = state.phase === "error" ? "Sync needs attention"
        : state.pending ? "Waiting to share · " + state.pending
          : state.phase === "offline" ? "Garden offline"
            : state.phase === "online" ? "Shared garden" : "Connecting…";
      if (badge.textContent !== label) badge.textContent = label;
      badge.title = state.message || "Flowers are shared with everyone using this garden.";
    }
    if (previousPending > 0 && state.pending === 0 && state.phase === "online" && !plant.draft && !focus.active) {
      plant.announce("Your flowers are shared with the garden.");
    }
    previousPending = state.pending || 0;
    plant.refreshDetailAccess?.();
    for (const entry of plants) {
      const own = canGrowRecord(entry.record);
      entry.target.toggleAttribute("data-can-grow", own && entry.record.appearance.openness < 1);
      if (own) entry.target.setAttribute("aria-keyshortcuts", "ArrowUp");
      else entry.target.removeAttribute("aria-keyshortcuts");
      if (state.mode === "shared") {
        entry.target.title = entry.record.author.name + " · " + entry.record.thought;
        entry.target.querySelector(".selection-tag").textContent = entry.record.author.name;
      }
    }
    if (!Array.isArray(state.flowers)) return;
    const signature = JSON.stringify(state.flowers);
    if (signature === snapshotSignature) return;
    snapshotSignature = signature;
    pendingSnapshot = state.flowers;
    applyPendingSnapshot();
  }

  function applyPendingSnapshot() {
    if (!pendingSnapshot || focus.active || bloomDrag || positionDrag || plant.draft) return;
    const records = pendingSnapshot;
    pendingSnapshot = null;
    const existing = new Map(plants.map(entry => [entry.record.id, entry]));
    let changed = false;
    let selectedChanged = false;
    for (const record of records) {
      let entry = existing.get(record.id);
      if (!entry) {
        entry = registerPlant(record);
        if (window.GardenData.isShared) entry.arrivedAt = performance.now();
        changed = true;
      } else if (JSON.stringify(entry.record) !== JSON.stringify(record)) {
        const old = entry.record;
        const moved = ["x", "y", "z"].some(key => old.position[key] !== record.position[key]);
        if (moved) entry.positionTransition = { from: displayedPosition(entry), start: performance.now() };
        const appearanceChanged = JSON.stringify(old.appearance) !== JSON.stringify(record.appearance);
        entry.record = record;
        if (appearanceChanged) entry.raster = null;
        changed = true;
        selectedChanged ||= selectedFlower === record.id;
      }
      const own = canGrowRecord(record);
      entry.target.toggleAttribute("data-can-grow", own && record.appearance.openness < 1);
      if (own) entry.target.setAttribute("aria-keyshortcuts", "ArrowUp");
      else entry.target.removeAttribute("aria-keyshortcuts");
      if (window.GardenData.isShared) {
        entry.target.title = record.author.name + " · " + record.thought;
        entry.target.querySelector(".selection-tag").textContent = record.author.name;
      }
    }
    if (changed) {
      sortFlowers();
      updateSceneHint();
      history.refresh?.();
      if (selectedChanged && !detailPanel.hidden) {
        const entry = plants.find(({ record }) => record.id === selectedFlower);
        const active = document.activeElement;
        plant.showDetail(entry.record, entry.ordinal, Boolean(returnToHistoryId));
        if (active?.isConnected) active.focus({ preventScroll: true });
      }
    }
  }

  function displayedPosition(entry) {
    if (positionDrag?.entry === entry && positionDrag.active) return positionDrag.position;
    const transition = entry.positionTransition;
    if (!transition || reducedMotion.matches) return entry.record.position;
    const amount = clamp((performance.now() - transition.start) / 850, 0, 1);
    if (amount === 1) { entry.positionTransition = null; entry.positionBackdropDirty = true; return entry.record.position; }
    const eased = amount * amount * (3 - 2 * amount);
    return Object.fromEntries(["x", "y", "z"].map(key => [key, mix(transition.from[key], entry.record.position[key], eased)]));
  }

  function displayedDemoPosition() {
    if (positionDrag?.id === specimen.id && positionDrag.active) return positionDrag.position;
    const transition = specimen.positionTransition;
    if (!transition || reducedMotion.matches) return specimen.position;
    const amount = clamp((performance.now() - transition.start) / 850, 0, 1);
    if (amount === 1) { specimen.positionTransition = null; return specimen.position; }
    const eased = amount * amount * (3 - 2 * amount);
    return Object.fromEntries(["x", "y", "z"].map(key => [key, mix(transition.from[key], specimen.position[key], eased)]));
  }

  function canGrowRecord(record) {
    const state = window.GardenData.status;
    if (!state || state.mode === "local") return true;
    return state.mode === "shared" && Boolean(state.ready && window.GardenData.isOwn(record));
  }

  function listFocusEntries() {
    if (!pendingSnapshot) return plants;
    const existing = new Set(plants.map(entry => entry.record.id));
    const incoming = pendingSnapshot.filter(record => !existing.has(record.id));
    // Make a just-arrived thought discoverable without moving or replacing the
    // current cinematic flower. Its normal garden target is added on return.
    return plants.concat(incoming.map((record, index) => ({ record, ordinal: plants.length + index + 1, raster: null })));
  }

  function drawMotes(time) {
    for (const mote of motes) {
      const x = mote.x * view.width + Math.sin(time * 0.23 + mote.phase) * 8 + look.x * (5 + 14 * mote.z);
      const y = mote.y * view.height + Math.cos(time * 0.21 + mote.phase) * 7 + look.y * (4 + 10 * mote.z);
      const radius = 0.65 + mote.z * 1.1;
      const opacity = 0.23 + Math.sin(time * 0.58 + mote.phase) * 0.12;
      ctx.fillStyle = "rgba(255, 216, 182, " + opacity + ")";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function flowerFootprint(x, y, size, amount, form = "cup") {
    const rise = clamp((amount - 0.56) / 0.44, 0, 1);
    const raisedRim = rise * rise * (3 - 2 * rise);
    const wide = form === "flared" ? mix(1, 1.22, amount) : form === "tall" ? 0.88 : 1;
    const tall = form === "tall" ? mix(1.16, 1.10, amount) : 1;
    const width = size * (mix(0.78, 2.08, amount) + 0.32 * raisedRim) * wide;
    const height = size * (mix(1.29, 1.18, amount) + 0.18 * raisedRim) * tall;
    const top = y - size * (mix(1.16, 0.78, amount) + 0.18 * raisedRim) * tall;
    return { x: x + size * 0.025, top, width, height };
  }

  function placeFlowerTarget(target, x, y, size, amount, form) {
    const bounds = flowerFootprint(x, y, size, amount, form);
    target.style.width = bounds.width + "px";
    target.style.height = bounds.height + "px";
    target.style.transform = "translate3d(" + (bounds.x - bounds.width / 2) + "px," + bounds.top + "px,0)";
    target.dataset.ready = "";
  }

  function bodyOpenness(openness, effect) {
    if (!effect) return openness;
    const resting = mix(openness, 1, effect.echo * 0.16);
    return mix(resting, effect.openness, effect.control);
  }

  function bodyTarget(id, pose, openness, form) {
    const displayed = id === "grow-preview" ? draftProgress : bodyOpenness(openness, bodyMotion.effect(id));
    const bounds = flowerFootprint(pose.x, pose.y, pose.size, displayed, form);
    return { ...pose, id, crownX: bounds.x, crownY: bounds.top + bounds.height * 0.5 };
  }

  function renderPlant(entry, size, x, y, yaw, pitch, openness) {
    const previous = entry.raster;
    const image = previous?.image ?? document.createElement("canvas");
    const scale = Math.min(view.scale, 1.5);
    const anchorX = size * 1.55 + 4;
    const anchorY = size * 1.42 + 4;
    const width = anchorX * 2;
    const height = anchorY + size * 1.48 + 4;
    const pixelWidth = Math.ceil(width * scale);
    const pixelHeight = Math.ceil(height * scale);
    if (image.width !== pixelWidth) image.width = pixelWidth;
    if (image.height !== pixelHeight) image.height = pixelHeight;
    const buffer = image.getContext("2d");
    buffer.setTransform(scale, 0, 0, scale, 0, 0);
    buffer.clearRect(0, 0, pixelWidth / scale, pixelHeight / scale);
    const backdrop = view.backdrop && {
      ...view.backdrop,
      x: view.backdrop.x - x + anchorX,
      y: view.backdrop.y - y + anchorY
    };
    window.GardenFlower.draw(buffer, {
      x: anchorX, y: anchorY, size, yaw, pitch, backdrop,
      openness,
      appearance: entry.record.appearance, detail: "reduced"
    });
    entry.raster = { image, anchorX, anchorY, width, height, size, scale, yaw, pitch, openness, backdrop: Boolean(backdrop) };
    entry.positionBackdropDirty = false;
  }

  function plantedPose(entry, baseSize, time, mobile) {
    const { appearance } = entry.record;
    const position = displayedPosition(entry);
    const depth = clamp(position.z, -1, 1);
    const normalizedX = clamp(position.x, 0.08, 0.96);
    const normalizedY = clamp(position.y, 0.22, 0.82);
    const poseTime = positionDrag?.entry === entry ? positionDrag.poseTime : time;
    const sway = reducedMotion.matches ? 0 : Math.sin(poseTime * 1.15 + entry.ordinal * 2.4);
    const x = view.width * normalizedX + look.x * (12 + depth * 14) + sway * 1.15;
    const yPosition = mobile ? Math.max(0.40, 0.56 + (normalizedY - 0.49) * 0.85) : normalizedY;
    const y = view.height * yPosition + look.y * (9 + depth * 9) + sway * 0.55;
    const size = Math.max(12, Math.round(baseSize * clamp(appearance.size, 0.18, 0.69) * (1 + depth * 0.22)));
    return { x, y, size, yaw: look.x * (0.23 + depth * 0.05), pitch: look.y * (0.17 + depth * 0.04) };
  }

  function drawPlant(entry, baseSize, time, mobile) {
    const { appearance } = entry.record;
    const growing = bloomDrag?.active && bloomDrag.entry === entry;
    const effect = bodyMotion.effect(entry.record.id);
    const preview = bodyOpenness(appearance.openness, effect);
    const live = !growing && effect && bodyMotion.primaryId === entry.record.id;
    const openness = growing ? bloomDrag.openness
      : live ? preview : effect ? Math.round(preview * 120) / 120 : appearance.openness;
    const { x, y, size, yaw, pitch } = plantedPose(entry, baseSize, time, mobile);
    entry.viewPose = { x, y, size };
    if (live) {
      const stem = size * 0.84;
      ctx.save();
      ctx.translate(x, y + stem + effect.pitch * size * 0.48);
      ctx.rotate(effect.sway);
      ctx.translate(-x, -y - stem);
      window.GardenFlower.draw(ctx, {
        x, y, size, time, openness, appearance, backdrop: view.backdrop, detail: "reduced", yaw, pitch
      });
      ctx.restore();
      placeFlowerTarget(entry.target, x, y, size, openness, appearance.form);
      return;
    }
    const raster = entry.raster;
    const stale = !raster || entry.positionBackdropDirty || raster.openness !== openness || raster.size !== size || raster.scale !== Math.min(view.scale, 1.5)
      || raster.backdrop !== Boolean(view.backdrop) || Math.abs(raster.yaw - yaw) > 0.105
      || Math.abs(raster.pitch - pitch) > 0.085;

    // Reserve the single secondary refresh for a flower being grown.
    if (stale && refreshAvailable && (!bloomDrag?.active || growing)) {
      renderPlant(entry, size, x, y, yaw, pitch, openness);
      refreshAvailable = false;
    }
    if (!entry.raster) return;
    const { image, anchorX, anchorY, width, height } = entry.raster;
    const ratio = size / entry.raster.size;
    if (effect && (Math.abs(effect.sway) > 0.002 || Math.abs(effect.pitch) > 0.002)) {
      const stem = size * 0.84;
      ctx.save();
      ctx.translate(x, y + stem + effect.pitch * size * 0.48);
      ctx.rotate(effect.sway);
      ctx.drawImage(image, -anchorX * ratio, -stem - anchorY * ratio, width * ratio, height * ratio);
      ctx.restore();
    } else ctx.drawImage(image, x - anchorX * ratio, y - anchorY * ratio, width * ratio, height * ratio);
    if (!plant.draft && !focus.active) placeFlowerTarget(entry.target, x, y, size, openness, appearance.form);
  }

  function drawPlantLayer(behind, size, time, mobile, session, draft) {
    for (const entry of depthOrder) {
      if ((entry.record.position.z < 0) !== behind) continue;
      const subject = session?.entry === entry;
      const connectionPose = session?.group?.frames.get(entry.record.id);
      ctx.globalAlpha = session?.group
        ? session.ambient * (1 - (connectionPose?.weight ?? 0))
        : session ? (subject ? 1 - session.liveWeight : session.ambient) : (draft ? 0.43 : 1);
      if (entry.arrivedAt && !reducedMotion.matches) {
        const arrival = clamp((performance.now() - entry.arrivedAt) / 850, 0, 1);
        ctx.globalAlpha *= arrival * arrival * (3 - 2 * arrival);
        if (arrival === 1) entry.arrivedAt = null;
      }
      if (ctx.globalAlpha > 0) drawPlant(entry, size, subject || connectionPose ? session.poseTime : time, mobile);
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    applyPendingSnapshot();
    updateAnimation(now);
    const session = focus.update(now);
    const elapsed = clamp(now - previousTime, 0, 50);
    previousTime = now;
    const follow = 1 - Math.exp(-elapsed / 120);
    if (!session && !positionDrag && now >= positionReturnUntil) {
      look.x = mix(look.x, pointer.x, follow);
      look.y = mix(look.y, pointer.y, follow);
    }

    const approach = session?.amount ?? 0;
    const sceneryX = look.x * 4 - approach * 9;
    const sceneryY = look.y * 3 + approach * 12;
    landscape.style.transform = "translate3d(" + sceneryX + "px," + sceneryY + "px,0)";
    if (view.backdrop) {
      view.backdrop.x = view.backdrop.left + sceneryX;
      view.backdrop.y = view.backdrop.top + sceneryY;
    }
    foreground.style.transform = "translate3d(" + (look.x * 17 - approach * 11) + "px," + (look.y * 12 + approach * 12) + "px,0)";
    foreground.style.opacity = String(1 - 0.79 * approach);
    focusShade.style.opacity = String(approach);
    ctx.clearRect(0, 0, view.width, view.height);
    const time = reducedMotion.matches ? 0 : now / 1000;
    ctx.globalAlpha = 1 - 0.58 * approach;
    drawMotes(time);
    ctx.globalAlpha = 1;

    const mobile = narrowScreen.matches;
    const size = mobile
      ? Math.min(view.width * 0.34, view.height * 0.21, 185)
      : Math.min(view.width * 0.163, view.height * 0.28, 242);
    const demoPosition = displayedDemoPosition();
    const demo = {
      x: view.width * (mobile ? demoPosition.x - .07 : demoPosition.x) + look.x * 12,
      y: view.height * (mobile ? demoPosition.y + .07 : demoPosition.y) + look.y * 9,
      size
    };
    specimen.viewPose = demo;
    const scene = { width: view.width, height: view.height, mobile, demo };
    if (session) {
      scene.planted = entry => plantedPose(entry, size, session.poseTime, mobile);
      focus.placeConnections(scene);
    }
    const draft = plant.draft;
    const growingDraft = plant.step === "grow";
    const preview = draft && {
      x: view.width * (mobile ? 0.5 : view.width <= 1020 ? 0.38 : 0.48) + look.x * 12,
      y: view.height * (mobile ? 0.34 : 0.53) + look.y * 9,
      size: size * (mobile ? 0.79 : view.width <= 1020 ? 0.72 : 0.88)
    };
    const bodyContext = session || !historyPanel.hidden || !detailPanel.hidden || (draft && !growingDraft)
      ? "blocked" : growingDraft ? "grow" : "garden";
    body.setContext(bodyContext);
    if (body.active || bodyMotion.visible) {
      const targets = bodyContext === "blocked" || bloomDrag?.active || positionDrag?.active ? []
        : growingDraft ? [bodyTarget("grow-preview", preview, draft.openness, draft.form)]
          : [bodyTarget(specimen.id, demo, specimen.openness), ...plants.map(entry => {
            const { id, appearance } = entry.record;
            return bodyTarget(id, plantedPose(entry, size, time, mobile), appearance.openness, appearance.form);
          })];
      bodyMotion.update(targets, body.read(now), view.width, view.height, now, elapsed, reducedMotion.matches);
      body.display(bodyMotion.position);
    }
    refreshAvailable = true;
    if (bodyLiveId && bodyLiveId !== bodyMotion.primaryId && !session && !draft) {
      const retiring = plants.find(entry => entry.record.id === bodyLiveId);
      if (retiring) {
        const pose = plantedPose(retiring, size, time, mobile);
        const appearance = retiring.record.appearance;
        const opening = bodyOpenness(appearance.openness, bodyMotion.effect(bodyLiveId));
        // Hand off the current bloom before another cached flower claims the refresh.
        renderPlant(retiring, pose.size, pose.x, pose.y, pose.yaw, pose.pitch,
          Math.round(opening * 120) / 120);
        refreshAvailable = false;
      }
    }
    bodyLiveId = session || draft ? null : bodyMotion.primaryId;
    drawPlantLayer(true, size, time, mobile, session, draft);

    if (draft) {
      const effect = bodyMotion.effect("grow-preview");
      if (growingDraft && Number.isFinite(effect?.handBloom)) {
        plant.setHandBloom(mix(draft.openness, effect.handBloom, effect.control));
      }
      const targetProgress = plant.step === "style" ? 0.50 : growingDraft ? draft.openness : 0;
      draftProgress = reducedMotion.matches ? targetProgress : mix(draftProgress, targetProgress, 1 - Math.exp(-elapsed / 65));
      window.GardenFlower.draw(ctx, {
        ...preview, time, openness: draftProgress, appearance: draft, backdrop: view.backdrop,
        yaw: look.x * 0.23 + (effect?.sway ?? 0), pitch: look.y * 0.17 + (effect?.pitch ?? 0)
      });
      if (growingDraft) {
        placeFlowerTarget(growTarget, preview.x, preview.y, preview.size, draftProgress, draft.form);
      }
    } else if (!session || session.entry) {
      ctx.globalAlpha = session ? session.ambient * mix(1, mobile ? 0.23 : 0.65, approach) : 1;
      const effect = bodyMotion.effect(specimen.id);
      const openness = bodyOpenness(specimen.openness, effect);
      window.GardenFlower.draw(ctx, {
        ...demo, time, selected: selectedFlower === specimen.id, openness, backdrop: view.backdrop,
        yaw: look.x * 0.23 + (effect?.sway ?? 0), pitch: look.y * 0.17 + (effect?.pitch ?? 0),
        detail: session && session.ambient < 0.55 ? "reduced" : "full"
      });
      ctx.globalAlpha = 1;
      if (!session) placeFlowerTarget(flower, demo.x, demo.y, size, openness);
    }

    drawPlantLayer(false, size, time, mobile, session, draft);
    if (bodyMotion.visible) bodyMotion.paint(ctx, view.width, view.height, now, reducedMotion.matches);
    if (session) {
      const source = session.entry ? scene.planted(session.entry) : demo;
      window.GardenFocus.draw(ctx, session, source, scene, time, view.backdrop);
    }
    requestAnimationFrame(draw);
  }

  range.addEventListener("input", () => {
    stopPlayback();
    setBloom(Number(range.value) / 100);
  });

  for (const stage of stages) {
    stage.addEventListener("click", () => goToStage(Number(stage.dataset.bloom)));
  }

  reset.addEventListener("click", () => goToStage(0));
  play.addEventListener("click", () => {
    if (animation?.type === "play") {
      animation = null;
      canResume = true;
    } else {
      if (!canResume) {
        playbackTime = 0;
        setBloom(0);
      }
      animation = { type: "play", start: performance.now() - playbackTime };
      canResume = false;
    }
    updatePlaybackButton();
  });

  garden.addEventListener("pointermove", (event) => {
    if (!parallax || focus.active || bloomDrag || positionDrag || performance.now() < positionReturnUntil || event.pointerType === "touch" || event.target.closest(".dock, .masthead, #plant-panel, #flower-detail, #history-panel, #body-panel, #grow-target[data-dragging]")) return;
    const bounds = garden.getBoundingClientRect();
    pointer.x = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    pointer.y = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
  });
  garden.addEventListener("pointerleave", () => {
    if (!focus.active && !bloomDrag && !positionDrag && performance.now() >= positionReturnUntil) pointer.x = pointer.y = 0;
  });
  camera.addEventListener("click", () => setParallax(!parallax));
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) setParallax(false);
  });

  flower.setAttribute("data-can-move", "");
  bindGardenDrag(flower);
  flower.addEventListener("click", (event) => focusFlower(null, event));
  garden.addEventListener("pointerdown", () => {
    if (!positionDrag) dragClick = null;
  }, true);
  garden.addEventListener("click", event => {
    if (!dragClick || event.detail === 0) return;
    const previous = dragClick;
    dragClick = null;
    if (performance.now() > previous.until) return;
    if (event.target !== garden && !event.target.closest(".flower-target")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  garden.addEventListener("click", (event) => {
    if (!focus.active && event.target === garden) {
      history.close(false);
      setSelection(null);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (focus.active) {
      if (event.key === "Escape") focus.leave();
      return;
    }
    if (event.key === "Escape" && positionDrag) {
      event.preventDefault();
      finishPositionDrag(false);
      return;
    }
    if (event.key === "ArrowUp" && !event.repeat && !bloomDrag && !positionDrag && !plant.draft) {
      const entry = plants.find(({ record }) => record.id === selectedFlower);
      if (entry && canGrowRecord(entry.record)
        && (event.target === entry.target || event.target === byId("detail-title"))) {
        const openness = entry.record.appearance.openness;
        if (openness < 1) {
          event.preventDefault();
          savePlantBloom(entry, Math.min(1, (Math.round(openness * 100) + 10) / 100), { source: "keyboard" });
        }
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (bloomDrag) {
      finishBloomDrag(false);
      return;
    }
    if (plant.close() || history.close()) return;
    if (returnToHistoryId) reopenHistory();
    else if (!byId("flower-detail").hidden) dismissDetail();
    else setSelection(null);
  });
  window.addEventListener("blur", () => {
    if (positionDrag) finishPositionDrag(false);
    if (bloomDrag) finishBloomDrag(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && positionDrag) finishPositionDrag(false);
    if (document.hidden && bloomDrag) finishBloomDrag(false);
  });

  // Reuse the embedded backdrop for the light passing through the petals.
  const backgroundURL = getComputedStyle(landscape).backgroundImage.match(/^url\(["']?(data:image\/jpeg;base64,[A-Za-z0-9+/=]+)["']?\)$/);
  if (backgroundURL) {
    gardenImage.addEventListener("load", fitBackdrop, { once: true });
    gardenImage.src = backgroundURL[1];
  }

  new ResizeObserver(resize).observe(garden);
  resize();
  for (const record of window.GardenData.load()) registerPlant(record);
  window.GardenData.subscribe?.(receiveSnapshot);
  sortFlowers();
  flower.hidden = false;
  setBloom(specimen.openness);
  updateSceneHint();
  setParallax(parallax);
  requestAnimationFrame(draw);
})();
