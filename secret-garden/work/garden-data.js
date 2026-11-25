// Local storage for planted flowers. This JSON schema can be reused by a shared garden.
(() => {
  "use strict";

  const storageKey = "secret-garden:v1";
  const anonymousName = "Local gardener";
  const formIds = new Set(["cup", "flared", "tall"]);
  const colorIds = new Set(["peach", "lilac", "blue"]);
  const growthSources = new Set(["seed", "planted", "mouse", "keyboard", "body", "snapshot"]);
  const themes = [
    [/想家|回家|家乡|家人|家庭|故乡|亲人|朋友|回忆|记忆|\b(?:home|family|friend|friends|memory|memories|remember)\b/i, ["Memory", "Belonging", "Warmth"]],
    [/雨|海|雪|水|河|风|\b(?:rain|ocean|sea|snow|river|water|wind)\b/i, ["Stillness", "Movement", "Reflection"]],
    [/阳光|晨|光|天空|星|月|\b(?:sun|sunlight|dawn|light|sky|star|stars|moon)\b/i, ["Light", "Wonder", "Openness"]],
    [/花|园|树|种子|春|秋|\b(?:flower|flowers|garden|tree|trees|seed|spring|autumn)\b/i, ["Growth", "Patience", "Renewal"]],
    [/改变|重新|未来|希望|开始|\b(?:change|begin|beginning|future|hope|new)\b/i, ["Possibility", "Courage", "Renewal"]],
    [/安静|慢|睡|休息|\b(?:quiet|calm|rest|sleep|slow|peace)\b/i, ["Stillness", "Care", "Space"]],
  ];
  let loaded = false;
  let author = null;
  let nicknameChosen = false;
  let nicknamePending = false;
  let records = [];
  const shared = window.GardenShared;
  const sharedActive = () => shared && shared.status.mode !== "local";

  const isText = (value, limit) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= limit;

  function readPosition(value) {
    if (!value || !Number.isFinite(value.x) || value.x < .08 || value.x > .96
      || !Number.isFinite(value.y) || value.y < .22 || value.y > .82
      || !Number.isFinite(value.z) || value.z < -16 || value.z > 16) return null;
    return { x: value.x, y: value.y, z: value.z };
  }

  function suggest(thought) {
    const matched = typeof thought === "string" && themes.find(([pattern]) => pattern.test(thought));
    return matched ? matched[1].slice() : ["Reflection", "Curiosity", "Growth"];
  }

  function readAuthor(value) {
    if (!value || !isText(value.id, 128) || !isText(value.name, 80)) return null;
    return { id: value.id, name: value.name.trim() };
  }

  function readGrowthPoint(value) {
    if (!value || !isText(value.id, 256) || !growthSources.has(value.source)) return null;
    if (!Number.isFinite(value.openness) || value.openness < 0 || value.openness > 1) return null;
    if (value.at === null && value.source !== "snapshot") return null;
    const isoTime = typeof value.at === "string" && value.at.length <= 64
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at);
    const time = value.at === null ? null : isoTime ? Date.parse(value.at) : NaN;
    if (time !== null && !Number.isFinite(time)) return null;
    return {
      id: value.id,
      at: time === null ? null : new Date(time).toISOString(),
      openness: value.openness,
      source: value.source,
    };
  }

  function mergeGrowth(...lists) {
    const byId = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const value of list) {
        const point = readGrowthPoint(value);
        if (point && !byId.has(point.id)) byId.set(point.id, point);
      }
    }
    // Stable sorting preserves the order of samples captured in the same millisecond.
    return Array.from(byId.values()).sort((first, second) => {
      if (first.at === second.at) return 0;
      if (first.at === null) return -1;
      if (second.at === null) return 1;
      return Date.parse(first.at) - Date.parse(second.at);
    });
  }

  function baselineFor(record) {
    return {
      id: "snapshot:" + record.id,
      at: null,
      openness: record.appearance.openness,
      source: "snapshot",
    };
  }

  function recordGrowth(record) {
    const points = mergeGrowth(record.growth);
    return points.length ? points : [baselineFor(record)];
  }

  function growthFor(record) {
    if (!record || !isText(record.id, 128) || !Number.isFinite(record.appearance?.openness)
      || record.appearance.openness < 0 || record.appearance.openness > 1) return [];
    const points = recordGrowth(record);
    if (points[points.length - 1].openness !== record.appearance.openness) {
      // Imported history can end below the saved state. This display-only point
      // describes that known state without claiming when an unrecorded change happened.
      points.push({ ...baselineFor(record), id: "saved-state:" + record.id });
    }
    return points;
  }

  function readRecord(value) {
    if (!value || !isText(value.id, 128) || !isText(value.thought, 180)) return null;
    const owner = readAuthor(value.author);
    const { appearance, position, createdAt, associations } = value;
    if (!owner || !isText(createdAt, 64) || !Number.isFinite(Date.parse(createdAt))) return null;
    if (!Array.isArray(associations) || associations.length > 12 || !associations.every(word => isText(word, 40))) return null;
    if (!appearance || !formIds.has(appearance.form) || !colorIds.has(appearance.color)) return null;
    const { form, color, size, openness } = appearance;
    if (!Number.isFinite(size) || size <= 0 || size > 8) return null;
    if (!Number.isFinite(openness) || openness < 0 || openness > 1) return null;
    const validCoordinate = coordinate => Number.isFinite(coordinate) && Math.abs(coordinate) <= 16;
    if (!position || ![position.x, position.y, position.z].every(validCoordinate)) return null;

    return {
      id: value.id,
      author: owner,
      thought: value.thought.trim(),
      associations: associations.map(word => word.trim()),
      appearance: { form, color, size, openness },
      position: { x: position.x, y: position.y, z: position.z },
      createdAt,
      growth: recordGrowth(value),
    };
  }

  function readRecords(values) {
    if (!Array.isArray(values)) return [];
    return mergeRecords(values.map(readRecord).filter(Boolean));
  }

  // Persistence boundary. A future async adapter can list and create the same
  // JSON records and update openness monotonically by ID. The local nickname
  // is a planting preference, while each flower carries its author snapshot.
  function readStored() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey));
      return stored?.version === 1 ? stored : null;
    } catch {
      // Storage may be unavailable for local files or contain invalid JSON.
      return null;
    }
  }

  function useStoredAuthor(stored) {
    if (nicknamePending) return;
    const storedAuthor = readAuthor(stored?.author);
    if (!storedAuthor) return;
    author = storedAuthor;
    nicknameChosen = stored.nicknameChosen === true || author.name !== anonymousName;
  }

  function initialize() {
    if (loaded) return;
    loaded = true;
    const stored = readStored();
    if (stored) {
      useStoredAuthor(stored);
      records = readRecords(stored.flowers);
    }
  }

  function mergeRecords(...lists) {
    const byId = new Map();
    for (const list of lists) {
      for (const record of list) {
        const current = byId.get(record.id);
        if (!current) byId.set(record.id, readRecord(record));
        else {
          current.appearance.openness = Math.max(current.appearance.openness, record.appearance.openness);
          current.growth = mergeGrowth(current.growth, record.growth);
        }
      }
    }
    return Array.from(byId.values());
  }

  function makeId() {
    return window.crypto?.randomUUID?.()
      ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function growthPoint(openness, source, at = new Date().toISOString()) {
    if (!Number.isFinite(openness) || openness < 0 || openness > 1 || !growthSources.has(source)) return null;
    return readGrowthPoint({ id: makeId(), openness, source, at });
  }

  function load() {
    if (sharedActive()) return readRecords(shared.load());
    initialize();
    return readRecords(records);
  }

  function persist(stored, flowers, positionUpdate = null) {
    // Merge the latest records first so a stale tab cannot replace another flower's
    // metadata or roll back its growth. Keep in-session plants when storage fails.
    records = mergeRecords(readRecords(stored?.flowers), records, readRecords(flowers));
    // Generic saves never overwrite a newer tab's position. A deliberate move
    // changes only its own position after the latest stored records are merged.
    if (positionUpdate) {
      const moving = records.find(record => record.id === positionUpdate.id);
      if (moving) moving.position = { ...positionUpdate.position };
    }
    try {
      const payload = { version: 1, author, nicknameChosen, flowers: records };
      if (JSON.stringify(payload) !== JSON.stringify(stored)) {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      }
      nicknamePending = false;
      return true;
    } catch {
      return false;
    }
  }

  // Report persistence separately from the session copy so planting works offline
  // even in browsers that disable storage for local files.
  function save(flowers) {
    if (sharedActive()) return shared.save(readRecords(flowers));
    initialize();
    const stored = readStored();
    useStoredAuthor(stored);
    return persist(stored, flowers);
  }

  function getNickname() {
    if (sharedActive()) {
      const owner = shared.getAuthor();
      return owner && owner.name !== anonymousName ? owner.name : "";
    }
    initialize();
    useStoredAuthor(readStored());
    return nicknameChosen ? author.name : "";
  }

  function setNickname(name) {
    const nickname = typeof name === "string" ? name.trim() : "";
    if (!isText(nickname, 80)) return false;
    if (sharedActive()) return shared.setNickname(nickname);

    initialize();
    const stored = readStored();
    useStoredAuthor(stored);
    author = { id: author?.id ?? makeId(), name: nickname };
    nicknameChosen = true;
    nicknamePending = true;
    return persist(stored, []);
  }

  function saveBloom(id, openness, { source = "mouse", growth = [] } = {}) {
    if (sharedActive()) {
      if (!shared.status.ready) return null;
      const record = readRecords(shared.load()).find(flower => flower.id === id);
      if (!record || !shared.isOwn(record) || !Number.isFinite(openness) || openness < 0 || openness > 1 || !growthSources.has(source)) return null;
      if (openness <= record.appearance.openness) return {
        saved: shared.isConfirmed(id), openness: record.appearance.openness, record,
      };
      const endpoint = growthPoint(openness, source);
      const samples = mergeGrowth(growth).filter(point => point.at !== null && point.at <= endpoint.at
        && point.openness >= record.appearance.openness && point.openness <= openness);
      const last = samples[samples.length - 1];
      if (!last || last.openness !== openness || last.source !== source) samples.push(endpoint);
      const updated = { ...record, appearance: { ...record.appearance, openness }, growth: mergeGrowth(record.growth, samples) };
      const saved = shared.save([updated]);
      return { saved, openness, record: readRecord(updated) };
    }
    initialize();
    const stored = readStored();
    useStoredAuthor(stored);
    const storedRecords = readRecords(stored?.flowers);
    records = mergeRecords(storedRecords, records);
    const record = records.find(flower => flower.id === id);
    if (!record || !Number.isFinite(openness) || openness < 0 || openness > 1 || !growthSources.has(source)) return null;
    if (openness <= record.appearance.openness) {
      const savedRecord = storedRecords.find(flower => flower.id === id);
      return {
        saved: Boolean(savedRecord) && JSON.stringify(savedRecord) === JSON.stringify(record),
        openness: record.appearance.openness,
        record: readRecord(record),
      };
    }

    const endpoint = growthPoint(openness, source);
    const samples = mergeGrowth(growth).filter(point => point.at !== null
      && point.at <= endpoint.at && point.openness >= record.appearance.openness && point.openness <= openness);
    const last = samples[samples.length - 1];
    if (!last || last.openness !== openness || last.source !== source) samples.push(endpoint);
    const updated = {
      ...record,
      appearance: { ...record.appearance, openness },
      growth: mergeGrowth(record.growth, samples),
    };
    const saved = persist(stored, [updated]);
    const merged = records.find(flower => flower.id === id);
    return { saved, openness: merged.appearance.openness, record: readRecord(merged) };
  }

  function savePosition(id, position) {
    const next = readPosition(position);
    if (!next) return null;
    if (sharedActive()) {
      if (!shared.status.ready) return null;
      const record = readRecords(shared.load()).find(flower => flower.id === id);
      if (!record || !shared.isOwn(record)) return null;
      const saved = shared.savePosition(id, next);
      const updated = readRecords(shared.load()).find(flower => flower.id === id);
      return { saved, pending: !saved, record: updated };
    }
    initialize();
    const stored = readStored();
    useStoredAuthor(stored);
    records = mergeRecords(readRecords(stored?.flowers), records);
    const record = records.find(flower => flower.id === id);
    if (!record) return null;
    const same = ["x", "y", "z"].every(key => record.position[key] === next[key]);
    const persisted = readRecords(stored?.flowers).find(flower => flower.id === id);
    if (same) return { saved: Boolean(persisted) && ["x", "y", "z"].every(key => persisted.position[key] === next[key]), record: readRecord(record) };
    const saved = persist(stored, [], { id, position: next });
    return { saved, record: readRecord(records.find(flower => flower.id === id)) };
  }

  function createFlower({ thought, associations, form, color, openness, position, size, growth }) {
    let owner;
    if (sharedActive()) {
      if (!shared.status.ready) return null;
      owner = shared.getAuthor();
      if (!owner) return null;
    } else {
      initialize();
      useStoredAuthor(readStored());
      if (!author) author = { id: makeId(), name: anonymousName };
      owner = author;
    }

    const createdAt = new Date().toISOString();
    return readRecord({
      id: makeId(),
      author: owner,
      thought: typeof thought === "string" ? thought.trim() : thought,
      associations: associations ?? suggest(thought),
      appearance: { form, color, size, openness },
      position,
      createdAt,
      growth: [...mergeGrowth(growth), growthPoint(openness, "planted", createdAt)],
    });
  }

  window.GardenData = {
    load, save, saveBloom, savePosition, createFlower, suggest, getNickname, setNickname, growthFor, growthPoint,
    get isShared() { return shared?.status.mode === "shared"; },
    get status() { return shared?.status ?? { mode: "local", phase: "local", ready: true, pending: 0, message: "" }; },
    get ready() { return shared?.ready ?? Promise.resolve(false); },
    getAuthor() {
      if (sharedActive()) return shared.getAuthor();
      initialize();
      useStoredAuthor(readStored());
      return author ? { ...author } : null;
    },
    isOwn(record) {
      if (sharedActive()) return shared.isOwn(record);
      // The original local garden intentionally keeps its older local history.
      return true;
    },
    subscribe(listener) {
      if (shared) return shared.subscribe(snapshot => listener({ ...snapshot, flowers: load() }));
      listener({ mode: "local", phase: "local", ready: true, pending: 0, message: "", flowers: load() });
      return () => {};
    },
    flush() { return shared?.flush() ?? Promise.resolve(); },
  };
  shared?.configure({ readRecord, mergeGrowth });
})();
