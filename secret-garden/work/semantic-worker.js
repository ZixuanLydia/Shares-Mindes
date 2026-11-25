// Kept as a function so the buildless page can run it in a Blob Worker on file://.
// The pinned Transformers.js factory is prepended by semantic-engine.js.
window.GardenSemanticWorker = function GardenSemanticWorker() {
  "use strict";
  let extractor;
  let queue = Promise.resolve();

  async function initialize(resources) {
    const { env, pipeline } = self.GardenTransformers;
    const modelFiles = new Map(Object.entries(resources.files));
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = "/garden-semantic-model/";
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.useCustomCache = true;
    // This cache is a read-only local resource resolver, never a remote cache.
    // Returning a 404 Response for optional files avoids all fallback fetches.
    env.customCache = {
      async match(key) {
        const file = Array.from(modelFiles.keys()).find(name => String(key).endsWith("/" + name));
        return file ? new Response(modelFiles.get(file)) : new Response("", { status: 404 });
      },
      async put() {}
    };
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = {};
    env.backends.onnx.wasm.wasmBinary = resources.wasm;
    extractor = await pipeline("feature-extraction", "garden-mini", {
      device: "wasm", dtype: "q8", local_files_only: true,
      progress_callback(event) {
        if (event.status === "ready") self.postMessage({ type: "initializing", progress: 0.95 });
      }
    });
    // ONNX Runtime owns the initialized session; release packed source buffers.
    modelFiles.clear();
    self.postMessage({ type: "ready" });
  }

  async function embed({ id, texts }) {
    if (!extractor) throw new Error("The semantic model is not ready.");
    const vectors = [];
    // Independent sentences keep dynamic q8 activation scales deterministic:
    // a thought's saved vector must not depend on other thoughts in its batch.
    for (let start = 0; start < texts.length; start += 1) {
      const output = await extractor(texts.slice(start, start + 1), {
        pooling: "mean", normalize: true, truncation: true, max_length: 256
      });
      vectors.push(...output.tolist());
      self.postMessage({ type: "progress", id, completed: vectors.length, total: texts.length });
    }
    self.postMessage({ type: "vectors", id, vectors });
  }

  self.onmessage = ({ data }) => {
    queue = queue.then(async () => {
      if (data.type === "initialize") await initialize(data.resources);
      else if (data.type === "embed") await embed(data);
    }).catch(error => {
      self.postMessage({ type: "error", id: data.id, message: error?.message || String(error) });
    });
  };
};
