(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const PETAL_SAMPLES = 24;
  const REDUCED_PETAL_SAMPLES = 14;
  const GARDEN_AZIMUTH = -0.43;
  const GARDEN_ELEVATION = 0.50;
  const GARDEN_DISTANCE = 5.8;
  const EDGE_PROFILES = ["front", "shoulder", "crown", "back"];
  const PALETTES = [
    [[80, 35, 88], [204, 95, 135], [247, 166, 140], [255, 231, 204]],
    [[57, 42, 105], [158, 107, 210], [210, 175, 243], [244, 227, 255]],
    [[42, 53, 108], [106, 135, 205], [153, 215, 248], [224, 247, 255]],
    [[93, 42, 103], [202, 99, 154], [251, 162, 138], [255, 223, 187]],
  ];

  const PETAL_TINTS = new Map([
    ['peach', [[100, 42, 64], [229, 113, 114], [255, 165, 129], [255, 234, 197]]],
    ['lilac', [[55, 39, 102], [169, 111, 218], [217, 177, 245], [244, 224, 255]]],
    ['blue', [[34, 58, 101], [85, 146, 214], [149, 207, 247], [221, 247, 255]]],
  ].map(([name, tint]) => {
    const palettes = new Map(PALETTES.map(palette => {
      const tinted = palette.map((tone, index) => tone.map((channel, rgb) =>
        Math.round(channel * 0.16 + tint[index][rgb] * 0.84)));
      return [palette, tinted];
    }));
    return [name, palettes];
  }));

  // Each modifier follows the original reach, rise, shoulder width, and belly axes.
  const FLOWER_FORMS = new Map([
    ['flared', { bud: [1.10, 0.90, 0.94, 1], bloom: [1.21, 0.72, 0.95, 1], curl: 0.58 }],
    ['tall', { bud: [0.83, 1.13, 0.86, 0.92], bloom: [0.78, 1.28, 0.82, 0.93], curl: 1.08 }],
  ]);

  // Dimensions are relative to the flower's size. Each stage describes
  // the radial reach, rise, shoulder width, and belly of one petal.
  const LAYERS = [
    {
      count: 7, phase: 0.32, root: 0, delay: 0.08,
      bud: [0.095, 1.01, 0.15, 0.175],
      half: [0.55, 0.80, 0.24, 0.095],
      bloom: [1.03, 0.31, 0.32, -0.075],
    },
    {
      count: 6, phase: 0.87, root: 0.038, delay: -0.035,
      bud: [0.070, 1.03, 0.128, 0.112],
      half: [0.39, 0.75, 0.205, 0.100],
      bloom: [0.79, 0.43, 0.28, -0.058],
    },
    {
      count: 5, phase: 0.59, root: 0.073, delay: -0.14,
      bud: [0.042, 0.92, 0.099, 0.075],
      half: [0.24, 0.65, 0.148, 0.075],
      bloom: [0.49, 0.48, 0.205, -0.035],
    },
  ];

  function petalDetail(seed, ring) {
    let state = Math.imul(seed + 815, 2654435761) >>> 0;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const folds = [-0.53, 0.06, 0.56].slice(0, ring === 0 ? 3 : 2).map((cross, index) => ({
      cross: cross + (next() - 0.5) * 0.18,
      bend: (next() - 0.5) * 0.38,
      width: 0.16 + next() * 0.105,
      lift: (0.75 + next() * 0.44) * (index === 1 ? -0.039 : 0.056),
    }));
    const count = [24, 18, 12][ring];
    const grain = Array.from({ length: count }, (_, index) => {
      const cross = -0.87 + (index + next()) * 1.74 / count;
      const primary = index % 3 === 0;
      const start = primary ? 0.12 + next() * 0.21 : 0.24 + next() * 0.50;
      const end = Math.min(0.95, start + (primary ? 0.45 + next() * 0.28 : 0.12 + next() * 0.25));
      return {
        cross, start, end,
        bend: (next() - 0.5) * (primary ? 0.24 : 0.14),
        branch: index % 6 === 0 ? (next() - 0.5) * 0.25 : 0,
        tone: index % 3,
      };
    });
    const flecks = Array.from({ length: [19, 12, 7][ring] }, () => ({
      t: 0.34 + next() * 0.54,
      cross: (next() - 0.5) * 1.66,
      radius: 0.0010 + 0.0022 * next() ** 2,
    }));
    return { folds, grain, flecks };
  }

  const PETALS = LAYERS.flatMap((layer, ring) =>
    Array.from({ length: layer.count }, (_, index) => {
      const seed = index + 7 * ring;
      return {
        layer,
        ring,
        seed,
        ...petalDetail(seed, ring),
        curl: ring === 0 ? {
          start: 0.61 + 0.055 * Math.sin(seed * 2.17 + 0.6),
          angle: 0.86 + 0.20 * Math.sin(seed * 1.91 + 1.24),
          cup: 0.11 + 0.047 * Math.cos(seed * 2.63),
          tilt: 0.089 * Math.sin(seed * 2.81 + 0.27),
        } : null,
        angle: layer.phase + (index / layer.count) * TAU + 0.032 * Math.sin(2.42 * seed),
        reach: 1 + 0.10 * Math.sin(seed * 3.41 + 1.2),
        height: 1 + 0.065 * Math.cos(seed * 1.77),
        twist: 0.10 * Math.sin(seed * 5.14 + 0.3),
        palette: PALETTES[(index * 3 + ring) % PALETTES.length],
      };
    })
  );

  const mix = (from, to, fraction) => from + (to - from) * fraction;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const color = ([r, g, b], alpha) => 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  const smooth = value => value * value * (3 - 2 * value);

  function foldCenter(fold, t) {
    return fold.cross * (0.48 + 0.52 * t) + fold.bend * Math.sin(Math.PI * t);
  }

  function foldProfile(distance) {
    const crest = Math.max(0, 1 - distance * distance);
    return crest * crest;
  }

  function projector(x, y, size, yaw, pitch, time, camera, focus = 0) {
    const azimuth = camera?.azimuth ?? GARDEN_AZIMUTH + yaw;
    const elevation = camera?.elevation ?? clamp(GARDEN_ELEVATION + pitch, 0.16, 0.86);
    const distance = camera?.distance ?? GARDEN_DISTANCE;
    const cy = Math.cos(azimuth);
    const sy = Math.sin(azimuth);
    const cp = Math.cos(elevation);
    const sp = Math.sin(elevation);
    const sway = 0.028 * Math.sin(time * 1.12) * (1 - 0.78 * focus);
    const tilt = camera?.tilt;
    const tiltLength = Math.hypot(tilt?.x ?? 0, tilt?.y ?? 0);
    const tiltAngle = Number.isFinite(tilt?.angle) && Number.isFinite(tiltLength) && tiltLength > 0
      ? clamp(tilt.angle, -0.70, 0.70) : 0;
    const tiltX = tiltAngle ? tilt.x / tiltLength : 0;
    const tiltY = tiltAngle ? tilt.y / tiltLength : 0;
    const tiltCos = Math.cos(tiltAngle);
    const tiltSin = Math.sin(tiltAngle);
    return (wx, wy, wz) => {
      const movingX = wx + sway * (wy + 0.45);
      const cameraX = movingX * cy + wz * sy;
      const cameraZ = wz * cy - movingX * sy;
      const depth = cameraZ * cp + wy * sp;
      if (tiltAngle) {
        // Rotate the camera-facing depth into the direction of the neighboring flower.
        const screenY = cameraZ * sp - wy * cp;
        const along = cameraX * tiltX + screenY * tiltY;
        const tiltedAlong = along * tiltCos + depth * tiltSin;
        const tiltedDepth = depth * tiltCos - along * tiltSin;
        const delta = tiltedAlong - along;
        const factor = size * GARDEN_DISTANCE / (distance - tiltedDepth);
        return {
          x: x + (cameraX + tiltX * delta) * factor,
          y: y + (screenY + tiltY * delta) * factor,
          depth: tiltedDepth,
        };
      }
      // Fixed focal scale makes a smaller camera distance a physical dolly in.
      const factor = size * GARDEN_DISTANCE / (distance - depth);
      return {
        x: x + cameraX * factor,
        y: y - (wy * cp - cameraZ * sp) * factor,
        depth,
      };
    };
  }

  function samplePetal(petal, openness, project, time, {
    form, palettes, samples = PETAL_SAMPLES, assembly = 0, partner = false,
  } = {}) {
    const { layer, seed, curl, grain, flecks } = petal;
    const curlProgress = curl ? smooth(clamp((openness - 0.56) / 0.44, 0, 1)) : 0;
    const folds = curlProgress ? petal.folds.map((fold, index) => ({
      ...fold,
      bend: fold.bend + 0.077 * curlProgress * Math.sin(seed * 1.64 + index * 2.35),
      lift: fold.lift * (1 + 0.24 * curlProgress * Math.cos(seed * 2.10 - index * 2.65)),
    })) : petal.folds;
    const opening = clamp(openness + layer.delay * Math.sin(openness * Math.PI), 0, 1);
    const firstHalf = opening < 0.5;
    const from = firstHalf ? layer.bud : layer.half;
    const to = firstHalf ? layer.half : layer.bloom;
    const fraction = firstHalf ? opening * 2 : (opening - 0.5) * 2;
    const [reach, rise, width, belly] = from.map((value, index) => {
      const dimension = mix(value, to[index], fraction);
      const original = form ? dimension * mix(form.bud[index], form.bloom[index], opening) : dimension;
      if (!assembly) return original;
      // Two alternating outer rings need narrower shoulders, with their rolled edges intact.
      const widthScale = index === 2 ? [0.66, 0.87, 0.96][petal.ring] : 1;
      const shared = mix(original, dimension, 0.76) * widthScale;
      return mix(original, shared, assembly);
    });
    const naturalAngle = petal.angle + petal.twist * opening + 0.012 * Math.sin(time * 1.4 + seed);
    const angle = assembly && petal.ring === 0
      ? naturalAngle + Math.PI / layer.count * assembly * (partner ? 0.88 : -0.12)
      : naturalAngle;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rootRadius = 0.025 + 0.021 * petal.ring;
    const waviness = 0.55 + 0.45 * opening;
    const originalCurl = form?.curl ?? 1;
    const curlScale = assembly ? mix(originalCurl, 1, assembly * 0.45) : originalCurl;

    // Each petal starts as a curved midsurface in radial, vertical, and crosswise coordinates.
    function surface(t, across) {
      const silhouette = Math.max(0, Math.sin(Math.PI * t));
      const widthAtT = width * Math.pow(silhouette, 0.49) * (0.43 + 0.86 * t);
      const cup = across * across * silhouette;
      const ripple = Math.sin(t * 10.5 + seed * 0.78 + across * 1.75) * silhouette;
      const lip = Math.pow(t, 4);
      let fluting = 0;
      for (const fold of folds) {
        const distance = (across - foldCenter(fold, t)) / fold.width;
        fluting += fold.lift * (foldProfile(distance) - 0.44 * foldProfile((distance - 0.78) * 1.12));
      }
      const edgeWeight = Math.min(1, Math.abs(across)) ** 4;
      const relief = fluting * silhouette * (0.43 + 0.57 * t) * waviness * (1 - 0.73 * edgeWeight);
      // Unequal waves at the outer shoulder make the rolled rim gently scalloped.
      const edgeWave = edgeWeight * silhouette * t * t * waviness * (
        0.63 * Math.sin(14.6 * t + seed * 0.66 + across * 2.8)
        + 0.37 * Math.sin(22.0 * t - seed * 1.13 + across * 1.3)
      );
      let curlRise = 0;
      let curlInset = 0;
      if (curlProgress) {
        const bend = Math.max(0, t - curl.start);
        const turn = curlProgress * curl.angle * curlScale * bend / (1 - curl.start);
        if (turn > 0.0001) {
          // Turn the terminal length into a soft rising arc.
          const arc = bend * reach * petal.reach;
          curlRise = arc * 2 * Math.sin(turn * 0.5) ** 2 / turn;
          curlInset = arc * (1 - Math.sin(turn) / turn);
        }
        const shoulder = (curl.cup * across * across + curl.tilt * across) * curlScale;
        curlRise += curlProgress * shoulder * silhouette * t * t;
      }
      const radial = rootRadius + t * reach * petal.reach + belly * silhouette
        - cup * 0.093 * opening + ripple * 0.014 * waviness
        - relief * (0.54 - 0.32 * opening) + edgeWave * 0.075 - curlInset;
      const sideways = across * widthAtT + petal.twist * t * t
        + across * (ripple * 0.017 * waviness + edgeWave * 0.089);
      const height = layer.root + rise * petal.height * (t - 0.15 * opening * silhouette)
        + cup * (0.040 + 0.120 * opening)
        + lip * (0.025 + 0.072 * opening) * Math.sin(seed)
        + 0.018 * t * Math.sin(time * 1.8 + seed) + ripple * waviness * cup * 0.034
        + relief * (0.68 + 0.32 * opening) + edgeWave * 0.103 + curlRise;
      return [radial, height, sideways];
    }

    const projectLocal = (radial, height, sideways) =>
      project(radial * cosine - sideways * sine, height, radial * sine + sideways * cosine);

    function basisAt(t, across) {
      const alongBefore = surface(t - 0.003, across);
      const alongAfter = surface(t + 0.003, across);
      const acrossBefore = surface(t, across - 0.01);
      const acrossAfter = surface(t, across + 0.01);
      const [ax, ay, az] = acrossAfter.map((value, index) => value - acrossBefore[index]);
      const [bx, by, bz] = alongAfter.map((value, index) => value - alongBefore[index]);
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      const acrossLength = Math.hypot(ax, ay, az) || 1;
      const alongLength = Math.hypot(bx, by, bz) || 1;
      return {
        normal: [nx / normalLength, ny / normalLength, nz / normalLength],
        across: [ax / acrossLength, ay / acrossLength, az / acrossLength],
        along: [bx / alongLength, by / alongLength, bz / alongLength],
      };
    }

    // Keep the face-to-face thickness and roll the perimeter out along the
    // local tangent to give the bevel a round cross-section.
    function shell(t, across) {
      const center = surface(t, across);
      const tipBlend = smooth(clamp((t - 0.79) / 0.21, 0, 1));
      const basis = basisAt(clamp(t, 0.022, 0.978), across * (1 - tipBlend));
      const thickness = (0.004 + 0.037 * smooth(Math.min(1, t * 2.8))
        + 0.014 * Math.sin(Math.PI * t) - 0.008 * Math.pow(t, 6)) * (1 - petal.ring * 0.10);
      const outer = basis.across.map((value, index) => mix(value * across, basis.along[index], tipBlend));
      const vertex = (normalOffset, edgeOffset) => projectLocal(...center.map((value, index) =>
        value + thickness * (basis.normal[index] * normalOffset + outer[index] * edgeOffset)));
      return {
        front: vertex(0.5, 0),
        shoulder: vertex(0.24, 0.32),
        crown: vertex(0, 0.42),
        back: vertex(-0.5, 0),
      };
    }

    const makeEdge = () => ({ front: [], shoulder: [], crown: [], back: [] });
    const left = makeEdge();
    const right = makeEdge();
    for (let index = 0; index <= samples; index++) {
      // Sample more closely around the broad round cap.
      const t = (1 - Math.cos(Math.PI * index / samples)) * 0.5;
      const a = shell(t, t === 0 ? 0 : -1);
      const b = index === 0 || index === samples ? a : shell(t, 1);
      for (const profile of EDGE_PROFILES) {
        left[profile].push(a[profile]);
        right[profile].push(b[profile]);
      }
    }

    const mid = surface(0.58, 0);
    const middle = projectLocal(...mid);
    const normal = basisAt(0.58, 0).normal;
    const projectedNormal = projectLocal(...mid.map((value, index) => value + normal[index] * 0.1));
    const tip = left.front[samples];
    const facing = clamp(Math.abs(projectedNormal.depth - middle.depth) * 10, 0, 1);
    const lens = {
      x: projectedNormal.x - middle.x,
      y: projectedNormal.y - middle.y,
      facing,
    };
    // Light paths use the midsurface and are clipped to the projected glass.
    const point = (t, across) => projectLocal(...surface(t, across));
    return {
      point, left, right, lens, tip, folds, grain, flecks, seed,
      palette: palettes?.get(petal.palette) ?? petal.palette,
      root: left.front[0],
      depth: middle.depth * 0.76 + tip.depth * 0.24,
    };
  }

  function curve(ctx, points) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) * 0.5, (point.y + next.y) * 0.5);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function alongPetal(ctx, petal, stops) {
    const gradient = ctx.createLinearGradient(petal.root.x, petal.root.y, petal.tip.x, petal.tip.y);
    for (const [offset, tint, opacity] of stops) gradient.addColorStop(offset, color(tint, opacity));
    return gradient;
  }

  function paintBevel(ctx, petal, edge, lightAmount, size) {
    const { front, shoulder, crown, back } = edge;
    const { palette, lens } = petal;
    const [shadow, blush, body, light] = palette;
    const frost = [198, 228, 255];
    const warm = [255, 242, 218];
    const last = front.length - 1;
    const grazing = 1 - lens.facing;
    ctx.beginPath();
    curve(ctx, front.concat(crown[last], back.slice().reverse(), crown[0], front[0]));
    ctx.closePath();
    ctx.fillStyle = alongPetal(ctx, petal, [
      [0, shadow, 0.14], [0.29, shadow, 0.42 + grazing * 0.12],
      [0.56, blush, 0.46], [0.74, body, 0.40],
      [0.88, shadow, 0.42], [1, body, 0.37],
    ]);
    ctx.fill();
    ctx.save();
    ctx.clip();

    // These overlapping reflections soften the transition around the curved rim.
    ctx.beginPath();
    curve(ctx, crown);
    ctx.strokeStyle = alongPetal(ctx, petal, [
      [0, frost, 0], [0.32, frost, 0.11], [0.60, frost, 0.26 + grazing * 0.27],
      [0.81, frost, 0.08], [0.92, light, 0.38], [1, light, 0.44],
    ]);
    ctx.lineWidth = Math.max(1, size * 0.023);
    ctx.stroke();

    ctx.beginPath();
    curve(ctx, shoulder);
    ctx.strokeStyle = alongPetal(ctx, petal, [
      [0, warm, 0], [0.38, light, 0.10 + lightAmount * 0.18],
      [0.61, warm, 0.35 + lightAmount * 0.42], [0.77, light, 0.15],
      [0.91, warm, 0.20 + lightAmount * 0.18], [1, warm, 0.45],
    ]);
    ctx.lineWidth = Math.max(0.7, size * 0.012);
    ctx.stroke();
    ctx.restore();
  }

  function transmitBackdrop(ctx, petal, backdrop, size, yaw, pitch) {
    if (!backdrop) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const side of [petal.left.front, petal.right.front]) {
      for (const point of side) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const { lens } = petal;
    const shiftX = lens.x * 0.66 + yaw * size * 0.20;
    const shiftY = lens.y * 0.53 + pitch * size * 0.18;
    const magnification = 1.04 + 0.10 * lens.facing;
    const sourceWidth = width / magnification;
    const sourceHeight = height / magnification;
    const sourceX = minX + (width - sourceWidth) * 0.5 + shiftX - backdrop.x;
    const sourceY = minY + (height - sourceHeight) * 0.5 + shiftY - backdrop.y;

    // Modest transmission lets the other petals continue to show through.
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha *= 0.14 + lens.facing * 0.17;
    ctx.drawImage(backdrop.image,
      sourceX / backdrop.scale, sourceY / backdrop.scale,
      sourceWidth / backdrop.scale, sourceHeight / backdrop.scale,
      minX, minY, width, height);
    ctx.globalAlpha = alpha;
  }

  function paintTransmittedLight(ctx, petal, size, yaw, pitch) {
    const { lens, seed, palette } = petal;
    const warm = [255, 232, 196];
    const [ , , body, light] = palette;
    const phase = Math.sin(seed * 1.79);
    const t = clamp(0.65 - pitch * 0.84 + yaw * 0.39 + phase * 0.10, 0.38, 0.90);
    const across = clamp(-0.24 + yaw * 2.25 + lens.x * 3.1 / size, -0.75, 0.75);
    const focus = petal.point(t, across);
    const radius = size * (0.14 + lens.facing * 0.08);
    const incidence = 0.5 + 0.5 * Math.sin(seed * 1.79 + yaw * 4.9 - pitch * 3.2 + lens.x * 9 / size);
    const strength = 0.13 + lens.facing * 0.13 + 0.43 * incidence ** 3;
    const glow = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, radius);
    glow.addColorStop(0, color(warm, strength));
    glow.addColorStop(0.14, color(warm, strength * 0.78));
    glow.addColorStop(0.39, color(light, strength * 0.40));
    glow.addColorStop(0.68, color(body, strength * 0.10));
    glow.addColorStop(1, color(body, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(focus.x - radius, focus.y - radius, radius * 2, radius * 2);

    // A narrow arc follows the curved surface where the transmitted light gathers.
    const filament = [];
    for (let index = 0; index <= 10; index++) {
      const u = index / 10;
      const cross = clamp(across - 0.40 + u * 0.94, -0.96, 0.96);
      filament.push(petal.point(t + Math.sin(Math.PI * u) * (0.041 + phase * 0.024) + cross * 0.06, cross));
    }
    const first = filament[0];
    const last = filament[filament.length - 1];
    const highlight = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    highlight.addColorStop(0, color(warm, 0));
    highlight.addColorStop(0.44, color(warm, strength * 1.39));
    highlight.addColorStop(0.69, color(light, strength * 0.84));
    highlight.addColorStop(1, color(light, 0));
    ctx.beginPath();
    curve(ctx, filament);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = Math.max(0.48, size * 0.006);
    ctx.stroke();
  }

  function paintFolds(ctx, petal, size, yaw, reduced) {
    const { folds, palette, lens } = petal;
    const [shadow, blush, , light] = palette;
    const amber = [255, 225, 194];
    const visibility = 0.49 + 0.51 * lens.facing;
    const samples = reduced ? 8 : 12;
    // Each lit crest and its soft shadow follow the geometry's longitudinal fold.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (const fold of folds) {
        const points = [];
        const flank = (side * Math.sign(fold.lift) * 0.30 + yaw * 0.65) * fold.width;
        for (let index = 0; index <= samples; index++) {
          const t = 0.12 + index / samples * 0.81;
          points.push(petal.point(t, foldCenter(fold, t) + flank));
        }
        curve(ctx, points);
      }

      const shaded = side === -1;
      const tone = shaded ? shadow : amber;
      ctx.strokeStyle = alongPetal(ctx, petal, [
        [0, tone, 0], [0.18, tone, 0.05 * visibility],
        [0.42, shaded ? shadow : light, (shaded ? 0.14 : 0.35) * visibility],
        [0.63, shaded ? blush : amber, (shaded ? 0.17 : 0.25) * visibility],
        [0.82, tone, 0.10 * visibility], [1, tone, 0],
      ]);
      ctx.lineWidth = Math.max(0.74, size * (shaded ? 0.017 : 0.013));
      ctx.stroke();
    }
  }

  function grainPoint(petal, strand, t, branch = 0) {
    const fan = strand.cross * (0.62 + t * 0.38);
    const bend = strand.bend * Math.sin(Math.PI * t)
      + 0.031 * Math.sin(4.6 * t + petal.seed * 0.72 + strand.cross * 3.3);
    return petal.point(t, fan + bend + branch);
  }

  function paintPetalGrain(ctx, petal, size, reduced) {
    const { grain, flecks, lens, palette } = petal;
    const [shadow, , body, light] = palette;
    const warmth = [255, 228, 211];
    const visibility = 0.26 + 0.74 * lens.facing;
    const tones = [warmth, light, shadow];
    const widths = [0.0031, 0.0023, 0.0021];
    const samples = reduced ? 4 : 7;
    const stride = reduced ? 2 : 1;
    for (let tone = 0; tone < tones.length; tone++) {
      ctx.beginPath();
      for (let strandIndex = 0; strandIndex < grain.length; strandIndex += stride) {
        const strand = grain[strandIndex];
        if (strand.tone !== tone) continue;
        const points = [];
        for (let index = 0; index <= samples; index++) {
          const u = index / samples;
          const t = mix(strand.start, strand.end, u);
          points.push(grainPoint(petal, strand, t));
        }
        curve(ctx, points);

        if (!reduced && strand.branch) {
          const branch = [];
          for (let index = 0; index <= 4; index++) {
            const u = index / 4;
            const t = mix(strand.start, strand.end, 0.41 + 0.45 * u);
            branch.push(grainPoint(petal, strand, t, strand.branch * u * u));
          }
          curve(ctx, branch);
        }
      }
      const tint = tones[tone];
      const peak = (tone === 0 ? 0.34 : tone === 1 ? 0.27 : 0.20) * visibility;
      ctx.strokeStyle = alongPetal(ctx, petal, [
        [0, tint, 0], [0.19, tint, peak * 0.32], [0.40, tint, peak],
        [0.65, tint, peak * 0.70], [0.83, tone === 2 ? shadow : body, peak * 0.42], [1, tint, 0],
      ]);
      ctx.lineWidth = Math.max(0.40, size * widths[tone]);
      ctx.stroke();
    }

    if (reduced) return;
    ctx.beginPath();
    for (const fleck of flecks) {
      const point = petal.point(fleck.t, fleck.cross);
      const radius = Math.max(0.23, size * fleck.radius);
      ctx.moveTo(point.x + radius, point.y);
      ctx.arc(point.x, point.y, radius, 0, TAU);
    }
    ctx.fillStyle = alongPetal(ctx, petal, [
      [0, warmth, 0], [0.25, warmth, 0.035 * visibility], [0.59, warmth, 0.28 * visibility],
      [0.82, light, 0.14 * visibility], [1, light, 0],
    ]);
    ctx.fill();
  }

  function paintPetal(ctx, petal, size, yaw, pitch, backdrop, reduced) {
    const { left, right, palette, seed } = petal;
    const [shadow, blush, body, light] = palette;
    const white = [255, 249, 229];
    const ice = [181, 225, 255];
    const samples = left.front.length - 1;
    const shoulder = Math.round(samples * 0.56);
    const leftShoulder = left.front[shoulder];
    const rightShoulder = right.front[shoulder];
    const leftLight = clamp(0.5 + (rightShoulder.x - leftShoulder.x) / (size * 0.34), 0.09, 0.91);
    paintBevel(ctx, petal, right, 1 - leftLight, size);
    paintBevel(ctx, petal, left, leftLight, size);

    ctx.beginPath();
    curve(ctx, left.front.concat(right.front.slice(1, -1).reverse(), left.front[0]));
    ctx.closePath();
    ctx.save();
    ctx.clip();
    transmitBackdrop(ctx, petal, backdrop, size, yaw, pitch);

    ctx.fillStyle = alongPetal(ctx, petal, [
      [0, shadow, 0.64], [0.24, blush, 0.40], [0.46, body, 0.17],
      [0.63, blush, 0.065], [0.83, shadow, 0.12], [1, body, 0.23],
    ]);
    ctx.fill();

    const across = ctx.createLinearGradient(leftShoulder.x, leftShoulder.y, rightShoulder.x, rightShoulder.y);
    const acrossStops = [
      [0, light, 0.21 + leftLight * 0.12], [0.17, body, 0.12], [0.34, body, 0.015],
      [0.63, shadow, 0.035], [0.83, shadow, 0.13], [1, ice, 0.30 - leftLight * 0.10],
    ];
    for (const [offset, tint, opacity] of acrossStops) across.addColorStop(offset, color(tint, opacity));
    ctx.fillStyle = across;
    ctx.fill();

    paintFolds(ctx, petal, size, yaw, reduced);
    paintPetalGrain(ctx, petal, size, reduced);
    paintTransmittedLight(ctx, petal, size, yaw, pitch);

    const reflected = [];
    const gleamSide = 1 - 2 * leftLight;
    for (let index = 0; index <= 13; index++) {
      const u = index / 13;
      const t = 0.22 + 0.70 * u;
      const bow = Math.sin(Math.PI * u);
      const center = gleamSide * (0.70 - 0.33 * bow + 0.052 * Math.sin(seed + 7.8 * u)) + yaw * 0.51;
      reflected.push(petal.point(t, center));
    }
    ctx.beginPath();
    curve(ctx, reflected);
    ctx.strokeStyle = alongPetal(ctx, petal, [
      [0, ice, 0], [0.34, ice, 0.06], [0.53, white, 0.39], [0.68, light, 0.53],
      [0.82, light, 0.15], [1, light, 0],
    ]);
    ctx.lineWidth = Math.max(0.60, size * 0.007);
    ctx.stroke();

    const root = petal.root;
    const contact = ctx.createRadialGradient(root.x, root.y, 0, root.x, root.y, size * 0.24);
    contact.addColorStop(0, color(shadow, 0.47));
    contact.addColorStop(0.55, color(shadow, 0.11));
    contact.addColorStop(1, color(shadow, 0));
    ctx.fillStyle = contact;
    ctx.fillRect(root.x - size * 0.24, root.y - size * 0.24, size * 0.48, size * 0.48);
    ctx.restore();

    // Localized gleams on the polished lip keep the rest of the outline translucent.
    if (seed % 3 !== 2) {
      const sparkleEdge = seed % 2 ? left.shoulder : right.shoulder;
      const travel = clamp(samples * (0.72 + yaw * 0.31 + pitch * 0.21) + seed % 3 * samples / PETAL_SAMPLES, 0, samples - 1);
      const index = Math.floor(travel);
      const offset = travel - index;
      const x = mix(sparkleEdge[index].x, sparkleEdge[index + 1].x, offset);
      const y = mix(sparkleEdge[index].y, sparkleEdge[index + 1].y, offset);
      const radius = Math.max(1.5, size * 0.027);
      const flare = 0.31 + 0.64 * (1 - petal.lens.facing) ** 2;
      const glare = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glare.addColorStop(0, color(white, flare));
      glare.addColorStop(0.19, color(light, flare * 0.55));
      glare.addColorStop(0.51, color(light, flare * 0.15));
      glare.addColorStop(1, color(light, 0));
      ctx.fillStyle = glare;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  function paintRimSweep(ctx, petal, size, strength) {
    const last = petal.left.crown.length - 1;
    const start = Math.round(last * 0.50);
    const outline = petal.left.crown.slice(start).concat(petal.right.crown.slice(start, last).reverse());
    const amber = [255, 176, 109];
    const honey = [255, 217, 157];
    const pearl = [255, 243, 206];

    // Follow the projected rolled edge, preserving its existing occlusion order.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    curve(ctx, outline);
    ctx.strokeStyle = alongPetal(ctx, petal, [
      [0.34, amber, 0], [0.58, amber, 0.09 * strength],
      [0.80, amber, 0.21 * strength], [1, honey, 0.25 * strength],
    ]);
    ctx.lineWidth = Math.max(2, size * 0.040);
    ctx.stroke();
    ctx.strokeStyle = alongPetal(ctx, petal, [
      [0.39, honey, 0], [0.63, honey, 0.20 * strength],
      [0.83, honey, 0.70 * strength], [1, pearl, 0.95 * strength],
    ]);
    ctx.lineWidth = Math.max(1, size * 0.013);
    ctx.stroke();
    ctx.restore();
  }

  function paintLeaf(ctx, project, size, leaf) {
    const { side, startY, endY, endX, width, depth } = leaf;
    const start = project(startY * startY * 0.105, startY, 0);
    const end = project(endX, endY, depth);
    const surface = offset => ({
      topA: project(side * width * 0.85, startY + 0.29 + offset * 0.50, depth * 0.36 + offset),
      topB: project(endX * 0.76, endY + 0.14 + offset * 0.68, depth * 0.76 + offset),
      bottomA: project(endX * 0.35, startY - 0.13 + offset * 0.72, depth * 0.43 + offset),
      bottomB: project(endX * 0.87, endY - 0.12 + offset * 0.60, depth * 0.81 + offset),
    });
    const back = surface(-0.024);
    const front = surface(0.017);
    const beginLeaf = face => {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(face.topA.x, face.topA.y, face.topB.x, face.topB.y, end.x, end.y);
      ctx.bezierCurveTo(face.bottomB.x, face.bottomB.y, face.bottomA.x, face.bottomA.y, start.x, start.y);
      ctx.closePath();
    };

    const edge = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    edge.addColorStop(0, 'rgba(165,127,183,0.36)');
    edge.addColorStop(0.38, 'rgba(225,180,211,0.52)');
    edge.addColorStop(0.75, 'rgba(186,173,230,0.64)');
    edge.addColorStop(1, 'rgba(214,212,247,0.42)');
    beginLeaf(back);
    ctx.fillStyle = 'rgba(112,92,159,0.24)';
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(0.5, size * 0.006);
    ctx.stroke();

    const underside = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    underside.addColorStop(0, 'rgba(141,100,154,0.22)');
    underside.addColorStop(0.45, 'rgba(152,123,196,0.72)');
    underside.addColorStop(0.82, 'rgba(170,201,239,0.74)');
    underside.addColorStop(1, 'rgba(215,214,245,0.48)');
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.bezierCurveTo(front.bottomB.x, front.bottomB.y, front.bottomA.x, front.bottomA.y, start.x, start.y);
    ctx.bezierCurveTo(back.bottomA.x, back.bottomA.y, back.bottomB.x, back.bottomB.y, end.x, end.y);
    ctx.closePath();
    ctx.fillStyle = underside;
    ctx.fill();

    const upper = project(endX * 0.48, mix(startY, endY, 0.5) + 0.125, depth * 0.53);
    const lower = project(endX * 0.48, mix(startY, endY, 0.5) - 0.070, depth * 0.53);
    const face = ctx.createLinearGradient(upper.x, upper.y, lower.x, lower.y);
    face.addColorStop(0, 'rgba(244,207,215,0.65)');
    face.addColorStop(0.19, 'rgba(219,178,216,0.46)');
    face.addColorStop(0.43, 'rgba(175,143,200,0.24)');
    face.addColorStop(0.65, 'rgba(123,121,188,0.28)');
    face.addColorStop(0.87, 'rgba(158,169,216,0.48)');
    face.addColorStop(1, 'rgba(195,213,241,0.65)');
    beginLeaf(front);
    ctx.fillStyle = face;
    ctx.fill();

    const outline = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    outline.addColorStop(0, 'rgba(210,160,199,0.20)');
    outline.addColorStop(0.38, 'rgba(246,210,223,0.49)');
    outline.addColorStop(0.72, 'rgba(204,216,250,0.65)');
    outline.addColorStop(1, 'rgba(233,224,245,0.56)');
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(0.45, size * 0.004);
    ctx.stroke();

    const middleA = project(endX * 0.33, mix(startY, endY, 0.55) + 0.045, depth * 0.42 + 0.019);
    const middleB = project(endX * 0.73, mix(startY, endY, 0.81) + 0.053, depth * 0.76 + 0.014);
    const reflection = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    reflection.addColorStop(0, 'rgba(255,225,225,0)');
    reflection.addColorStop(0.32, 'rgba(255,226,223,0.22)');
    reflection.addColorStop(0.56, 'rgba(245,238,255,0.61)');
    reflection.addColorStop(0.80, 'rgba(208,234,251,0.31)');
    reflection.addColorStop(1, 'rgba(237,222,245,0)');
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(middleA.x, middleA.y, middleB.x, middleB.y, end.x, end.y);
    ctx.strokeStyle = reflection;
    ctx.lineWidth = Math.max(0.45, size * 0.005);
    ctx.stroke();
  }

  function paintStem(ctx, project, size) {
    paintLeaf(ctx, project, size, {
      side: -1, startY: -0.55, endY: -0.35, endX: -0.55, width: 0.24, depth: -0.12,
    });
    paintLeaf(ctx, project, size, {
      side: 1, startY: -0.93, endY: -0.72, endX: 0.65, width: 0.30, depth: 0.21,
    });
    const top = project(0, 0.02, 0);
    const bendA = project(-0.055, -0.38, 0.04);
    const bendB = project(0.23, -1.14, -0.06);
    const bottom = project(0.088, -1.57, 0);
    const strokeStem = (gradient, width, offset) => {
      const shift = size * offset;
      ctx.beginPath();
      ctx.moveTo(top.x + shift, top.y);
      ctx.bezierCurveTo(bendA.x + shift, bendA.y, bendB.x + shift * 0.85, bendB.y, bottom.x, bottom.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(0.44, size * width);
      ctx.stroke();
    };

    const body = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
    body.addColorStop(0, 'rgba(209,151,184,0.89)');
    body.addColorStop(0.39, 'rgba(163,124,185,0.76)');
    body.addColorStop(0.73, 'rgba(129,132,188,0.60)');
    body.addColorStop(1, 'rgba(137,116,182,0)');
    strokeStem(body, 0.028, 0);

    const core = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
    core.addColorStop(0, 'rgba(242,190,201,0.80)');
    core.addColorStop(0.36, 'rgba(219,176,210,0.65)');
    core.addColorStop(0.62, 'rgba(191,193,232,0.64)');
    core.addColorStop(1, 'rgba(168,166,219,0)');
    strokeStem(core, 0.015, 0.002);

    const litEdge = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
    litEdge.addColorStop(0, 'rgba(255,224,210,0.48)');
    litEdge.addColorStop(0.16, 'rgba(255,223,222,0.82)');
    litEdge.addColorStop(0.32, 'rgba(248,221,240,0.44)');
    litEdge.addColorStop(0.48, 'rgba(225,213,244,0.24)');
    litEdge.addColorStop(0.64, 'rgba(218,231,250,0.56)');
    litEdge.addColorStop(0.90, 'rgba(205,195,236,0.10)');
    litEdge.addColorStop(1, 'rgba(205,195,236,0)');
    strokeStem(litEdge, 0.006, -0.009);

    const coolEdge = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
    coolEdge.addColorStop(0, 'rgba(216,199,240,0.30)');
    coolEdge.addColorStop(0.31, 'rgba(192,180,226,0.19)');
    coolEdge.addColorStop(0.57, 'rgba(184,211,243,0.41)');
    coolEdge.addColorStop(0.85, 'rgba(163,170,225,0.12)');
    coolEdge.addColorStop(1, 'rgba(163,170,225,0)');
    strokeStem(coolEdge, 0.005, 0.010);
  }

  function makeHeart(project, size, openness, selected, reduced) {
    const visibility = smooth(clamp((openness - 0.24) / 0.65, 0, 1));
    if (visibility === 0) return [];

    const heart = project(0, 0.16, 0);
    const core = {
      depth: heart.depth,
      paint(ctx) {
        const radius = size * 0.16;
        const glow = ctx.createRadialGradient(heart.x, heart.y, 0, heart.x, heart.y, radius);
        glow.addColorStop(0, 'rgba(255,244,215,' + (0.85 * visibility) + ')');
        glow.addColorStop(0.2, 'rgba(255,205,166,' + (0.78 * visibility) + ')');
        glow.addColorStop(0.58, 'rgba(255,154,144,' + ((selected ? 0.35 : 0.23) * visibility) + ')');
        glow.addColorStop(1, 'rgba(255,167,185,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(heart.x, heart.y, radius, 0, TAU);
        ctx.fill();
      },
    };

    const filaments = Array.from({ length: reduced ? 11 : 22 }, (_, ordinal) => {
      const index = reduced ? ordinal * 2 : ordinal;
      const angle = index * 2.39996;
      const length = 0.068 + 0.152 * Math.sqrt(index / 21);
      const rise = 0.27 + 0.108 * (0.5 + 0.5 * Math.sin(index * 1.71));
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const start = project(0.028 * cosine, 0.13, 0.028 * sine);
      const mid = project(length * 0.74 * cosine, rise - 0.04, length * 0.74 * sine);
      const end = project(length * cosine, rise, length * sine);
      const radius = size * (0.007 + 0.007 * Math.abs(Math.sin(index * 2.1)));
      function paintTip(ctx) {
        ctx.fillStyle = 'rgba(255,227,195,' + (0.92 * visibility) + ')';
        ctx.beginPath();
        ctx.arc(end.x, end.y, radius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,244,' + (0.85 * visibility) + ')';
        ctx.beginPath();
        ctx.arc(end.x - radius * 0.22, end.y - radius * 0.23, radius * 0.40, 0, TAU);
        ctx.fill();
      }
      return {
        depth: end.depth,
        paintTip,
        paint(ctx) {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
          ctx.strokeStyle = 'rgba(255,205,169,' + (0.66 * visibility) + ')';
          ctx.lineWidth = Math.max(0.45, size * 0.0045);
          ctx.stroke();
          paintTip(ctx);
        },
      };
    });
    return [core, ...filaments];
  }

  function cameraPose(camera) {
    return camera ? {
      azimuth: Number.isFinite(camera.azimuth) ? camera.azimuth : undefined,
      elevation: Number.isFinite(camera.elevation) ? clamp(camera.elevation, 0, Math.PI / 2) : undefined,
      distance: Number.isFinite(camera.distance) ? clamp(camera.distance, 2.8, 24) : GARDEN_DISTANCE,
      tilt: camera.tilt,
    } : undefined;
  }

  function flowerView({
    x, y, size, yaw, pitch, time, camera, focus, hideStem,
  }) {
    const focusAmount = Number.isFinite(focus) ? clamp(focus, 0, 1) : 0;
    const pose = cameraPose(camera);
    const project = projector(x, y, size, yaw, pitch, time, pose, focusAmount);
    const renderSize = pose ? size * (GARDEN_DISTANCE / pose.distance) : size;
    const overhead = pose?.elevation === undefined ? 0
      : smooth(clamp((pose.elevation - 0.90) / (Math.PI / 2 - 0.90), 0, 1));
    const stemOpacity = hideStem ? 0
      : 1 - Math.max(overhead, smooth(clamp((focusAmount - 0.20) / 0.80, 0, 1)));
    const cameraTurn = pose?.azimuth === undefined ? null : pose.azimuth - GARDEN_AZIMUTH;
    const lightYaw = cameraTurn === null ? yaw
      : clamp(Math.atan2(Math.sin(cameraTurn), Math.cos(cameraTurn)), -0.48, 0.48);
    const lightPitch = pose?.elevation === undefined ? pitch
      : clamp(pose.elevation - GARDEN_ELEVATION, -0.35, 0.39);
    return { project, renderSize, overhead, stemOpacity, lightYaw, lightPitch };
  }

  function wrappedAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function effectiveCamera(camera, yaw, pitch) {
    const pose = cameraPose(camera);
    return {
      azimuth: pose?.azimuth ?? GARDEN_AZIMUTH + yaw,
      elevation: pose?.elevation ?? clamp(GARDEN_ELEVATION + pitch, 0.16, 0.86),
      distance: pose?.distance ?? GARDEN_DISTANCE,
      tilt: pose?.tilt,
    };
  }

  function tiltVector(tilt) {
    const length = Math.hypot(tilt?.x ?? 0, tilt?.y ?? 0);
    if (!Number.isFinite(tilt?.angle) || !Number.isFinite(length) || !length) return { x: 0, y: 0 };
    const scale = clamp(tilt.angle, -0.70, 0.70) / length;
    return { x: tilt.x * scale, y: tilt.y * scale };
  }

  function mixCamera(from, to, amount) {
    const firstTilt = tiltVector(from.tilt);
    const lastTilt = tiltVector(to.tilt);
    const x = mix(firstTilt.x, lastTilt.x, amount);
    const y = mix(firstTilt.y, lastTilt.y, amount);
    return {
      azimuth: from.azimuth + wrappedAngle(to.azimuth - from.azimuth) * amount,
      elevation: mix(from.elevation, to.elevation, amount),
      distance: mix(from.distance, to.distance, amount),
      tilt: { x, y, angle: Math.hypot(x, y) },
    };
  }

  function contrastPalettes(color, amount) {
    const base = PETAL_TINTS.get(color);
    const accent = PETAL_TINTS.get(color === 'peach' ? 'lilac' : 'peach');
    return new Map(PALETTES.map(palette => {
      const tones = base?.get(palette) ?? palette;
      const tinted = accent.get(palette);
      return [palette, tones.map((tone, index) =>
        tone.map((channel, rgb) => Math.round(mix(channel, tinted[index][rgb], amount))))];
    }));
  }

  function fusedFlowers(flower, fusion, amount) {
    const assembly = smooth(amount);
    const hubCamera = effectiveCamera(flower.camera, flower.yaw, flower.pitch);
    const partnerCamera = effectiveCamera(fusion.camera ?? flower.camera, flower.yaw, flower.pitch);
    const sharedCamera = mixCamera(hubCamera, { ...hubCamera, tilt: undefined }, assembly * 0.76);
    const offsetX = Number.isFinite(fusion.offsetX) ? fusion.offsetX : 0;
    const offsetY = Number.isFinite(fusion.offsetY) ? fusion.offsetY : 0;
    const radiusRatio = Number.isFinite(fusion.radiusRatio) ? clamp(fusion.radiusRatio, 0.06, 3) : 0.42;
    const partnerSize = flower.size * radiusRatio * partnerCamera.distance / hubCamera.distance;
    const contactAngle = Number.isFinite(fusion.contactAngle) ? fusion.contactAngle : Math.atan2(offsetY, offsetX);
    const light = Number.isFinite(fusion.light) ? clamp(fusion.light, 0, 1) : amount;
    const bloom = Number.isFinite(fusion.openness) ? fusion.openness : flower.openness;
    const opacity = Number.isFinite(fusion.opacity) ? Math.max(0, fusion.opacity) : 1;
    const shareStem = 1 - smooth(clamp(amount / 0.84, 0, 1));
    const fan = { angle: contactAngle, radius: mix(0.28, Math.PI + 0.58, amount), light };
    return [
      {
        ...flower, camera: sharedCamera, openness: mix(flower.openness, 1, assembly),
        assembly, fan, shareStem,
      },
      {
        ...flower,
        x: flower.x + offsetX * (1 - amount),
        y: flower.y + offsetY * (1 - amount),
        size: mix(partnerSize, flower.size, assembly),
        openness: mix(bloom, 1, assembly),
        camera: mixCamera(partnerCamera, sharedCamera, assembly),
        focus: mix(Number.isFinite(fusion.focus) ? fusion.focus : flower.focus, flower.focus, assembly),
        appearance: fusion.appearance,
        detail: 'reduced',
        selected: false,
        rimSweep: fusion.rimSweep,
        fan: { ...fan, angle: contactAngle + Math.PI * (1 - assembly) },
        opacity: mix(opacity, 1, assembly),
        shareStem,
        assembly,
        partner: true,
        // The approaching flower paints above the hub, then shares its depth as the two rings meet.
        depthOffset: 2.1 * (1 - assembly) ** 3,
        palettes: flower.appearance?.color === fusion.appearance.color
          ? contrastPalettes(fusion.appearance.color, 0.67 * assembly) : undefined,
      },
    ];
  }

  function paintWithOpacity(ctx, opacity, paint) {
    if (opacity === 1) {
      paint(ctx);
    } else if (opacity > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * opacity);
      paint(ctx);
      ctx.restore();
    }
  }

  function flowerParts(flower, backdrop) {
    const {
      x, y, time, openness, selected, appearance, detail, rimSweep, fan, palettes,
      assembly = 0, partner = false, opacity = 1, depthOffset = 0, shareStem = 1,
    } = flower;
    const opening = clamp(openness, 0, 1);
    const { project, renderSize, overhead, stemOpacity, lightYaw, lightPitch } = flowerView(flower);
    const reduced = detail === 'reduced';
    const style = {
      form: FLOWER_FORMS.get(appearance?.form),
      palettes: palettes ?? PETAL_TINTS.get(appearance?.color),
      samples: reduced ? REDUCED_PETAL_SAMPLES : PETAL_SAMPLES,
      assembly,
      partner,
    };
    const sweepStrength = Number.isFinite(rimSweep?.phase) && Number.isFinite(rimSweep?.strength)
      ? clamp(rimSweep.strength, 0, 1) * (1 - assembly) : 0;
    const sweepAngle = sweepStrength ? clamp(rimSweep.phase, 0, 1) * TAU : 0;
    const parts = [];
    for (const petal of PETALS) {
      // Leave room for the hub's inner petals and heart as the crowns interleave.
      const innerFade = partner && petal.ring > 0
        ? 1 - smooth(clamp((assembly - 0.12) / (petal.ring === 1 ? 0.65 : 0.49), 0, 1)) : 1;
      if (innerFade === 0) continue;
      const sample = samplePetal(petal, opening, project, time, style);
      let warmth = 0;
      if ((sweepStrength || fan?.light) && petal.ring < 2) {
        const direction = Math.atan2(sample.tip.y - y, sample.tip.x - x);
        if (sweepStrength) {
          const offset = wrappedAngle(direction - sweepAngle);
          const falloff = 1 - clamp(Math.abs(offset) / (offset > 0 ? 1.12 : 1.85), 0, 1);
          warmth = sweepStrength * smooth(falloff) * (petal.ring === 0 ? 1 : 0.50);
        }
        if (fan?.light) {
          const offset = Math.abs(wrappedAngle(direction - fan.angle));
          const spill = smooth(clamp((fan.radius - offset) / 0.62, 0, 1));
          warmth = Math.max(warmth, fan.light * spill * (petal.ring === 0 ? 0.65 : 0.31));
        }
      }
      parts.push({
        depth: sample.depth + depthOffset,
        paint(context) {
          paintWithOpacity(context, opacity * innerFade, canvas => {
            paintPetal(canvas, sample, renderSize, lightYaw, lightPitch, backdrop, reduced);
            if (warmth > 0.012) paintRimSweep(canvas, sample, renderSize, warmth);
          });
        },
      });
    }
    const heartOpacity = partner ? opacity * (1 - smooth(clamp(assembly / 0.66, 0, 1))) : opacity;
    const heart = heartOpacity > 0 ? makeHeart(project, renderSize, opening, selected, reduced) : [];
    for (const part of heart) {
      parts.push({
        depth: part.depth + depthOffset,
        paint(context) {
          paintWithOpacity(context, heartOpacity, part.paint);
        },
      });
    }
    return {
      parts, heart, tipOpacity: overhead * 0.64 * heartOpacity,
      stemOpacity: stemOpacity * shareStem * opacity,
      paintStem: context => paintStem(context, project, renderSize),
    };
  }

  function draw(ctx, {
    x, y, size, openness, yaw = 0, pitch = 0, time = 0, selected = false, backdrop = null,
    appearance, detail = 'full', camera, focus = 0, hideStem = false, rimSweep, fusion,
  }) {
    if (!(size > 0)) return;
    const flower = { x, y, size, openness, yaw, pitch, time, selected, appearance, detail, camera, focus, hideStem, rimSweep };
    const amount = fusion?.appearance && Number.isFinite(fusion.amount) ? clamp(fusion.amount, 0, 1) : 0;
    const flowers = amount ? fusedFlowers(flower, fusion, amount) : [flower];
    const groups = flowers.map(member => flowerParts(member, backdrop));
    const parts = groups.flatMap(group => group.parts).sort((first, second) => first.depth - second.depth);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const group of groups) {
      paintWithOpacity(ctx, group.stemOpacity, group.paintStem);
    }
    for (const part of parts) part.paint(ctx);
    for (const { heart, tipOpacity } of groups) {
      if (heart.length < 2 || tipOpacity <= 0) continue;
      // The projected tips remain visible where whole translucent petals overlap their stalks.
      paintWithOpacity(ctx, tipOpacity, context => {
        for (const part of heart) part.paintTip?.(context);
      });
    }
    ctx.restore();
  }

  window.GardenFlower = { draw };
})();
