// A quiet, non-blocking welcome on each page load. No garden data is used.
(() => {
  "use strict";
  const garden = document.getElementById("garden");
  const intro = garden?.querySelector(".intro");
  if (!intro) return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let phase = "waiting";
  let holdTimer;
  let exitTimer;
  function setPhase(next) {
    phase = next;
    garden.dataset.introPhase = next;
  }

  function finish() {
    clearTimeout(holdTimer);
    clearTimeout(exitTimer);
    setPhase("finished");
    document.removeEventListener("pointerdown", interact, true);
    document.removeEventListener("keydown", interact, true);
    document.removeEventListener("visibilitychange", visibility);
    motion.removeEventListener("change", motionChanged);
  }

  function dismiss(early = false) {
    if (phase === "finished") return;
    clearTimeout(holdTimer);
    clearTimeout(exitTimer);
    if (phase === "waiting" || motion.matches) { finish(); return; }
    if (early) garden.setAttribute("data-intro-skipped", "");
    setPhase("leaving");
    exitTimer = setTimeout(finish, early ? 180 : 1000);
  }

  function interact() {
    dismiss(true);
  }

  function begin() {
    if (phase !== "waiting" || document.hidden) return;
    if (motion.matches) { finish(); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (phase !== "waiting" || document.hidden) return;
      setPhase("visible");
      // 0.6s to appear, 1.4s to settle, then 1s to leave.
      holdTimer = setTimeout(() => dismiss(), 2000);
    }));
  }

  function visibility() {
    if (document.hidden) {
      if (phase !== "waiting") finish();
    } else begin();
  }

  function motionChanged() {
    if (motion.matches) finish();
  }

  setPhase("waiting");
  document.addEventListener("pointerdown", interact, true);
  document.addEventListener("keydown", interact, true);
  document.addEventListener("visibilitychange", visibility);
  motion.addEventListener("change", motionChanged);
  begin();
})();
