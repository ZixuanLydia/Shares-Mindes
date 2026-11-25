// Pure relationship checks. Run with Node; browser/model integration is checked separately.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const sandbox = { window: {}, Intl };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "connections.js"), "utf8"), sandbox);
const api = sandbox.window.GardenConnections;
const record = (id, thought, associations = [], createdAt = "2026-11-18T00:00:00Z") => ({ id, thought, associations, createdAt });
const source = record("source", "我想回家。", ["Default"]);
const related = record("related", "I miss my grandmother and my hometown.", ["Different"]);
const weaker = record("weaker", "I need to buy a new computer.", ["Default"]);
const unrelated = record("unrelated", "The processor clock changed.", ["Default"]);
const vectors = new Map([
  ["source", new Float32Array([1, 0, 0])],
  ["related", new Float32Array([0.92, 0.28, 0])],
  ["weaker", new Float32Array([0.44, 0.89, 0])],
  ["unrelated", new Float32Array([0, 0, 1])],
]);
const records = [source, unrelated, weaker, related];
const before = JSON.stringify(records);
const ranked = api.rank(source, records, { vectors, minScore: 0.34 });
assert.deepEqual(Array.from(ranked, item => item.record.id), ["related", "weaker"]);
assert.equal(ranked[0].method, "semantic");
assert.equal(ranked[0].words[0], "家与归属");
assert.ok(ranked[0].strength > ranked[1].strength);
assert.equal(JSON.stringify(records), before, "ranking never rewrites saved flowers");
assert.equal(api.rank(source, records, { vectors, minScore: 0.9 }).length, 1);
assert.equal(api.rank(source, records, { vectors, limit: 0 }).length, 0);
assert.equal(api.cosine([0, 0], [1, 0]), null);
assert.equal(api.cosine([1], [1, 2]), null);
assert.equal(api.cosine([NaN, 0], [1, 0]), null);
assert.equal(api.cosine([1, 0], [-1, 0]), -1);
assert.equal(api.rank(source, [related, weaker], { vectors: {} })[0].record.id, "weaker", "missing model uses honest saved-keyword fallback");
assert.equal(api.rank(source, [related], { vectors: { source: [1, 0] } }).length, 0, "partial model output never invents a score");
const a = record("a", "A ray of sunshine.", [], "2026-11-18T01:00:00Z");
const b = record("b", "The light by my window.", [], "2026-11-18T02:00:00Z");
assert.equal(api.rank(source, [a, b], { vectors: { source: [1, 0], a: [0.8, 0.6], b: [0.8, 0.6] } })[0].record.id, "b");
const labelSource = record("label-source", "", [" Calm ", "CALM", "Growth"]);
const labelMatch = record("label-match", "", ["calm"]);
assert.equal(api.match(labelSource, [labelSource, labelMatch])[0].words.length, 1, "duplicate normalized tags count once");

const scenarios = [
  ["离开熟悉的街道后，总想起晚饭的味道。", "听到家人叫我吃饭，就觉得安心。", /晚饭的味道.*家人叫我吃饭的声音.*安心/u],
  ["The smell of my grandmother’s kitchen makes me feel safe.", "我想念小时候全家一起吃晚饭的日子。", /祖母厨房的气味.*小时候全家一起吃晚饭的记忆.*安心/u],
  ["我想念小时候全家一起吃晚饭的日子。", "每次家人喊我吃饭，都会让我觉得安心。", /^小时候全家一起吃晚饭的记忆与家人喊我吃饭的声音在这里相遇，让一顿饭的熟悉延续成心里的安心。$/u],
  ["我想念小时候全家一起吃晚饭的日子。", "I miss the warmth of dinner with my family.", /^小时候全家一起吃晚饭的记忆与家庭晚餐的温暖在这里相遇，让一顿饭把过去与此刻轻轻连在一起。$/u],
  ["我不想回到从前。", "我想念小时候的家。", /我不想回到从前/u],
  ["I am not happy.", "I am happy today.", /I am not happy/u],
  ["如果没有家人叫我吃饭，我会感到安心吗？", "小时候全家一起吃晚饭的记忆。", /如果没有家人叫我吃饭，我会感到安心吗？/u],
  ["The moon holds its breath.", "The shore waits in silence.", /moon.*shore.*stillness/i],
  ["我希望下雨。", "I miss the rain.", /雨/u],
  ["A sequence with an unknown subject.", "A sentence about a topic beyond the rules.", /A sequence.*A sentence|A sentence.*A sequence/u],
];
for (const [first, second, expected] of scenarios) {
  const result = api.compose(first, second);
  assert.match(result, expected);
  assert.ok(!result.includes("undefined"));
  console.log(JSON.stringify({ first, second, result, relation: api.describe(first, second) }));
}
const foodOnly = api.compose("The kitchen needs a new light.", "Dinner costs more this year.");
assert.ok(!/family|safety|childhood|care|home|安心|家人/i.test(foodOnly), "food alone never implies comfort or family");
assert.ok(!api.describe("晚饭比去年贵。", "厨房的灯坏了。").themeIds.includes("home"));
const longNegative = "我想把窗外走过的每一种声音和每一片叶子的颜色都留在这里，也想记得今天早上的风，但我并不想回到从前。";
assert.ok(api.compose(longNegative, "过去的光还在这里。").includes(longNegative.replace(/。$/, "")), "a late negation is never clipped out of the source fragment");
assert.equal(api.compose(null, "hello"), "hello");
assert.equal(api.compose("", ""), "");
const realFixture = path.join(__dirname, "semantic-vendor", "validation.json");
if (fs.existsSync(realFixture)) {
  const { texts, vectors: actual } = JSON.parse(fs.readFileSync(realFixture, "utf8"));
  assert.ok(actual.every(vector => vector.length === 384), "packaged multilingual model emits384-dimensional embeddings");
  const fixtures = texts.map((thought, index) => record("actual-" + index, thought, ["Same preset tag"]));
  const actualVectors = new Map(actual.map((vector, index) => ["actual-" + index, vector]));
  const crossLanguage = api.rank(fixtures[0], fixtures.slice(0, 3), { vectors: actualVectors });
  assert.equal(crossLanguage.length, 1, "default threshold rejects computer despite identical preset tags");
  assert.equal(crossLanguage[0].record.id, fixtures[1].id, "Chinese home thought finds English grandmother/hometown text");
  assert.ok(api.cosine(actual[3], actual[4]) > 0.7, "cross-language rain paraphrase remains close");
  assert.ok(api.cosine(actual[5], actual[6]) > 0.8, "exam paraphrase remains close");
  console.log(JSON.stringify({ realModel: "validated384-dimensional vectors", homeEnglish: crossLanguage[0].score, computer: api.cosine(actual[0], actual[2]) }));
}
console.log("PASS: semantic ranking, threshold, stable order, read-only records, vector validation, keyword fallback, and grounded bilingual synthesis.");
