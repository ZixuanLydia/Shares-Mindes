// Dragging only changes the live poses inside the connection view.
(() => {
  "use strict";

  const motion = window.GardenConnectionMotion;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const mix = (start, end, amount) => start + (end - start) * amount;
  const ease = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const dragThreshold = 6;
  const firstSweep = 540;
  const secondSweep = 570;
  const sweepEnd = firstSweep + secondSweep;
  const joinDuration = 650;
  const splitDuration = 410;

  function radiusOf(pose) {
    const form = pose.entry.record.appearance.form;
    const rim = form === "flared" ? 1.33 : form === "tall" ? 0.99 : 1.16;
    return pose.size * 5.8 / pose.camera.distance * rim;
  }

  function sweep(elapsed, duration, power) {
    if (elapsed === null || elapsed < 0 || elapsed >= duration) return undefined;
    const phase = elapsed / duration;
    const envelope = ease(phase / 0.14) * ease((1 - phase) / 0.20);
    return { phase, strength: power * envelope };
  }

  function joinFrames(frames, hubId, partnerId, amount, contactAngle, light = amount) {
    const hub = frames.get(hubId);
    const partner = frames.get(partnerId);
    if (!hub || !partner || amount <= 0) return;
    const fusion = {
      partnerId, amount, contactAngle, light,
      appearance: partner.entry.record.appearance,
      openness: partner.openness,
      focus: partner.focus,
      opacity: partner.weight * partner.opacity / Math.max(0.001, hub.weight * hub.opacity),
      radiusRatio: (partner.size / partner.camera.distance) / (hub.size / hub.camera.distance),
      offsetX: partner.x - hub.x,
      offsetY: partner.y - hub.y,
      camera: partner.camera,
      rimSweep: partner.rimSweep
    };
    // Keep both scene weights so neither planted copy reappears beneath the joined crown.
    frames.set(hubId, { ...hub, fusion });
    frames.set(partnerId, { ...partner, fusionOwner: hubId });
  }

  function create(garden, reducedMotion, onFusionChange) {
    let gesture = null;

    function pointerPosition(event) {
      const rect = garden.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    }

    function releaseCapture(state) {
      const pointerId = state.pointerId;
      state.pointerId = null;
      state.hit.removeAttribute("data-dragging");
      if (pointerId !== null && state.hit.hasPointerCapture(pointerId)) state.hit.releasePointerCapture(pointerId);
    }

    function clear() {
      if (!gesture) return;
      const state = gesture;
      gesture = null;
      if (state.moved) state.swallow();
      releaseCapture(state);
      if (state.phase === "joined") onFusionChange(null);
    }

    function begin(event, hit, frame, id, swallow) {
      if (!event.isPrimary || event.button !== 0 || !frame) return;
      // A returning flower can be caught again at its current pose.
      if (gesture && (gesture.phase !== "returning" || gesture.fusion > 0 || gesture.id !== id)) return;
      const { scene, frames, hubId } = frame;
      const satellite = frames.get(id);
      const hub = frames.get(hubId);
      if (!satellite || !hub) return;
      const point = pointerPosition(event);
      const distance = Math.hypot(satellite.x - hub.x, satellite.y - hub.y);
      const carried = gesture;
      gesture = {
        hit, id, hubId, pointerId: event.pointerId, swallow,
        pointer: point, startX: event.clientX, startY: event.clientY,
        offsetX: satellite.x / scene.width - point.x,
        offsetY: satellite.y / scene.height - point.y,
        directionX: distance ? (satellite.x - hub.x) / distance : 1,
        directionY: distance ? (satellite.y - hub.y) / distance : 0,
        origin: motion.capture(satellite, scene),
        live: motion.capture(satellite, scene),
        reaction: carried?.reaction ?? 0,
        scan: carried?.scan >= sweepEnd ? null : carried?.scan ?? null,
        power: carried?.power ?? 0,
        fusion: 0,
        active: Boolean(carried),
        moved: false,
        phase: "dragging"
      };
      if (gesture.active) hit.setAttribute("data-dragging", "");
      hit.setPointerCapture(event.pointerId);
    }

    function move(event, hit, getFrame) {
      const state = gesture;
      if (!state || state.hit !== hit || state.pointerId !== event.pointerId || state.phase !== "dragging") return;
      if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < dragThreshold) return;
      state.active = true;
      state.moved = true;
      state.pointer = pointerPosition(event);
      hit.setAttribute("data-dragging", "");

      // Check the crown at input time so even a quick drop can join on contact.
      const frame = getFrame();
      const hub = frame?.frames.get(state.hubId);
      if (!hub) return;
      const { width, height } = frame.scene;
      const x = (state.pointer.x + state.offsetX) * width;
      const y = (state.pointer.y + state.offsetY) * height;
      if (Math.hypot(x - hub.x, y - hub.y) > radiusOf(hub) * 0.88) return;
      state.phase = "joined";
      state.contactAngle = Math.atan2(state.live.y * height - hub.y, state.live.x * width - hub.x);
      state.swallow();
      onFusionChange(state.id);
    }

    function startReturn(state) {
      if (state.moved) state.swallow();
      state.phase = "returning";
      state.elapsed = 0;
      state.releaseReaction = state.reaction;
      state.releaseFusion = state.fusion;
      state.split = reducedMotion.matches ? 0 : splitDuration * Math.sqrt(state.fusion);
      const remainingSweep = state.scan === null ? 0 : Math.max(0, sweepEnd - state.scan);
      state.duration = reducedMotion.matches ? 0 : Math.max(800, remainingSweep - state.split + 45);
      releaseCapture(state);
    }

    function end(event, hit) {
      const state = gesture;
      if (!state || state.hit !== hit || state.pointerId !== event.pointerId) return;
      if (state.phase === "joined") {
        releaseCapture(state);
      } else if (state.active) {
        startReturn(state);
      } else {
        clear();
      }
    }

    function split() {
      if (gesture?.phase !== "joined") return false;
      startReturn(gesture);
      onFusionChange(null);
      return true;
    }

    function bind(hit, id, getFrame, activate) {
      let suppressClick = false;
      hit.addEventListener("pointerdown", event => {
        suppressClick = false;
        begin(event, hit, getFrame(), id, () => { suppressClick = true; });
      });
      hit.addEventListener("pointermove", event => move(event, hit, getFrame));
      hit.addEventListener("pointerup", event => {
        move(event, hit, getFrame);
        end(event, hit);
      });
      hit.addEventListener("pointercancel", event => end(event, hit));
      hit.addEventListener("lostpointercapture", event => end(event, hit));
      hit.addEventListener("click", event => {
        if (suppressClick && event.detail !== 0) {
          suppressClick = false;
          return;
        }
        if (gesture?.phase === "joined" && gesture.id === id) return;
        activate(event);
      });
    }

    function dragPose(state, base, hub, scene, elapsed) {
      const joined = state.phase === "joined";
      const gap = 0.73 * radiusOf(hub) + 0.81 * radiusOf(base);
      const margin = radiusOf(base) * 0.70 + 6;
      const x = (state.pointer.x + state.offsetX) * scene.width;
      const y = (state.pointer.y + state.offsetY) * scene.height;
      let dx = clamp(x, Math.min(margin, state.origin.x * scene.width), Math.max(scene.width - margin, state.origin.x * scene.width)) - hub.x;
      let dy = clamp(y, Math.min(58, state.origin.y * scene.height), Math.max(scene.height - margin, state.origin.y * scene.height)) - hub.y;
      // Keep the dragged crown on its approach side so crossing the center cannot flip it.
      const forward = dx * state.directionX + dy * state.directionY;
      const correction = Math.max(0, gap * 0.70 - forward);
      dx += state.directionX * correction;
      dy += state.directionY * correction;
      const separation = Math.hypot(dx, dy);
      const keepOutside = Math.max(1, gap / Math.max(separation, 0.001));
      const from = Math.max(gap + 12, Math.hypot(base.x - hub.x, base.y - hub.y));
      const near = joined ? 1 : ease((from - Math.max(separation, gap)) / (from - gap));
      state.reaction = mix(state.reaction, near, 1 - Math.exp(-elapsed / 72));
      if (state.scan === null && near >= 0.62) {
        state.scan = 0;
        state.power = 0.91;
      } else if (state.scan >= sweepEnd && near <= 0.24) {
        state.scan = null;
      }
      const follow = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 31);
      const reaction = state.reaction;
      const contactX = joined ? gap * Math.cos(state.contactAngle) : dx * keepOutside;
      const contactY = joined ? gap * Math.sin(state.contactAngle) : dy * keepOutside;
      return {
        ...base,
        x: mix(state.live.x * scene.width, hub.x + contactX, follow),
        y: mix(state.live.y * scene.height, hub.y + contactY, follow),
        size: base.size * (1 + 0.045 * reaction),
        openness: mix(base.openness, 1, ease(reaction)),
        opacity: mix(base.opacity, 1, reaction),
        depth: mix(base.depth, 1.14, 0.38 + 0.62 * reaction)
      };
    }

    function leaned(pose, x, y, angle, rimSweep) {
      return {
        ...pose, rimSweep, responding: true,
        camera: angle > 0.001 ? { ...pose.camera, tilt: { x, y, angle } } : pose.camera
      };
    }

    function apply(frames, hubId, scene, elapsed) {
      const state = gesture;
      if (!state?.active) return;
      const base = frames.get(state.id);
      const hub = frames.get(hubId);
      if (!base || !hub || state.hubId !== hubId) {
        clear();
        return;
      }
      if (state.scan !== null) state.scan = Math.min(sweepEnd, state.scan + elapsed);
      let pose;
      if (state.phase === "returning") {
        state.elapsed += elapsed;
        state.fusion = state.split ? state.releaseFusion * (1 - clamp(state.elapsed / state.split)) : 0;
        // Separate at the meeting point, then start the curved return to the slot.
        const progress = state.duration ? clamp((state.elapsed - state.split) / state.duration) : 1;
        if (progress === 1) {
          clear();
          return;
        }
        const travel = ease(progress);
        state.reaction = state.releaseReaction * (1 - travel);
        pose = motion.place(state.live, base, progress, 0, scene);
        pose.y -= Math.sin(Math.PI * travel) * Math.min(14, scene.height * 0.019);
      } else {
        pose = dragPose(state, base, hub, scene, elapsed);
        state.live = motion.capture(pose, scene);
        if (state.phase === "joined") {
          state.fusion = reducedMotion.matches ? 1 : clamp(state.fusion + elapsed / joinDuration);
        }
      }

      const dx = pose.x - hub.x;
      const dy = pose.y - hub.y;
      const distance = Math.hypot(dx, dy) || 1;
      const reaction = state.reaction;
      const hubSweep = sweep(state.scan, firstSweep, state.power);
      const outerSweep = sweep(state.scan === null ? null : state.scan - firstSweep, secondSweep, state.power);
      frames.set(hubId, leaned(hub, dx / distance, dy / distance, 0.43 * reaction, hubSweep));
      frames.set(state.id, leaned(pose, -dx / distance, -dy / distance, 0.55 * reaction, outerSweep));
      joinFrames(frames, hubId, state.id, ease(state.fusion), state.contactAngle);
    }

    return {
      bind, apply, clear, split,
      get fusedId() { return gesture?.phase === "joined" ? gesture.id : null; }
    };
  }

  window.GardenConnectionDrag = { create, joinFrames, radiusOf, splitDuration };
})();
