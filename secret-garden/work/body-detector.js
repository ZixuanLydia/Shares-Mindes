(() => {
  const assets = new URL("body-assets/", document.baseURI);
  let initialization = Promise.resolve();
  let runtimeLoading;

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(file, assets).href;
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`Could not load the hand-tracking file ${file}.`));
      };
      document.head.append(script);
    });
  }

  function decodeBase64(base64) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(base64);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Classic scripts preserve offline file:// loading without CORS exceptions.
  async function readPacked(file, key) {
    await loadScript(file);
    const base64 = window[key];
    delete window[key];
    if (typeof base64 !== "string") throw new Error(`Invalid hand-tracking file ${file}.`);
    const stream = new Blob([decodeBase64(base64)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readResources() {
    const [wasm, model] = await Promise.all([
      readPacked("vision-wasm-data.js", "GardenHandWasmData"),
      readPacked("hand-model-data.js", "GardenHandModelData")
    ]);
    return { wasm, model };
  }

  // Serialized into a Blob Worker with the pinned SDK factory. Inference and
  // transferred images remain on this computer, outside the rendering thread.
  function runWorker() {
    let landmarker;

    async function initialize({ wasm, model }) {
      if (!self.OffscreenCanvas || !(await self.GardenHandVision.FilesetResolver.isSimdSupported())) {
        throw Object.assign(new Error("This browser cannot run hand tracking in a Worker."), { code: "unsupported" });
      }
      const canvas = new OffscreenCanvas(1, 1);
      if (!canvas.getContext("webgl2")) {
        throw Object.assign(new Error("This browser cannot use OffscreenCanvas for hand tracking."), { code: "unsupported" });
      }
      const wasmURL = URL.createObjectURL(new Blob([wasm], { type: "application/wasm" }));
      try {
        landmarker = await self.GardenHandVision.HandLandmarker.createFromOptions({
          wasmLoaderPath: "",
          wasmBinaryPath: wasmURL
        }, {
          baseOptions: { modelAssetBuffer: model, delegate: "CPU" },
          canvas,
          runningMode: "VIDEO",
          numHands: 1
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      self.postMessage({ type: "ready" });
    }

    self.onmessage = async ({ data }) => {
      try {
        if (data.type === "initialize") {
          await initialize(data);
        } else if (data.type === "detect") {
          try {
            const points = landmarker.detectForVideo(data.frame, data.timestamp).landmarks[0] ?? null;
            self.postMessage({ type: "result", points });
          } finally {
            data.frame.close();
          }
        }
      } catch (error) {
        self.postMessage({ type: "error", message: error.message, code: error.code });
      }
    };
  }

  function createWorker(resources) {
    return new Promise((resolve, reject) => {
      const source = `(${window.GardenHandRuntime.toString()})();\n(${runWorker.toString()})();`;
      const scriptURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      let worker;
      try {
        worker = new Worker(scriptURL);
      } catch (error) {
        URL.revokeObjectURL(scriptURL);
        error.code = "unsupported";
        reject(error);
        return;
      }

      let ready = false;
      let closed = false;
      let pending = null;
      let pendingResolve;
      let pendingReject;
      const timeout = setTimeout(() => fail(new Error("Hand tracking took too long to initialize.")), 20000);

      function fail(error) {
        clearTimeout(timeout);
        URL.revokeObjectURL(scriptURL);
        closed = true;
        worker.terminate();
        if (ready) pendingReject?.(error);
        else reject(error);
        pending = pendingResolve = pendingReject = null;
      }

      const detector = {
        backend: "worker",
        threaded: true,
        detect(video, timestamp) {
          if (closed) return Promise.resolve(null);
          // Repeated calls share the current frame instead of queuing images.
          if (pending) return pending;
          pending = new Promise((resolveFrame, rejectFrame) => {
            pendingResolve = resolveFrame;
            pendingReject = rejectFrame;
          });
          const result = pending;
          Promise.resolve().then(() => createImageBitmap(video)).then(frame => {
            if (closed) {
              frame.close();
              return;
            }
            try {
              worker.postMessage({ type: "detect", frame, timestamp }, [frame]);
            } catch (error) {
              frame.close();
              throw error;
            }
          }).catch(error => {
            pendingReject?.(error);
            pending = pendingResolve = pendingReject = null;
          });
          return result;
        },
        close() {
          if (closed) return;
          closed = true;
          worker.terminate();
          pendingResolve?.(null);
          pending = pendingResolve = pendingReject = null;
        }
      };

      worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          clearTimeout(timeout);
          URL.revokeObjectURL(scriptURL);
          ready = true;
          resolve(detector);
        } else if (data.type === "result") {
          pendingResolve?.(data.points);
          pending = pendingResolve = pendingReject = null;
        } else if (data.type === "error") {
          fail(Object.assign(new Error(data.message), { code: data.code }));
        }
      };
      worker.onerror = event => fail(new Error(event.message || "The hand-tracking Worker stopped."));
      worker.postMessage({ type: "initialize", ...resources }, [resources.wasm.buffer, resources.model.buffer]);
    });
  }

  async function createMainThread(resources) {
    window.GardenHandRuntime();
    const vision = window.GardenHandVision;
    if (!(await vision.FilesetResolver.isSimdSupported())) {
      throw new Error("Hand tracking requires a browser with WebAssembly SIMD support.");
    }
    const wasmURL = URL.createObjectURL(new Blob([resources.wasm], { type: "application/wasm" }));
    let landmarker;
    try {
      landmarker = await vision.HandLandmarker.createFromOptions({
        wasmLoaderPath: "",
        wasmBinaryPath: wasmURL
      }, {
        baseOptions: { modelAssetBuffer: resources.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1
      });
    } finally {
      URL.revokeObjectURL(wasmURL);
    }

    return {
      backend: "main",
      threaded: false,
      async detect(video, timestamp) {
        return landmarker?.detectForVideo(video, timestamp).landmarks[0] ?? null;
      },
      close() {
        landmarker?.close();
        landmarker = null;
      }
    };
  }

  async function initialize() {
    if (!window.DecompressionStream) throw new Error("Hand tracking requires a browser with gzip support.");
    if (!window.GardenHandRuntime) {
      runtimeLoading ??= loadScript("vision.js").catch(error => {
        runtimeLoading = null;
        throw error;
      });
      await runtimeLoading;
    }
    let resources = await readResources();
    if (window.Worker && window.OffscreenCanvas && window.createImageBitmap) {
      try {
        return await createWorker(resources);
      } catch (error) {
        if (error.code !== "unsupported") throw error;
        // Transferred buffers belong to the terminated Worker, so reload them.
        resources = await readResources();
      }
    }
    return createMainThread(resources);
  }

  window.GardenHandDetector = {
    create() {
      const pending = initialization.then(initialize);
      initialization = pending.then(() => {}, () => {});
      return pending;
    }
  };
})();
