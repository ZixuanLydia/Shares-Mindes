// Local sentence embeddings. No thought, vector, or model request leaves this page.
// API: ensure(), embed(texts)->number[][], subscribe(listener)->unsubscribe,
// status, model, dimension, cosine(a,b). Only embed() is needed for cached texts.
(() => {
  "use strict";
  const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2@2c4055b:q8:mean:256:single:v2";
  const DIMENSION = 384;
  const assets = new URL("semantic-assets/", document.baseURI);
  const memory = new Map();
  const listeners = new Set();
  const pending = new Map();
  let status = Object.freeze({ phase: "idle", progress: 0, completed: 0, total: 0, message: "" });
  let initializing;
  let runtimeLoading;
  let worker;
  let database;
  let nextId = 0;
  let jobs = Promise.resolve();

  function update(next) {
    status = Object.freeze({ ...status, ...next });
    for (const listener of listeners) {
      try { listener(status); } catch (error) { console.warn("Semantic status listener failed.", error); }
    }
  }

  function normalize(text) {
    return String(text ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  }

  function valid(vector) {
    return Array.isArray(vector) && vector.length === DIMENSION && vector.every(Number.isFinite);
  }

  function openDatabase() {
    if (database) return database;
    database = new Promise(resolve => {
      if (!window.indexedDB) { resolve(null); return; }
      let request;
      try { request = indexedDB.open("secret-garden-semantic-v1", 1); }
      catch { resolve(null); return; }
      request.onupgradeneeded = () => request.result.createObjectStore("embeddings");
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return database;
  }

  async function readCached(texts) {
    const db = await openDatabase();
    if (!db) return;
    try {
      await new Promise(resolve => {
        const tx = db.transaction("embeddings", "readonly");
        const store = tx.objectStore("embeddings");
        for (const text of texts) {
          if (memory.has(text)) continue;
          const request = store.get(MODEL + "|" + text);
          request.onsuccess = () => { if (valid(request.result)) memory.set(text, request.result); };
        }
        tx.oncomplete = tx.onerror = tx.onabort = resolve;
      });
    } catch { /* Private browsing or full storage must not stop the garden. */ }
  }

  async function writeCached(texts, vectors) {
    const db = await openDatabase();
    if (!db) return;
    try {
      await new Promise(resolve => {
        const tx = db.transaction("embeddings", "readwrite");
        const store = tx.objectStore("embeddings");
        texts.forEach((text, index) => store.put(vectors[index], MODEL + "|" + text));
        tx.oncomplete = tx.onerror = tx.onabort = resolve;
      });
    } catch { /* In-memory vectors remain usable if persistence is unavailable. */ }
  }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => finish(new Error("A local semantic file took too long to load.")), 45000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        script.remove();
        error ? reject(error) : resolve();
      }
      script.src = new URL(file, assets).href;
      script.onload = () => finish();
      script.onerror = () => finish(new Error("Could not load the local semantic file " + file + "."));
      document.head.append(script);
    });
  }

  function decode(base64) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(base64);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function readPacked(item, advance) {
    const chunks = [];
    for (const part of item.parts) {
      await loadScript(part);
      const base64 = window.GardenSemanticAssetData;
      delete window.GardenSemanticAssetData;
      if (typeof base64 !== "string") throw new Error("Invalid local semantic file " + part + ".");
      chunks.push(decode(base64));
      advance();
      // Allow the rendering thread to paint between compressed asset chunks.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const stream = new Blob(chunks).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function stopWorker(error) {
    worker?.terminate();
    worker = undefined;
    initializing = undefined;
    for (const job of pending.values()) { clearTimeout(job.timeout); job.reject(error); }
    pending.clear();
    update({ phase: "error", message: error.message, progress: 0 });
  }

  async function ensure() {
    if (worker && status.phase === "ready") return api;
    if (initializing) return initializing;
    initializing = (async () => {
      try {
        if (!window.Worker || !window.DecompressionStream || !window.WebAssembly) {
          throw new Error("Local meaning matching requires a recent desktop browser with WebAssembly and Worker support.");
        }
        update({ phase: "loading", progress: 0, message: "Loading the local language model…" });
        runtimeLoading ??= loadScript("transformers-runtime.js").catch(error => { runtimeLoading = undefined; throw error; });
        await runtimeLoading;
        const manifest = window.GardenSemanticAssetManifest;
        if (!manifest?.resources) throw new Error("The local language model manifest is missing.");
        const total = manifest.resources.reduce((sum, item) => sum + item.parts.length, 0);
        let completed = 0;
        const resources = { files: {} };
        for (const item of manifest.resources) {
          const bytes = await readPacked(item, () => {
            completed += 1;
            update({ phase: "loading", progress: 0.72 * completed / total });
          });
          if (item.name === "wasm") resources.wasm = bytes;
          else resources.files[item.name] = bytes;
        }
        update({ phase: "initializing", progress: 0.76, message: "Preparing meaning matching on this computer…" });
        const source = "(" + window.GardenSemanticRuntime.toString() + ")();\n(" + window.GardenSemanticWorker.toString() + ")();";
        const workerURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try { worker = new Worker(workerURL); }
        finally { URL.revokeObjectURL(workerURL); }
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            const error = new Error("The local language model took too long to initialize. You can try again.");
            stopWorker(error);
            reject(error);
          }, 90000);
          worker.onmessage = ({ data }) => {
            if (data.type === "ready") {
              clearTimeout(timeout);
              update({ phase: "ready", progress: 1, message: "Meaning matching is ready." });
              resolve();
            } else if (data.type === "initializing") {
              update({ phase: "initializing", progress: data.progress });
            } else if (data.type === "progress") {
              update({ phase: "embedding", completed: data.completed, total: data.total,
                progress: data.total ? data.completed / data.total : 0 });
            } else if (data.type === "vectors") {
              const job = pending.get(data.id);
              if (job) {
                clearTimeout(job.timeout);
                pending.delete(data.id);
                update({ phase: "ready", progress: 1, completed: data.vectors.length, total: data.vectors.length });
                job.resolve(data.vectors);
              }
            } else if (data.type === "error") {
              const error = new Error(data.message);
              clearTimeout(timeout);
              stopWorker(error);
              reject(error);
            }
          };
          worker.onerror = event => {
            clearTimeout(timeout);
            const error = new Error(event.message || "The local language model stopped. You can try again.");
            stopWorker(error);
            reject(error);
          };
          const transfer = [resources.wasm.buffer, ...Object.values(resources.files).map(bytes => bytes.buffer)];
          worker.postMessage({ type: "initialize", resources }, transfer);
        });
        return api;
      } catch (error) {
        stopWorker(error);
        throw error;
      }
    })();
    return initializing;
  }

  function embed(texts) {
    if (!Array.isArray(texts)) return Promise.reject(new TypeError("embed expects an array of thoughts."));
    const normalized = texts.map(normalize);
    if (normalized.some(text => !text)) return Promise.reject(new Error("A thought must contain some text."));
    const result = jobs.then(async () => {
      const unique = [...new Set(normalized)];
      await readCached(unique);
      const missing = unique.filter(text => !memory.has(text));
      if (missing.length) {
        await ensure();
        update({ phase: "embedding", completed: 0, total: missing.length, progress: 0, message: "Finding meaning in your garden…" });
        const id = ++nextId;
        const vectors = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => stopWorker(new Error("Meaning matching took too long. Please try again.")), Math.max(90000, missing.length * 7000));
          pending.set(id, { resolve, reject, timeout });
          try { worker.postMessage({ type: "embed", id, texts: missing }); }
          catch (error) { stopWorker(error); }
        });
        if (vectors.length !== missing.length || !vectors.every(valid)) throw new Error("The local model returned invalid meaning vectors.");
        missing.forEach((text, index) => memory.set(text, vectors[index]));
        await writeCached(missing, vectors);
      } else {
        update({ phase: "ready", completed: normalized.length, total: normalized.length, progress: 1, message: "Using saved meaning matches." });
      }
      return normalized.map(text => memory.get(text).slice());
    });
    jobs = result.catch(() => {});
    return result;
  }

  function cosine(a, b) {
    if (!valid(a) || !valid(b)) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < DIMENSION; i += 1) { dot += a[i] * b[i]; normA += a[i] ** 2; normB += b[i] ** 2; }
    return normA && normB ? Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB))) : 0;
  }

  const api = {
    model: MODEL, dimension: DIMENSION, ensure, embed, cosine,
    get status() { return status; },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    }
  };
  window.GardenSemantic = Object.freeze(api);
})();
