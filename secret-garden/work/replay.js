// Replays a copy of recorded states. It never writes to the saved flower.
(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sourceLabels = {
    seed: "Seed",
    planted: "Planted",
    mouse: "Mouse",
    keyboard: "Keyboard",
    body: "Body movement",
    snapshot: "Saved state"
  };
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium"
  });

  function setup({ reducedMotion }) {
    const view = byId("focus-view");
    const dock = byId("replay-dock");
    const controls = byId("replay-controls");
    const play = byId("replay-play");
    const restart = byId("replay-restart");
    const range = byId("replay-range");
    const percent = byId("replay-percent");
    const count = byId("replay-records");
    const source = byId("replay-source");
    const time = byId("replay-time");
    const note = byId("replay-note");
    let current = null;

    function isReducedMotion() {
      return Boolean(reducedMotion?.matches ?? reducedMotion);
    }

    function render() {
      if (!current) return;
      const { points, elapsed, duration, eventIndex, openness, playable, ready, playing } = current;
      const point = points[eventIndex];
      const position = duration ? elapsed / duration : 0;
      const wholePercent = Math.round(openness * 100);
      const bloomPercent = openness > 0 && openness < 1 ? clamp(wholePercent, 1, 99) : wholePercent;
      percent.textContent = bloomPercent + "%";
      count.textContent = (eventIndex + 1) + " / " + points.length + " records";
      range.value = Math.round(position * 1000);
      range.style.setProperty("--progress", position * 100 + "%");
      range.setAttribute("aria-valuetext", Math.round(position * 100) + "% of replay, bloom " + bloomPercent + "%");

      const label = playing ? "Pause growth replay"
        : elapsed >= duration && playable ? "Replay growth" : "Play growth replay";
      play.setAttribute("aria-label", label);
      play.title = label;
      play.toggleAttribute("data-playing", playing);
      play.disabled = !ready;
      restart.disabled = !ready;
      range.disabled = !ready;
      source.textContent = sourceLabels[point.source] ?? point.source;
      const milliseconds = point.at === null ? NaN : Date.parse(point.at);
      time.hidden = !Number.isFinite(milliseconds);
      if (Number.isFinite(milliseconds)) {
        time.dateTime = point.at;
        time.textContent = dateFormat.format(new Date(milliseconds));
      } else {
        time.removeAttribute("datetime");
        time.textContent = "";
      }
    }

    function seek(elapsed) {
      current.elapsed = clamp(elapsed, 0, current.duration);
      const { points, positions } = current;
      let index = 0;
      while (index < positions.length - 2 && current.elapsed >= positions[index + 1]) index++;
      const next = Math.min(points.length - 1, index + 1);
      const interval = positions[next] - positions[index];
      const fraction = interval > 0 ? clamp((current.elapsed - positions[index]) / interval, 0, 1) : 0;
      const eased = fraction * fraction * (3 - 2 * fraction);
      current.openness = points[index].openness + (points[next].openness - points[index].openness) * eased;
      current.eventIndex = fraction < 0.5 ? index : next;
      render();
      return current.openness;
    }

    function open(record) {
      close();
      const points = window.GardenData.growthFor(record).map(point => ({ ...point }));
      if (!points.length) return;
      const playable = new Set(points.map(point => point.openness)).size > 1;
      const duration = playable ? clamp(4200 + (points.length - 2) * 160, 4200, 7000) : 0;
      const weights = points.slice(1).map((point, index) => {
        const before = Date.parse(points[index].at);
        const after = Date.parse(point.at);
        const gap = Number.isFinite(before) && Number.isFinite(after) ? Math.max(0, after - before) : 0;
        // Compress long waits while preserving the relative rhythm of recorded actions.
        return clamp(Math.log1p(gap / 1000) + 0.8, 0.8, 3);
      });
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const positions = [0];
      for (const weight of weights) positions.push(positions[positions.length - 1] + duration * weight / total);
      if (positions.length > 1) positions[positions.length - 1] = duration;
      current = {
        points, positions, duration, elapsed: 0, openness: points[0].openness,
        eventIndex: 0, playable, playing: false, ready: false
      };
      dock.hidden = false;
      controls.hidden = !playable;
      view.setAttribute("data-replaying", "");
      view.toggleAttribute("data-single-state", !playable);
      note.hidden = playable;
      if (!playable) {
        const legacy = points.every(point => point.source === "snapshot");
        const planted = points.length === 1 && points[0].source === "planted";
        note.textContent = legacy ? "Saved state · earlier growth unavailable."
          : planted ? "Only the planted state is recorded." : "Only this bloom state is recorded.";
      }
      render();
    }

    function close() {
      current = null;
      dock.hidden = true;
      view.removeAttribute("data-replaying");
      view.removeAttribute("data-single-state");
    }

    function arrive() {
      if (!current) return;
      current.ready = true;
      current.playing = current.playable && !isReducedMotion();
      render();
    }

    function update(elapsed) {
      if (!current) return null;
      if (current.playing) {
        seek(current.elapsed + clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 250));
        if (current.elapsed >= current.duration) {
          current.playing = false;
          render();
        }
      }
      return current.openness;
    }

    play.addEventListener("click", () => {
      if (!current?.ready || !current.playable) return;
      if (current.elapsed >= current.duration) seek(0);
      current.playing = !current.playing;
      render();
    });
    restart.addEventListener("click", () => {
      if (!current?.ready) return;
      seek(0);
      current.playing = !isReducedMotion();
      render();
    });
    range.addEventListener("input", () => {
      if (!current?.ready) return;
      current.playing = false;
      seek(Number(range.value) / 1000 * current.duration);
    });

    return {
      open, close, arrive, update,
      get active() { return current !== null; },
      get openness() { return current?.openness ?? null; }
    };
  }

  window.GardenReplay = { setup };
})();
