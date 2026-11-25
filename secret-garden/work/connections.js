// Embeddings rank relationships; small, explicit language rules phrase the local
// explanation. Neither relationship animation nor wording rewrites a saved flower.
(() => {
  "use strict";

  const sentences = Intl.Segmenter && new Intl.Segmenter(undefined, { granularity: "sentence" });
  const words = Intl.Segmenter && new Intl.Segmenter(undefined, { granularity: "word" });
  const han = /\p{Script=Han}/u;
  const tone = [
    [/安静|静谧|寂静|屏住呼吸|\b(?:quiet|stillness|silent|silence|calm|holds? (?:its|their) breath)\b/i, "stillness", "一份安静"],
    [/回忆|记忆|记得|旧信|\b(?:remember|memory|memories|old letter)\b/i, "the pull of memory", "回忆如何浮现"],
    [/想念|思念|想家|\b(?:miss|missing|long for|homesick)\b/i, "the feeling of missing something", "想念的心情"],
    [/快乐|开心|喜悦|高兴|\b(?:happy|joy|joyful|delighted)\b/i, "joy", "喜悦"],
    [/重新开始|新开始|\b(?:new start|new beginning|begin again|start over)\b/i, "the possibility of a new beginning", "重新开始的可能"],
  ];
  const sound = /声音|声响|雨声|敲着|敲打|听见|\b(?:sound|hear|hearing|listening|knock|tapping)\b/i;
  const light = /台灯|灯光|照着|照亮|月光|阳光|\b(?:light|glow|moonlight|sunlight|lamp|candlelight)\b/i;
  const uncertain = /不|未|没有|如果|也许|可能|[?？]|\b(?:not|no|never|if|maybe|might|wish|imagine|without)\b|n[’']t\b/i;
  const verbs = new Map(Object.entries({
    holds: "holding", falls: "falling", shines: "shining", floats: "floating",
    rests: "resting", rises: "rising", moves: "moving", waits: "waiting",
  }));
  const imageNoun = /^(?:an?|the) (?:[\p{L}-]+ ){0,3}(?:moon|shore|sea|rain|river|sky|wind|tree|garden|flower|light|glow|lamp)(?: (?:above|below|over|on|beside|by|under|in|at|from|seen from) .+)?$/iu;
  const meal = /晚饭|晚餐|早饭|早餐|吃饭|饭菜|厨房|餐桌|饭桌|\b(?:dinner|supper|breakfast|meal|meals|kitchen|cooking|dining table)\b/i;
  const family = /家人|全家|一家人|奶奶|外婆|妈妈|爸爸|祖母|祖父|爷爷|外公|\b(?:family|grandmother|grandma|grandfather|grandpa|mother|father|parents)\b/i;
  const remembering = /回忆|记忆|记得|想起|想念|从前|小时候|童年|\b(?:remember|remembering|memory|memories|childhood|miss|missing|used to|as a child)\b/i;
  const safe = /安心|安稳|踏实|安全感|\b(?:safe|safety|comfort|comforting|secure|security|at ease)\b/i;
  const away = /离开|远方|陌生的|异乡|\b(?:away from|far from|left home|unfamiliar|homesick)\b/i;
  const themes = [
    { id: "home", cue: /故乡|家乡|想家|回家|归属|家人|全家|一家人|奶奶|外婆|妈妈|祖母|团圆|\b(?:home|hometown|homesick|belong|belonging|grandmother|grandma|mother|family|reunion)\b/i, en: "home & belonging", zh: "家与归属", end: "make room for a sense of belonging", ending: "让不同的牵挂有了一个可以安放的地方" },
    { id: "meals", cue: meal, en: "meals & everyday moments", zh: "饭与日常", end: "let the details of a meal become a moment to keep", ending: "让一顿饭的细节成为值得留住的日常" },
    { id: "memory", cue: /回忆|记忆|记得|想起|旧信|从前|小时候|童年|过去的|\b(?:remember|remembering|memory|memories|old letter|childhood|used to|the past)\b/i, en: "memory", zh: "记忆", end: "keep something from the past alive in the present", ending: "让过去的一小部分在此刻继续发光" },
    { id: "change", cue: /重新开始|新开始|新的开始|重来|改变|变化|成长|长大|出发|勇气|\b(?:new start|new beginning|begin again|start over|change|changing|grow|growth|growing|courage|beginning)\b/i, en: "change & beginning", zh: "改变与开始", end: "leave a little room for what could come next", ending: "为尚未发生的变化留出一点空间" },
    { id: "stillness", cue: /安静|静谧|寂静|平静|宁静|慢下来|停下来|停留|屏住呼吸|\b(?:quiet|stillness|silent|silence|calm|peace|peaceful|slow down|slowing down|pause|holds? (?:its|their) breath)\b/i, en: "stillness", zh: "安静与停留", end: "make a little space in which to slow down", ending: "把匆忙的世界轻轻放慢" },
    { id: "care", cue: /照顾|照料|陪伴|关心|温柔|拥抱|守护|照看|\b(?:care|caring|tender|tenderness|gentle|gently|hug|cared for|look after|company|companionship)\b/i, en: "care & closeness", zh: "照顾与陪伴", end: "give care a small, tangible place to begin", ending: "让关心变成一件可以慢慢靠近的小事" },
    { id: "hope", cue: /希望|盼望|期待|明天|未来|愿望|\b(?:hope|hopeful|hoping|tomorrow|future|looking forward|wish|wishes|dream of)\b/i, en: "hope", zh: "希望与期待", end: "hold open the possibility of another day", ending: "一起为还没到来的日子留着一束光" },
    { id: "connection", cue: /相遇|联系|连接|陌生人|朋友|友谊|一起|彼此|\b(?:meet|meeting|connection|connect|connected|stranger|friend|friends|friendship|together|each other)\b/i, en: "connection", zh: "相遇与联系", end: "leave an opening for one experience to meet another", ending: "让各自的经历有了相遇的入口" },
    { id: "loss", cue: /失去|离别|告别|遗憾|想念|思念|想家|\b(?:loss|lose|lost|goodbye|farewell|regret|miss|missing|long for|longing|homesick)\b/i, en: "absence & longing", zh: "离别与想念", end: "make room for what is absent without letting it disappear", ending: "给不在身边的事物留下一点温度" },
    { id: "light", cue: /光|灯|照亮|阳光|月亮|日落|黎明|\b(?:light|lights|glow|moon|moonlight|sunlight|sunshine|lamp|candle|candlelight|sunset|dawn)\b/i, en: "light", zh: "光", end: "let one small light linger in another scene", ending: "让一处微光在另一个场景里停留" },
    { id: "rain", cue: /雨|潮湿|下雨|水滴|\b(?:rain|raining|rainy|raindrop|raindrops|drizzle|wet pavement)\b/i, en: "rain", zh: "雨", end: "let the rain become something to keep for a moment", ending: "把一场雨变成可以暂时留住的片刻" },
    { id: "nature", cue: /树|森林|花园|大海|海边|河流|天空|风|树叶|\b(?:tree|trees|forest|garden|sea|ocean|shore|river|sky|wind|leaf|leaves|nature)\b/i, en: "the living world", zh: "自然与感受", end: "find a place for an inner feeling in the world outside", ending: "让心里的感受在外面的世界找到形状" },
    { id: "joy", cue: /快乐|开心|喜悦|高兴|笑|\b(?:happy|happiness|joy|joyful|delighted|smile|smiling|laughter)\b/i, en: "joy", zh: "快乐", end: "leave a small place for joy to be noticed", ending: "为值得被注意到的快乐留下一点位置" },
  ];

  const clamp = value => Math.max(0, Math.min(1, value));
  const clean = text => typeof text === "string" ? text.trim().replace(/\s+/gu, " ") : "";
  const hasChinese = (first, second) => han.test(first) || han.test(second);

  function sharedThemes(first, second) {
    return themes.filter(theme => theme.cue.test(first) && theme.cue.test(second));
  }

  function mealContext(first, second) {
    // Food alone is not evidence for family, comfort or nostalgia. Each side
    // must mention a meal, and those additional links need their own evidence.
    if (!meal.test(first) || !meal.test(second)) return null;
    const pair = first + " " + second;
    if (!family.test(pair) || !remembering.test(pair)) return null;
    return { safe: safe.test(pair), away: away.test(pair) };
  }

  function mealImage(thought, chinese, reading) {
    if (!chinese) return reading.image;
    const remembered = thought.match(/(?:想念|想起|记得)(.+?)(?:的日子|的时光|的那天)[。.!！]?$/u);
    if (remembered && meal.test(remembered[1]) && family.test(remembered[1])) return remembered[1] + "的记忆";
    const calling = thought.match(/(?:听(?:到|见)|每次)?((?:家人|全家|一家人|奶奶|外婆|妈妈|爸爸|祖母|祖父|爷爷|外公)(?:叫|喊)(?:我|我们)?(?:吃晚饭|吃饭))/u);
    if (calling && family.test(calling[1])) return calling[1] + "的声音";
    const flavour = thought.match(/((?:晚饭|晚餐|饭菜|早餐|早饭)的(?:味道|气味|香味|香气))/u);
    if (flavour) return (remembering.test(thought) ? "记忆里" : "") + flavour[1];
    const familyMeal = thought.match(/^(?:I|we) (?:miss|remember) the warmth of (dinner|supper|breakfast|a meal|meals) with (?:my|our) family[.!]?$/i);
    if (familyMeal) {
      const mealName = { dinner: "晚餐", supper: "晚餐", breakfast: "早餐", "a meal": "用餐", meals: "用餐" }[familyMeal[1].toLowerCase()];
      return "家庭" + mealName + "的温暖";
    }
    // Translate only this literal, bounded noun phrase; never translate an
    // unknown whole sentence or infer a relationship from a food word alone.
    const kitchen = thought.match(/\b(?:smell|scent|aroma) of (?:my |our |the )?(grandmother|grandma|mother|father)[’']s kitchen\b/i);
    if (kitchen) {
      const relative = { grandmother: "祖母", grandma: "祖母", mother: "妈妈", father: "爸爸" }[kitchen[1].toLowerCase()];
      return relative + "厨房的气味";
    }
    return reading.image;
  }

  function describe(first, second) {
    first = clean(first);
    second = clean(second);
    const chinese = hasChinese(first, second);
    const common = sharedThemes(first, second);
    const labels = common.map(theme => chinese ? theme.zh : theme.en);
    let summary;
    const meals = mealContext(first, second);
    if (meals) {
      summary = chinese ? "一顿饭的细节，把熟悉的日常与家人的记忆联系起来。"
        : "The details of a meal connect familiar everyday moments with memories of family.";
    } else if (common.length) {
      summary = chinese ? "两条想法都触及" + labels.slice(0, 2).join("、") + "，从各自的细节靠近同一个主题。"
        : "Different details meet around " + labels.slice(0, 2).join(" and ") + ".";
    } else {
      // Similarity can be real even when the small explanation vocabulary has no
      // shared theme. Do not turn an embedding score into an invented keyword.
      summary = chinese ? "句意相近，表达和细节各有不同。" : "Related in meaning, with different details and wording.";
    }
    return { themes: labels, themeIds: common.map(theme => theme.id), summary };
  }

  function labelsByKey(associations) {
    const labels = new Map();
    if (!Array.isArray(associations)) return labels;

    for (const label of associations) {
      if (typeof label !== "string") continue;
      const key = label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      if (key && !labels.has(key)) labels.set(key, label.trim());
    }
    return labels;
  }

  function createdTime(record) {
    const time = Date.parse(record.createdAt);
    return Number.isFinite(time) ? time : -Infinity;
  }

  // Rank by distinct exact matches, then newest creation time and stable ID.
  // Shared words keep their spelling and order from the focused flower.
  function match(sourceRecord, records, limit = 4) {
    if (!sourceRecord || !Array.isArray(records) || limit <= 0) return [];
    const sourceLabels = labelsByKey(sourceRecord.associations);
    if (!sourceLabels.size) return [];

    const matches = [];
    for (const record of records) {
      if (!record || record.id === sourceRecord.id) continue;
      const labels = labelsByKey(record.associations);
      const words = [];
      for (const [key, label] of sourceLabels) {
        if (labels.has(key)) words.push(label);
      }
      if (words.length) {
        const score = words.length / Math.max(1, sourceLabels.size + labels.size - words.length);
        matches.push({ record, words, score, strength: 0.2 + score * 0.4, method: "keywords",
          relation: { themes: words.slice(), themeIds: [], summary: "Shared saved keywords: " + words.join(" · ") } });
      }
    }

    matches.sort((left, right) => right.words.length - left.words.length
      || createdTime(right.record) - createdTime(left.record)
      || left.record.id.localeCompare(right.record.id));
    return matches.slice(0, limit);
  }

  function vectorFor(vectors, id) {
    const value = typeof vectors?.get === "function" ? vectors.get(id) : vectors?.[id];
    return value?.vector ?? value;
  }

  // Accept regular arrays and Float32Array embeddings. Invalid/mismatched vectors
  // never become a perfect match, including a zero vector or a failed model result.
  function cosine(first, second) {
    if (!first?.length || first.length !== second?.length) return null;
    let dot = 0;
    let a = 0;
    let b = 0;
    for (let index = 0; index < first.length; index += 1) {
      const x = first[index];
      const y = second[index];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      dot += x * y;
      a += x * x;
      b += y * y;
    }
    if (a <= 0 || b <= 0) return null;
    return Math.max(-1, Math.min(1, dot / Math.sqrt(a * b)));
  }

  function rank(sourceRecord, records, options = {}) {
    const { vectors, limit = 4, minScore = 0.34 } = options;
    if (!sourceRecord || !Array.isArray(records) || limit <= 0) return [];
    const source = vectorFor(vectors, sourceRecord.id);
    if (cosine(source, source) === null) return match(sourceRecord, records, limit);
    const threshold = Number.isFinite(minScore) ? Math.max(-1, Math.min(0.99, minScore)) : 0.34;
    const matches = [];
    for (const record of records) {
      if (!record || record.id === sourceRecord.id) continue;
      const score = cosine(source, vectorFor(vectors, record.id));
      if (score === null || score < threshold) continue;
      const relation = describe(sourceRecord.thought, record.thought);
      matches.push({
        record, words: relation.themes.slice(), score, method: "semantic", relation,
        strength: 0.2 + 0.8 * clamp((score - threshold) / Math.max(0.01, 0.85 - threshold)),
      });
    }
    matches.sort((left, right) => right.score - left.score
      || createdTime(right.record) - createdTime(left.record)
      || String(left.record.id).localeCompare(String(right.record.id)));
    return matches.slice(0, limit);
  }

  function excerpt(text, limit) {
    if (text.length <= limit) return text;
    if (!words) return text;
    let end = 0;
    for (const word of words.segment(text)) {
      if (word.index + word.segment.length > limit) break;
      end = word.index + word.segment.length;
    }
    return (end ? text.slice(0, end).trimEnd() : text) + (end ? "…" : "");
  }

  function readThought(thought, chinese) {
    const line = clean(thought);
    // Protect honorifics when finding the boundary, then take the text from the original.
    const boundaries = line.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof)\.(?=\s+\p{Lu})/gu, title => title.slice(0, -1) + "·");
    const end = sentences?.segment(boundaries).containing(0)?.segment.length ?? line.length;
    const firstSentence = line.slice(0, end).trim();
    const phrase = firstSentence.replace(/[.!?。！？]+$/u, "");
    const direct = !uncertain.test(firstSentence);
    const quoted = /[?？]$/u.test(firstSentence) ? firstSentence : phrase;
    // A clipped negative clause could lose its negation at the end. Keep that
    // entire first sentence; the two complete originals also remain below it.
    const fragment = direct ? excerpt(quoted, chinese ? 34 : 76) : quoted;
    const quote = chinese ? "「" + fragment + "」" : "“" + fragment + "”";
    // Keep questions, negation, and uncertainty in a source fragment rather than turning them into facts.
    if (!direct) return { quote, phrase, image: quote, direct };

    let image = quote;
    if (chinese && phrase.length <= 30) {
      const struck = phrase.match(/^(.+?)(?:敲着|敲打着?)(.+)$/u);
      const lit = phrase.match(/^(.+?)(?:照着|照亮了?)(.+)$/u);
      if (struck && /雨/u.test(struck[1])) image = struck[2] + "上的雨声";
      if (lit && /灯/u.test(lit[1])) image = lit[2].replace(/^一(?:封|张|页)/u, "") + "上的灯光";
    } else if (!chinese && phrase.length <= 64) {
      const action = phrase.match(/^((?:an?|the) [\p{L} -]+?) (holds|falls|shines|floats|rests|rises|moves|waits)\b(.*)$/iu);
      if (action && imageNoun.test(action[1])) image = lowerInitial(action[1]) + " " + verbs.get(action[2].toLowerCase()) + action[3];
      else if (imageNoun.test(phrase)) image = lowerInitial(phrase);
    }
    return { quote, phrase, image, direct };
  }

  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
  const lowerInitial = text => text.charAt(0).toLowerCase() + text.slice(1);

  function compose(first, second, relation) {
    first = clean(first);
    second = clean(second);
    if (!first || !second) return first || second;
    const chinese = hasChinese(first, second);
    const a = readThought(first, chinese);
    const b = readThought(second, chinese);
    const common = sharedThemes(first, second);
    if (!a.direct || !b.direct) {
      // Keep a doubt, wish, question or negation as something the author said;
      // it must not be silently converted into an affirmative shared feeling.
      return chinese ? "让" + a.quote + "与" + b.quote + "并排停留，也许能为各自的心情多留一点被理解的空间。"
        : "Let " + a.quote + " sit beside " + b.quote + ", leaving a little more room to understand each thought on its own terms.";
    }
    const meals = mealContext(first, second);
    if (meals) {
      const images = chinese ? mealImage(first, true, a) + "与" + mealImage(second, true, b) : a.image + " and " + b.image;
      const ending = meals.safe
        ? chinese ? "让一顿饭的熟悉延续成心里的安心" : "let the familiarity of a meal carry a feeling of safety into this moment"
        : meals.away
          ? chinese ? "把离开后的想念，接回熟悉的日常里" : "bring the feeling of being away into contact with a familiar everyday moment"
          : chinese ? "让一顿饭把过去与此刻轻轻连在一起" : "let the memory of a meal bring the past a little closer to the present";
      return chinese ? images + "在这里相遇，" + ending + "。" : capitalize(images) + " meet here to " + ending + ".";
    }
    const intent = chinese ? /^(?:我|我们)(?:想要|希望|愿意)(.+)$/u : /^(?:I|we) (?:want to|hope to|would like to) (.+)$/i;
    const firstIntent = a.direct && a.phrase.match(intent)?.[1];
    const secondIntent = b.direct && b.phrase.match(intent)?.[1];
    if (firstIntent && secondIntent && firstIntent.length + secondIntent.length <= 100) {
      if (!chinese && /\b(?:my|our|your|their|me|us|you)\b/i.test(firstIntent + " " + secondIntent)) {
        return "Let the wish in " + a.quote + " meet the wish in " + b.quote + ", with room for both to grow.";
      }
      return chinese ? "让「" + firstIntent + "」与「" + secondIntent + "」一起生长，为两个愿望留出同一个开始。"
        : "To " + firstIntent + " and to " + secondIntent + " can become two ways of beginning something together.";
    }

    const pair = chinese ? a.image + "与" + b.image : a.image + " and " + b.image;
    const sharedTone = a.direct && b.direct ? tone.find(([cue]) => cue.test(a.phrase) && cue.test(b.phrase)) : null;
    if (sharedTone) return chinese ? pair + "让人想到" + sharedTone[2] + "。"
      : capitalize(pair) + " both evoke " + sharedTone[1] + ".";

    const sensoryPair = a.direct && b.direct && ((sound.test(a.phrase) && light.test(b.phrase))
      || (light.test(a.phrase) && sound.test(b.phrase)));
    if (sensoryPair) {
      const [heard, seen] = sound.test(a.phrase) ? [a, b] : [b, a];
      if (chinese && /窗外/u.test(heard.phrase) && /书桌|桌前/u.test(seen.phrase)) {
        return heard.image + "衬着" + seen.image + "，窗外与桌前仿佛属于同一个片刻。";
      }
      return chinese ? "从" + heard.image + "到" + seen.image + "，两条想法拼成一个有声有光的场景。"
        : capitalize(pair) + " could share a scene, one heard and the other seen.";
    }

    // These themes only phrase the connection. They never affect the embedding
    // ranking, and both original texts must contain evidence for the theme.
    if (common.length) {
      const theme = common[0];
      return chinese ? pair + "在这里相遇，" + theme.ending + "。"
        : capitalize(pair) + " meet here to " + theme.end + ".";
    }

    const feeling = tone.find(([cue]) => a.direct && cue.test(a.phrase));
    const otherFeeling = tone.find(([cue]) => b.direct && cue.test(b.phrase));
    if ((feeling && b.image !== b.quote) || (otherFeeling && a.image !== a.quote)) {
      const [subject, scene, emotion] = feeling && b.image !== b.quote ? [a, b, feeling] : [b, a, otherFeeling];
      return chinese ? "从" + scene.image + "里，可以想象" + subject.quote + "中" + emotion[2] + "的样子。"
        : capitalize(scene.image) + " offers a way to picture " + emotion[1] + " in " + subject.quote + ".";
    }

    return chinese ? "在" + a.quote + "里，为" + b.quote + "留一点位置，让两个念头在同一个片刻继续生长。"
      : "Leave a little room for " + b.quote + " inside " + a.quote + ", and let both thoughts grow into the same moment.";
  }

  window.GardenConnections = { match, rank, cosine, describe, compose };
})();
