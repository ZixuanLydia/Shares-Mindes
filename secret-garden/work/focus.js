// The focus camera orbits a single live flower. The scene and saved flower data
// stay at their original coordinates while the presentation runs.
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const duration = 2000;
  const visibleConnections = 4;
  const layouts = [[1], [0, 2], [0, 1, 2], [0, 1, 2, 3]];
  const motion = window.GardenConnectionMotion;
  const dragMotion = window.GardenConnectionDrag;
  const TAU = Math.PI * 2;
  const clamp = (amount) => Math.min(1, Math.max(0, amount));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smooth = (amount) => {
    const t = clamp(amount);
    return t * t * (3 - 2 * t);
  };
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const motes = [
    [0.27, 0.29, 0.9], [0.72, 0.57, 1.1], [1.46, 0.39, 0.7], [2.12, 0.64, 1.3],
    [3.03, 0.44, 0.9], [3.74, 0.30, 0.8], [4.81, 0.53, 1.2], [5.64, 0.69, 0.7]
  ];

  function setup({ garden, reducedMotion, onRestore, listEntries }) {
    const view = byId("focus-view");
    const back = byId("focus-back");
    const reading = view.querySelector(".focus-reading");
    const thought = byId("focus-thought");
    const meta = byId("focus-meta");
    const keywords = byId("focus-keywords");
    const connections = byId("focus-connections");
    const status = byId("focus-connection-status");
    const related = byId("focus-related");
    const relatedWords = byId("focus-related-words");
    const relatedList = byId("focus-related-list");
    const hitLayer = byId("focus-connection-targets");
    const fusionReading = byId("focus-fusion");
    const fusionThought = byId("focus-fusion-thought");
    const fusionFirst = byId("focus-fusion-first");
    const fusionFirstMeta = byId("focus-fusion-first-meta");
    const fusionSecond = byId("focus-fusion-second");
    const fusionSecondMeta = byId("focus-fusion-second-meta");
    const fusionSplit = byId("focus-fusion-split");
    const fusionAnnouncement = byId("focus-fusion-announcement");
    const gardenControls = [
      garden.querySelector(".masthead"), garden.querySelector(".intro"), byId("scene-hint"),
      garden.querySelector(".flower-hit-layer"), byId("demo-controls")
    ];
    let current = null;
    let scene = null;
    let hits = new Map();
    let blankStart = null;
    let searchVersion = 0;
    const vectors = new Map();
    const indexedThoughts = new Map();
    const drag = dragMotion.create(garden, reducedMotion, showFusion);
    const replay = window.GardenReplay.setup({ reducedMotion });

    function attribution(record) {
      return record.author.name + " · " + dateFormat.format(new Date(record.createdAt));
    }

    function showFusion(partnerId) {
      const record = current?.entry?.record;
      const link = current?.group?.links.find(({ entry }) => entry.record.id === partnerId);
      const joined = Boolean(record && link);
      const wasJoined = !fusionReading.hidden;
      view.toggleAttribute("data-fused", joined);
      fusionReading.hidden = !joined;
      if (!joined) {
        blankStart = null;
        fusionAnnouncement.textContent = wasJoined ? "Flowers separated." : "";
        return;
      }

      const partner = link.entry.record;
      const sentence = window.GardenConnections.compose(record.thought, partner.thought, link.relation);
      fusionThought.textContent = sentence;
      fusionFirst.textContent = record.thought;
      fusionFirstMeta.textContent = attribution(record);
      fusionSecond.textContent = partner.thought;
      fusionSecondMeta.textContent = attribution(partner);
      fusionAnnouncement.textContent = sentence;
      reading.scrollTop = 0;
    }

    function isGardenBlank(event) {
      if (event.target !== garden || !current?.group || current.returning || !scene) return false;
      const rect = garden.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const x = (event.clientX - rect.left) * scene.width / rect.width;
      const y = (event.clientY - rect.top) * scene.height / rect.height;
      if (x < 0 || y < 0 || x > scene.width || y > scene.height) return false;
      const frames = current.group.frames;
      for (const pose of frames.values()) {
        if (pose.weight <= 0) continue;
        const owner = frames.get(pose.fusionOwner);
        const amount = owner?.fusion?.amount ?? 0;
        const crownX = owner ? mix(pose.x, owner.x, amount) : pose.x;
        const crownY = owner ? mix(pose.y, owner.y, amount) : pose.y;
        const scale = owner ? mix(1, (owner.size / owner.camera.distance) / (pose.size / pose.camera.distance), smooth(amount)) : 1;
        if (Math.hypot(x - crownX, y - crownY) <= dragMotion.radiusOf(pose) * scale + 7) return false;
      }
      return true;
    }

    garden.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      const partnerId = drag.fusedId;
      blankStart = partnerId && isGardenBlank(event)
        ? { partnerId, pointerId: event.pointerId, x: event.clientX, y: event.clientY } : null;
    }, true);
    garden.addEventListener("pointercancel", event => {
      if (blankStart?.pointerId === event.pointerId) blankStart = null;
    }, true);
    garden.addEventListener("click", event => {
      const start = blankStart;
      blankStart = null;
      if (!start || event.detail === 0 || start.partnerId !== drag.fusedId || !isGardenBlank(event)) return;
      if (event.pointerId > 0 && start.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) drag.split();
    });
    fusionSplit.addEventListener("click", () => {
      if (drag.split()) connections.focus({ preventScroll: true });
    });

    function writeThought(entry) {
      const record = entry?.record;
      thought.textContent = record?.thought ?? "Demo flower";
      meta.textContent = record ? attribution(record) : "";
      keywords.replaceChildren(...(record?.associations ?? []).map((word) => {
        const item = document.createElement("li");
        item.textContent = word;
        return item;
      }));
      status.textContent = "";
      fusionAnnouncement.textContent = "";
      reading.scrollTop = 0;
    }

    function arrive() {
      garden.dataset.focusPhase = "focused";
      connections.disabled = Boolean(current.searching);
      view.setAttribute("data-ready", "");
      if (current.replay) replay.arrive();
      if (current.keyboard) thought.focus({ preventScroll: true });
    }

    function enter(subject) {
      if (current) return;
      writeThought(subject.entry);
      showLinks([], false);
      connections.disabled = true;
      const instant = reducedMotion.matches;
      current = {
        ...subject,
        raw: instant ? 1 : 0,
        amount: instant ? 1 : 0,
        lastTime: performance.now(),
        returning: false,
        expanded: false,
        reducedMotion: reducedMotion.matches,
        group: null,
        sprites: new Map()
      };
      connections.hidden = Boolean(subject.replay);
      if (subject.replay) {
        replay.open(subject.entry.record);
        current.replayOpenness = replay.openness;
      }
      garden.dataset.focusPhase = "entering";
      view.hidden = false;
      for (const control of gardenControls) control.inert = true;
      back.focus({ preventScroll: true });
      if (instant) arrive();
    }

    function completeReturn() {
      const subject = current;
      cancelSearch();
      drag.clear();
      replay.close();
      current = null;
      view.hidden = true;
      view.removeAttribute("data-switching");
      showLinks([], false);
      delete garden.dataset.focusPhase;
      for (const control of gardenControls) control.inert = false;
      onRestore(subject);
    }

    function leave() {
      if (!current || current.returning) return false;
      cancelSearch();
      if (current.group && scene) setArrangement(visiblePoses(), [], "return");
      current.returning = true;
      current.lastTime = performance.now();
      garden.dataset.focusPhase = "returning";
      view.removeAttribute("data-ready");
      view.removeAttribute("data-switching");
      status.textContent = "";
      if (reducedMotion.matches) completeReturn();
      else back.focus({ preventScroll: true });
      return true;
    }

    function update(now) {
      if (!current) return null;
      const elapsed = Math.min(50, Math.max(0, now - current.lastTime));
      current.lastTime = now;
      current.frameDelta = elapsed;
      current.reducedMotion = reducedMotion.matches;
      if (current.group) current.group.elapsed = Math.min(current.group.travel, current.group.elapsed + elapsed);
      const previous = current.raw;
      current.raw = clamp(previous + (current.returning ? -elapsed : elapsed) / duration);
      current.amount = 0.5 - 0.5 * Math.cos(Math.PI * current.raw);
      current.liveWeight = current.entry ? smooth(current.amount / 0.055) : 1;
      current.ambient = mix(1, 0.17, smooth(current.amount / 0.88));
      if (current.returning && current.raw === 0) {
        completeReturn();
        return null;
      }
      if (!current.returning) {
        if (previous < 0.83 && current.raw >= 0.83) view.setAttribute("data-ready", "");
        if (current.raw === 1 && previous !== 1) arrive();
      }
      if (current.replay) {
        current.replayOpenness = replay.update(current.raw === 1 && !current.returning ? elapsed : 0);
      }
      return current;
    }

    back.addEventListener("click", leave);
    function findLinks(entry, semantic = true) {
      const entries = listEntries();
      const byRecordId = new Map(entries.map(item => [item.record.id, item]));
      const records = entries.map(item => item.record);
      const matches = semantic
        ? window.GardenConnections.rank(entry?.record, records, { vectors, limit: entries.length })
        : window.GardenConnections.match(entry?.record, records, entries.length);
      return matches.map(match => ({ ...match, entry: byRecordId.get(match.record.id) }));
    }

    function cancelSearch() {
      searchVersion += 1;
      if (current) current.searching = false;
      connections.removeAttribute("aria-busy");
      status.removeAttribute("data-searching");
      connections.disabled = false;
    }

    async function indexThoughts(entries) {
      const missing = entries.filter(({ record }) => indexedThoughts.get(record.id) !== record.thought);
      if (!missing.length) return;
      const texts = [...new Set(missing.map(({ record }) => record.thought))];
      const result = await window.GardenSemantic.embed(texts);
      if (result.length !== texts.length) throw new Error("Incomplete semantic index.");
      const byThought = new Map(texts.map((text, index) => [text, result[index]]));
      for (const { record } of missing) {
        const vector = byThought.get(record.thought);
        if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) throw new Error("Invalid semantic index.");
        vectors.set(record.id, vector);
        indexedThoughts.set(record.id, record.thought);
      }
    }

    async function discoverConnections() {
      if (!current || current.raw < 1 || current.returning || current.replay || !scene || current.searching) return;
      if (!current.entry) {
        status.textContent = "Plant a thought, then open its flower to find connections.";
        return;
      }
      if (current.expanded) {
        cancelSearch();
        current.expanded = false;
        setArrangement(visiblePoses(), [], "hide");
        writeThought(current.entry);
        showLinks([], false);
        view.removeAttribute("data-switching");
        return;
      }
      const entries = listEntries();
      if (entries.length < 2) {
        status.textContent = "Plant one more thought to let the flowers find each other.";
        return;
      }
      const session = current;
      const id = session.id;
      const version = ++searchVersion;
      const isCurrent = () => current === session && current.id === id && !current.returning && version === searchVersion;
      current.searching = true;
      connections.disabled = true;
      connections.setAttribute("aria-busy", "true");
      connections.textContent = "Finding connections…";
      status.setAttribute("data-searching", "");
      status.textContent = "Understanding the thoughts in your garden…";
      const unsubscribe = window.GardenSemantic?.subscribe(state => {
        if (!isCurrent()) return;
        if (state.phase === "loading") status.textContent = "Waking the garden’s memory…";
        if (state.phase === "embedding") status.textContent = "Listening for thoughts with a similar meaning…";
      });
      let semantic = true;
      try {
        await indexThoughts(entries);
        // A second gardener may plant while the first model is waking up.
        // Include the latest arrival once, without changing the current orbit.
        if (isCurrent()) await indexThoughts(listEntries());
      } catch (error) {
        semantic = false;
        console.warn("Local semantic matching unavailable:", error.message);
      } finally {
        unsubscribe?.();
      }
      if (!isCurrent()) return;
      current.searching = false;
      current.connectionMethod = semantic ? "semantic" : "keywords";
      connections.disabled = false;
      connections.removeAttribute("aria-busy");
      status.removeAttribute("data-searching");
      const links = findLinks(current.entry, semantic);
      if (!links.length) {
        connections.textContent = "Find Connections";
        status.textContent = semantic
          ? "These thoughts are still growing apart. A new thought may bring them together."
          : "Meaning matching is unavailable. No shared keywords were found; you can try again.";
        return;
      }
      current.expanded = true;
      showLinks(links, true);
      setArrangement(visiblePoses(), links, "gather");
    }

    function showLinks(links, expanded) {
      related.hidden = !expanded || links.length === 0;
      keywords.hidden = !related.hidden;
      connections.setAttribute("aria-expanded", String(!related.hidden));
      connections.textContent = expanded ? "Hide Connections" : "Find Connections";
      status.textContent = expanded && links.length > visibleConnections
        ? "The four closest matches are gathered here." : "";
      if (expanded && current?.connectionMethod === "semantic") {
        status.textContent = "Connected by meaning. Closer flowers share a stronger connection.";
      } else if (expanded && current?.connectionMethod === "keywords") {
        status.textContent = "Meaning matching is unavailable. Showing shared-keyword connections.";
      }
      byId("focus-shared-title").textContent = current?.connectionMethod === "semantic" ? "Shared threads" : "Shared keywords";
      const shared = [...new Set(links.flatMap(link => link.words))];
      relatedWords.replaceChildren(...shared.map(word => {
        const item = document.createElement("li");
        item.textContent = word;
        return item;
      }));

      relatedList.replaceChildren();
      hitLayer.replaceChildren();
      hits = new Map();
      if (!expanded) return;
      for (const [index, { entry, words, relation, method }] of links.entries()) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "focus-related-row";
        const title = document.createElement("span");
        title.className = "focus-related-title";
        title.textContent = entry.record.thought;
        const detail = document.createElement("span");
        detail.className = "focus-related-meta";
        const owner = window.GardenData?.isShared ? entry.record.author.name + " · " : "";
        detail.textContent = owner + (method === "semantic" ? relation?.summary || "A related thought" : words.join(" · "));
        row.append(title, detail);
        row.addEventListener("click", (event) => chooseFlower(entry, event.detail === 0));
        relatedList.append(row);
        if (index >= visibleConnections) continue;

        const hit = document.createElement("button");
        hit.type = "button";
        hit.className = "connection-flower";
        hit.hidden = true;
        hit.setAttribute("aria-label", "Focus related flower: " + entry.record.thought);
        if (window.GardenData?.isShared) hit.title = entry.record.author.name + " · " + entry.record.thought;
        hit.setAttribute("aria-describedby", "focus-drag-hint");
        drag.bind(hit, entry.record.id, () => {
          if (!current?.expanded || current.returning || !current.group || !scene) return null;
          return { scene, frames: current.group.frames, hubId: current.id };
        }, event => chooseFlower(entry, event.detail === 0));
        hitLayer.append(hit);
        hits.set(entry.record.id, hit);
      }
    }

    function visiblePoses() {
      if (current.group) return current.group.frames;
      const source = current.entry ? scene.planted(current.entry) : scene.demo;
      return new Map([[current.id, focusPose(current, source, scene)]]);
    }

    function setArrangement(shown, links, phase, keyboard = false) {
      const fusedHub = [...shown.values()].find(pose => pose.fusion);
      drag.clear();
      const goals = new Map();
      if (phase !== "return") {
        goals.set(current.id, { entry: current.entry, role: phase === "hide" ? "single" : "hub" });
        const gathered = links.slice(0, visibleConnections);
        const slots = layouts[gathered.length - 1];
        gathered.forEach(({ entry, strength }, index) => goals.set(entry.record.id, { entry, role: "satellite", slot: slots[index], strength }));
      }
      for (const [id, pose] of shown) {
        if (!goals.has(id)) goals.set(id, { entry: pose.entry, role: "garden" });
      }
      const tracks = new Map();
      for (const [id, goal] of goals) {
        const pose = shown.get(id) ?? motion.gardenPose(goal.entry, scene);
        const incoming = pose.weight === 0 && goal.role === "satellite";
        const delay = incoming ? 0.07 + clamp((1 - pose.depth) / 2) * 0.13 : 0;
        tracks.set(id, { goal, from: motion.capture(pose, scene), delay });
      }
      const travel = phase === "return" ? duration : phase === "gather" ? 1580 : phase === "switch" ? 1200 : 1050;
      current.group = {
        phase, tracks, links, keyboard, travel,
        elapsed: reducedMotion.matches ? travel : 0,
        frames: shown,
        split: fusedHub && { hubId: fusedHub.entry.record.id, ...fusedHub.fusion },
        pendingText: phase === "switch"
      };
    }

    function chooseFlower(entry, keyboard) {
      if (!current?.expanded || current.returning || current.id === entry.record.id || !scene) return;
      const shown = visiblePoses();
      const initialPose = scene.planted(entry);
      current.id = entry.record.id;
      current.entry = entry;
      current.openness = entry.record.appearance.openness;
      current.yaw = entry.raster?.yaw ?? initialPose.yaw;
      current.pitch = entry.raster?.pitch ?? initialPose.pitch;
      current.fromHistory = false;
      current.keyboard = keyboard;
      setArrangement(shown, findLinks(entry, current.connectionMethod === "semantic"), "switch", keyboard);
      view.setAttribute("data-switching", "");
    }

    function placeConnections(frameScene) {
      scene = frameScene;
      const group = current?.group;
      if (!group) return;
      const progress = clamp(group.elapsed / group.travel);
      const frames = new Map();
      for (const [id, { goal, from, delay }] of group.tracks) {
        const { entry, role, slot, strength } = goal;
        const end = role === "garden" ? motion.gardenPose(entry, scene)
          : role === "single" ? focusPose(current, scene.planted(entry), scene) : motion.clusterPose(entry, scene, slot ?? null, strength);
        const pose = motion.place(from, end, progress, delay, scene);
        if (pose.weight > 0 || role !== "garden") frames.set(id, pose);
      }
      if (group.split) {
        const { hubId, partnerId, amount, contactAngle, light } = group.split;
        const remain = 1 - smooth(group.elapsed / dragMotion.splitDuration);
        if (remain > 0) dragMotion.joinFrames(frames, hubId, partnerId, amount * remain, contactAngle, light * remain);
        else group.split = null;
      }
      drag.apply(frames, current.id, scene, current.frameDelta ?? 0);
      group.frames = frames;

      if (group.pendingText && progress >= 0.43) {
        const focusWasOnLink = related.contains(document.activeElement) || hitLayer.contains(document.activeElement);
        writeThought(current.entry);
        showLinks(group.links, current.expanded);
        group.pendingText = false;
        view.removeAttribute("data-switching");
        if (group.keyboard || focusWasOnLink) thought.focus({ preventScroll: true });
      }

      for (const [id, hit] of hits) {
        const pose = frames.get(id);
        const satellite = group.tracks.get(id)?.goal.role === "satellite";
        hit.hidden = !pose || !satellite || pose.weight < 0.85 || progress < 0.60 || current.returning;
        if (hit.hidden) continue;
        const form = pose.entry.record.appearance.form;
        const footprint = form === "flared" ? 1.32 : form === "tall" ? 1.01 : 1.15;
        const radius = Math.max(22, pose.size * 5.8 / pose.camera.distance * footprint);
        const owner = frames.get(pose.fusionOwner);
        const fusion = owner?.fusion?.amount ?? 0;
        const x = owner ? mix(pose.x, owner.x, fusion) : pose.x;
        const y = owner ? mix(pose.y, owner.y, fusion) : pose.y;
        hit.toggleAttribute("data-fusing", fusion > 0.25);
        hit.style.width = 2.06 * radius + "px";
        hit.style.height = 2.02 * radius + "px";
        hit.style.transform = "translate3d(" + (x - 1.03 * radius) + "px," + (y - radius) + "px,0)";
      }
      if (group.phase === "hide" && progress === 1) current.group = null;
    }

    connections.addEventListener("click", discoverConnections);

    return {
      get active() { return Boolean(current); },
      enter, leave, update, placeConnections
    };
  }

  function focusPose(session, source, viewport) {
    const amount = session.amount;
    const orbit = amount * (0.86 + 0.14 * amount);
    const { width, height, mobile } = viewport;
    const appearance = session.entry?.record.appearance;
    const radiusFactor = appearance?.form === "flared" ? 1.41 : appearance?.form === "tall" ? 1.02 : 1.21;
    const finalDistance = 3.65;
    const radius = mobile ? Math.min(width * 0.37, height * 0.198) : Math.min(width * 0.194, height * 0.315);
    const finalSize = radius * finalDistance / (5.8 * radiusFactor);
    const x = mix(source.x, width * (mobile ? 0.50 : 0.353), amount);
    const y = mix(source.y, height * (mobile ? 0.341 : 0.501), amount)
      - Math.sin(Math.PI * amount) * Math.min(22, height * 0.03);
    const size = mix(source.size, finalSize, amount);
    const distance = mix(5.8, finalDistance, amount);
    const camera = {
      azimuth: -0.43 + session.yaw + 0.24 * Math.sin(amount * Math.PI * 0.5),
      elevation: mix(0.50 + session.pitch, Math.PI * 0.488, orbit),
      distance
    };
    const firstBloom = mix(session.openness, Math.max(0.5, session.openness), smooth(amount / 0.32));
    const openness = session.replay
      ? mix(session.openness, session.replayOpenness, smooth(amount))
      : mix(firstBloom, 1, smooth((amount - 0.15) / 0.79));
    if (session.replay) {
      // Keep closed petals readable, then rise with the recorded bloom.
      const bloomView = smooth(clamp((session.replayOpenness - 0.08) / 0.72));
      const replayElevation = mix(0.72, Math.PI * 0.488, bloomView);
      camera.elevation = mix(0.50 + session.pitch, replayElevation, orbit);
    }
    return {
      entry: session.entry, x, y, size, openness, camera, focus: amount,
      light: smooth((amount - 0.61) / 0.39) * (session.replay ? smooth(clamp((openness - 0.32) / 0.68)) : 1),
      weight: session.liveWeight, opacity: 1, depth: 1
    };
  }

  function paintFocus(ctx, pose, time, backdrop, detail = "full") {
    const { x, y, size, openness, camera, focus, light } = pose;
    const appearance = pose.entry?.record.appearance;
    const screenSize = size * 5.8 / camera.distance;
    ctx.save();
    ctx.globalAlpha = pose.weight * pose.opacity;
    if (light > 0) {
      const radius = screenSize * 0.48;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, "rgba(255,211,164," + (0.34 * light) + ")");
      glow.addColorStop(0.36, "rgba(253,156,146," + (0.16 * light) + ")");
      glow.addColorStop(1, "rgba(255,166,187,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    window.GardenFlower.draw(ctx, {
      x, y, size, openness, appearance, camera, focus, backdrop, detail,
      rimSweep: pose.rimSweep, fusion: pose.fusion,
      time: pose.entry ? 0 : time
    });
    if (light > 0) {
      const radius = screenSize * 0.25;
      const heartLight = ctx.createRadialGradient(x, y, 0, x, y, radius);
      heartLight.addColorStop(0, "rgba(255,228,190," + (0.26 * light) + ")");
      heartLight.addColorStop(0.33, "rgba(255,199,163," + (0.13 * light) + ")");
      heartLight.addColorStop(1, "rgba(255,171,168,0)");
      ctx.fillStyle = heartLight;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

      for (const [angle, reach, radius] of motes) {
        const drift = angle + time * 0.18;
        const wobble = reach + 0.028 * Math.sin(time * 0.84 + angle * 2);
        const dotX = x + Math.cos(drift) * screenSize * wobble;
        const dotY = y + Math.sin(drift) * screenSize * wobble;
        const strength = light * (0.45 + 0.22 * Math.sin(time * 1.4 + angle * 2.6));
        ctx.fillStyle = "rgba(255,222,184," + strength + ")";
        ctx.beginPath();
        ctx.arc(dotX, dotY, radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function draw(ctx, session, source, viewport, time, backdrop) {
    if (!session.group) {
      paintFocus(ctx, focusPose(session, source, viewport), time, backdrop);
      return;
    }
    const poses = [...session.group.frames.values()].sort((first, second) => first.depth - second.depth);
    motion.paintConnections(ctx, poses, session.id, time, session.reducedMotion);
    const budget = { available: true };
    for (const pose of poses) {
      if (pose.weight <= 0 || pose.fusionOwner) continue;
      const fullDetail = pose.entry.record.id === session.id || pose.fusion;
      if (fullDetail || pose.light > 0.55 || pose.responding || pose.rimSweep || pose.camera.tilt) {
        paintFocus(ctx, pose, time, backdrop, fullDetail ? "full" : "reduced");
      } else motion.paintSmallFlower(ctx, pose, backdrop, session.sprites, budget);
    }
  }

  window.GardenFocus = { setup, draw };
})();
