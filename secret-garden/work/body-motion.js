// Palm motion affects nearby flower poses without changing saved garden records.
(() => {
  "use strict";

  const paintGlow = window.GardenConnectionMotion.paintGlow;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const ease = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const follow = (elapsed, duration) => 1 - Math.exp(-elapsed / duration);
  const gap = (a, b) => Math.hypot(a.crownX - b.crownX, a.crownY - b.crownY);
  const pulseDuration = 580;
  const trailTime = 100;

  function create() {
    const effects = new Map();
    let targetsById = new Map();
    let pulses = [];
    let hand = null;
    let handOpacity = 0;
    let previousFlower = null;
    let previousVisit = -Infinity;
    let previousPulse = -Infinity;
    let primaryId = null;

    function stateFor(id) {
      let state = effects.get(id);
      if (!state) {
        state = { glow: 0, sway: 0, pitch: 0, openness: 0, control: 0, handBloom: null, echo: 0 };
        effects.set(id, state);
      }
      return state;
    }

    function clear() {
      effects.clear();
      targetsById.clear();
      pulses = [];
      hand = null;
      handOpacity = 0;
      previousFlower = null;
      primaryId = null;
      previousVisit = previousPulse = -Infinity;
    }

    function updateHand(sample, elapsed, now) {
      if (!sample) {
        handOpacity *= Math.exp(-elapsed / 115);
        if (handOpacity < 0.02) hand = null;
        return;
      }
      hand ??= { x: sample.x, y: sample.y, rawX: sample.x, rawY: sample.y, at: sample.at, vx: 0, vy: 0 };
      if (sample.at !== hand.at) {
        const interval = sample.at - hand.at;
        const seconds = clamp(interval / 1000, 0.035, 0.25);
        const dx = sample.x - hand.rawX;
        const dy = sample.y - hand.rawY;
        const distance = Math.hypot(dx, dy);
        const velocityScale = interval > 320 || distance < 0.0025 ? 0 : Math.min(1 / seconds, 1.5 / distance);
        const blend = follow(interval, 65);
        hand.vx = mix(hand.vx, dx * velocityScale, blend);
        hand.vy = mix(hand.vy, dy * velocityScale, blend);
        hand.at = sample.at;
        hand.rawX = sample.x;
        hand.rawY = sample.y;
      }
      const age = Math.max(0, now - sample.at);
      const drift = Math.exp(-Math.max(0, age - 100) / 95);
      const lead = Math.min(45, age) / 1000 * drift;
      const offsetX = clamp(hand.vx * lead, -0.027, 0.027);
      const offsetY = clamp(hand.vy * lead, -0.027, 0.027);
      hand.x = mix(hand.x, clamp(sample.x + offsetX), follow(elapsed, 45));
      hand.y = mix(hand.y, clamp(sample.y + offsetY), follow(elapsed, 45));
      if (Number.isFinite(sample.openness)) {
        hand.openness = mix(hand.openness ?? sample.openness, clamp(sample.openness), follow(elapsed, 85));
      }
      handOpacity = mix(handOpacity, 1 - ease((age - 150) / 210), follow(elapsed, 80));
    }

    function startChain(nearest, speed, now, span) {
      if (previousFlower !== nearest.id && now - previousVisit < 3000 && now - previousPulse > 540
        && speed > 0.025 && speed < 0.96 && targetsById.has(previousFlower)) {
        pulses.push({ from: previousFlower, to: nearest.id, start: now });
        let next = null;
        let shortest = span * 0.62;
        for (const candidate of targetsById.values()) {
          if (candidate.id === previousFlower || candidate.id === nearest.id) continue;
          const distance = gap(candidate, nearest);
          if (distance < shortest) {
            shortest = distance;
            next = candidate;
          }
        }
        if (next) pulses.push({ from: nearest.id, to: next.id, start: now + pulseDuration * 0.83 });
        if (pulses.length > 4) pulses.splice(0, pulses.length - 4);
        previousPulse = now;
      }
      previousFlower = nearest.id;
      previousVisit = now;
    }

    function update(targets, sample, width, height, now, elapsed, reduced) {
      if (!targets.length) {
        clear();
        return;
      }
      targetsById = new Map(targets.map(target => [target.id, target]));
      updateHand(sample, elapsed, now);
      const x = hand ? hand.x * width : 0;
      const y = hand ? hand.y * height : 0;
      const age = sample ? Math.max(0, now - sample.at) : Infinity;
      const fresh = age < 190;
      const velocityDecay = Math.exp(-Math.max(0, age - 100) / 95);
      const speed = hand ? Math.hypot(hand.vx, hand.vy) * velocityDecay : 0;
      const nearById = new Map();
      let nearest = null;
      let closestDistance = Infinity;
      if (sample && hand) {
        for (const target of targets) {
          const distance = Math.hypot(x - target.crownX, y - target.crownY);
          const radius = Math.max(54, Math.min(154, target.size * 1.32));
          const presence = 1 - ease((age - 150) / 210);
          const near = ease(1 - distance / radius) * presence;
          if (near > 0.002) nearById.set(target.id, near);
          if (distance < radius * 0.74 && distance < closestDistance) {
            nearest = target;
            closestDistance = distance;
          }
        }
      }
      const previous = targetsById.get(primaryId);
      if (sample && previous) {
        const distance = Math.hypot(x - previous.crownX, y - previous.crownY);
        // Keep the flower while fingers fold or the hand draws back from it.
        if (!nearest || hand.openness < 0.60 || distance <= closestDistance + 18) nearest = previous;
      }
      if (!nearest && sample && Number.isFinite(hand?.openness)) nearest = targets[0];
      primaryId = nearest?.id ?? null;

      for (const [id, state] of effects) {
        if (!targetsById.has(id)) effects.delete(id);
        else state.echo *= Math.exp(-elapsed / 620);
      }
      if (nearest && fresh) startChain(nearest, speed, now, Math.hypot(width, height));
      pulses = pulses.filter(pulse => {
        if (!targetsById.has(pulse.from) || !targetsById.has(pulse.to)) return false;
        if (now - pulse.start >= pulseDuration && !pulse.arrived) {
          stateFor(pulse.to).echo = 1;
          pulse.arrived = true;
        }
        return now - pulse.start < pulseDuration + trailTime;
      });

      for (const target of targets) {
        const near = nearById.get(target.id) ?? 0;
        const state = effects.get(target.id) ?? (near > 0 || nearest?.id === target.id ? stateFor(target.id) : null);
        if (!state) continue;
        const active = fresh && nearest?.id === target.id && Number.isFinite(hand?.openness);
        state.handBloom = active ? hand.openness : null;
        if (active) state.openness = hand.openness;
        const holding = nearest?.id === target.id && age < 300 && Number.isFinite(hand?.openness);
        state.control = mix(state.control, holding ? 1 : 0, follow(elapsed, holding ? 110 : 300));
        state.glow = mix(state.glow, clamp(near * 1.32 + state.echo * 0.72 + state.control * 0.30), follow(elapsed, 135));
        const sway = near && !reduced ? clamp(hand.vx * velocityDecay * 0.34 + (x - target.crownX) / width, -0.14, 0.14) * near : 0;
        const pitch = near && !reduced ? clamp(-hand.vy * velocityDecay * 0.28 - (y - target.crownY) / height, -0.11, 0.11) * near : 0;
        state.sway = mix(state.sway, sway, follow(elapsed, 78));
        state.pitch = mix(state.pitch, pitch, follow(elapsed, 78));
        if (!near && Math.max(state.control, state.echo, state.glow, Math.abs(state.sway), Math.abs(state.pitch)) < 0.008) {
          effects.delete(target.id);
        }
      }
    }

    function paint(ctx, width, height, now, reduced) {
      for (const [id, state] of effects) {
        if (state.glow < 0.012) continue;
        const target = targetsById.get(id);
        paintGlow(ctx, target.crownX, target.crownY, Math.max(31, target.size * 0.93), state.glow * 0.85);
      }
      if (!reduced) {
        for (const pulse of pulses) {
          const from = targetsById.get(pulse.from);
          const to = targetsById.get(pulse.to);
          const arc = Math.min(29, gap(from, to) * 0.12);
          for (let point = 0; point < 3; point++) {
            const phase = (now - pulse.start - point * 47) / pulseDuration;
            if (phase <= 0 || phase >= 1) continue;
            const travel = ease(phase);
            const x = mix(from.crownX, to.crownX, travel);
            const y = mix(from.crownY, to.crownY, travel) - Math.sin(Math.PI * travel) * arc;
            const opacity = Math.sin(Math.PI * phase) * (0.92 - point * 0.15);
            ctx.fillStyle = "rgba(255,222,182," + opacity + ")";
            ctx.beginPath();
            ctx.arc(x, y, 2.25 - point * 0.36, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (hand) {
        const x = hand.x * width;
        const y = hand.y * height;
        paintGlow(ctx, x, y, 19, handOpacity * 1.5);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,232,210," + handOpacity * 0.66 + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    return {
      update, effect: id => effects.get(id), paint,
      get primaryId() { return primaryId; },
      get position() { return hand && { x: hand.x, y: hand.y, opacity: handOpacity }; },
      get visible() { return Boolean(hand || effects.size || pulses.length); }
    };
  }

  window.GardenBodyMotion = { create };
})();
