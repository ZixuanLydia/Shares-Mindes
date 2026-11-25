// Camera frames are only read by the local hand detector.
(() => {
  "use strict";

  const palmPoints = [0, 5, 9, 13, 17];
  const sampleLifetime = 360;
  const clamp = value => Math.max(0, Math.min(1, value));

  function setup() {
    const byId = id => document.getElementById(id);
    const toggle = byId("body-toggle");
    const panel = byId("body-panel");
    const enable = byId("body-enable");
    const pause = byId("body-pause");
    const close = byId("body-close");
    const status = byId("body-status");
    const guidance = byId("body-guidance");
    const preview = byId("body-preview");
    const marker = byId("body-preview-dot");
    const video = byId("body-video");
    let opened = false;
    let context = "garden";
    let state = "idle";
    let generation = 0;
    let stream = null;
    let detector = null;
    let request = 0;
    let sample = null;
    let lastFrame = -1;
    let nextInference = 0;
    let inference = null;
    let videoFrame = 0;
    let videoRequest = null;

    function showControls() {
      panel.hidden = !opened || context === "blocked";
      panel.dataset.state = state;
      panel.dataset.context = context;
      toggle.disabled = context === "blocked";
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      enable.hidden = state === "active" || state === "requesting";
      enable.textContent = state === "paused" ? "Resume camera" : "Enable camera";
      pause.hidden = state !== "active" && state !== "requesting";
      preview.hidden = state !== "active";
      guidance.textContent = context === "grow"
        ? "Open your hand to bloom. Make a fist to close the flower."
        : "Open hand opens. Fist closes. Move over a flower to choose it.";
    }

    function report(message) {
      if (status.textContent !== message) status.textContent = message;
    }

    function clearSample() {
      sample = null;
      marker.hidden = true;
      panel.removeAttribute("data-tracking");
      delete panel.dataset.handState;
    }

    function stop(nextState, message, releaseDetector = false) {
      generation++;
      cancelAnimationFrame(request);
      request = 0;
      if (videoRequest !== null) video.cancelVideoFrameCallback(videoRequest);
      videoRequest = null;
      clearSample();
      const previous = stream;
      stream = null;
      video.pause();
      video.srcObject = null;
      for (const track of previous?.getTracks() ?? []) track.stop();
      if (releaseDetector && detector) {
        detector.close();
        detector = null;
      }
      state = nextState;
      report(message);
      showControls();
    }

    function cameraError(error) {
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        return "Camera access was denied. You can still use the mouse.";
      }
      if (error?.name === "NotFoundError" || error?.name === "NotReadableError") {
        return "Camera unavailable. You can still use the mouse.";
      }
      return "Hand tracking couldn’t start. Try again or use the mouse.";
    }

    async function detect(attempt, now) {
      const currentDetector = detector;
      const pending = Promise.resolve().then(() => currentDetector.detect(video, now));
      inference = pending;
      try {
        const points = await pending;
        if (attempt !== generation || state !== "active") return;
        const openness = window.GardenHandShape.openness(points);
        if (openness !== null) {
          let x = 0;
          let y = 0;
          for (const index of palmPoints) {
            x += points[index].x;
            y += points[index].y;
          }
          if (Number.isFinite(x) && Number.isFinite(y)) {
            sample = {
              x: clamp(1 - x / palmPoints.length), y: clamp(y / palmPoints.length), at: now, openness
            };
            panel.dataset.tracking = "";
            panel.dataset.handState = openness < 0.23 ? "closed" : openness > 0.77 ? "open" : "partial";
            report(openness < 0.23 ? "Fist detected" : openness > 0.77 ? "Open hand detected" : "Hand partly open");
          }
        }
        const duration = performance.now() - now;
        // Never queue camera frames. A worker can infer alongside the garden animation.
        nextInference = performance.now() + (currentDetector.threaded ? 8 : Math.max(45, duration));
      } catch (error) {
        if (attempt === generation) {
          stop("error", "Hand tracking stopped. Try again or use the mouse.", true);
        }
      } finally {
        if (inference === pending) inference = null;
      }
    }

    function track(now) {
      if (state !== "active") return;
      const frame = video.requestVideoFrameCallback ? videoFrame : video.currentTime;
      if (!inference && video.readyState >= 2 && frame !== lastFrame && now >= nextInference) {
        lastFrame = frame;
        void detect(generation, performance.now());
      }
      if (sample && now - sample.at > sampleLifetime) {
        clearSample();
        report("Show one hand to the camera");
      }
      request = requestAnimationFrame(track);
    }

    function watchVideoFrame() {
      if (state !== "active") return;
      videoFrame++;
      videoRequest = video.requestVideoFrameCallback(watchVideoFrame);
    }

    async function start() {
      if (!opened || context === "blocked" || document.hidden || state === "active" || state === "requesting") return;
      if (!navigator.mediaDevices?.getUserMedia) {
        stop("error", "Open the local page in Chrome to use the camera. Mouse controls still work.");
        return;
      }
      const attempt = ++generation;
      state = "requesting";
      report("Allow camera access to start");
      showControls();
      try {
        const camera = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30, max: 30 } }
        });
        if (attempt !== generation) {
          for (const track of camera.getTracks()) track.stop();
          return;
        }
        stream = camera;
        for (const track of camera.getVideoTracks()) {
          track.addEventListener("ended", () => {
            if (stream === camera) stop("error", "Camera disconnected. You can still use the mouse.");
          }, { once: true });
        }
        video.srcObject = camera;
        report("Loading hand tracking…");
        await video.play();
        if (attempt !== generation) return;
        if (inference) await inference.catch(() => {});
        if (attempt !== generation) return;
        if (!detector) {
          const loaded = await window.GardenHandDetector.create();
          if (attempt !== generation) {
            loaded.close();
            return;
          }
          detector = loaded;
        }
        state = "active";
        lastFrame = -1;
        nextInference = 0;
        videoFrame = 0;
        if (video.requestVideoFrameCallback) videoRequest = video.requestVideoFrameCallback(watchVideoFrame);
        report("Show one hand to the camera");
        showControls();
        request = requestAnimationFrame(track);
      } catch (error) {
        if (attempt === generation) stop("error", cameraError(error), true);
      }
    }

    function pauseCamera(message = "Camera paused. Mouse controls are available.") {
      if (state === "active" || state === "requesting") stop("paused", message);
    }

    function dismiss(restoreFocus = true) {
      opened = false;
      stop("idle", "Camera is off", true);
      if (restoreFocus && !toggle.disabled) toggle.focus({ preventScroll: true });
    }

    toggle.addEventListener("click", () => {
      if (opened) dismiss();
      else {
        opened = true;
        showControls();
        enable.focus({ preventScroll: true });
      }
    });
    enable.addEventListener("click", start);
    pause.addEventListener("click", () => {
      pauseCamera();
      enable.focus({ preventScroll: true });
    });
    close.addEventListener("click", () => dismiss());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseCamera("Camera paused while the garden was out of view.");
    });
    window.addEventListener("pagehide", () => dismiss(false));

    showControls();
    return {
      get active() { return state === "active"; },
      read(now) { return sample && now - sample.at <= sampleLifetime ? sample : null; },
      display(position) {
        marker.hidden = state !== "active" || !position || position.opacity < 0.06;
        if (marker.hidden) return;
        marker.style.left = position.x * 100 + "%";
        marker.style.top = position.y * 100 + "%";
        marker.style.opacity = position.opacity;
      },
      setContext(next) {
        if (context === next) return;
        context = next;
        if (context === "blocked") pauseCamera("Camera paused. Resume in the garden or Grow.");
        showControls();
      }
    };
  }

  window.GardenBodyCamera = { setup };
})();
