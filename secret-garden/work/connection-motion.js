// Connection poses are presentation state. No garden record is moved or rewritten.
(() => {
  "use strict";

  const clamp = (value) => Math.max(0, Math.min(1, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const ease = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const desktopSlots = [[0.171, 0.273], [0.467, 0.252], [0.482, 0.712], [0.166, 0.721]];
  const mobileSlots = [[0.205, 0.158], [0.795, 0.175], [0.774, 0.457], [0.224, 0.466]];

  function gardenPose(entry, scene) {
    const { x, y, size, yaw, pitch } = scene.planted(entry);
    return {
      entry, x, y, size, weight: 0, opacity: 0.24, focus: 0, light: 0, connectionStrength: 0,
      depth: entry.record.position.z, openness: entry.record.appearance.openness,
      camera: { azimuth: -0.43 + (entry.raster?.yaw ?? yaw), elevation: 0.50 + (entry.raster?.pitch ?? pitch), distance: 5.8 }
    };
  }

  function clusterPose(entry, scene, slot = null, strength = 0.5) {
    const { width, height, mobile } = scene;
    const form = entry.record.appearance.form;
    const radiusFactor = form === "flared" ? 1.41 : form === "tall" ? 1.02 : 1.21;
    const depth = clamp((entry.record.position.z + 1) / 2);
    const hub = slot === null;
    const connectionStrength = hub ? 1 : clamp(Number.isFinite(strength) ? strength : 0.5);
    const [hubLeft, hubTop] = mobile ? [0.50, 0.305] : [0.322, 0.495];
    const [left, top] = hub ? [hubLeft, hubTop]
      : (mobile ? mobileSlots : desktopSlots)[slot];
    const hubRadius = mobile ? Math.min(width * 0.241, height * 0.133) : Math.min(width * 0.123, height * 0.226);
    const radius = hub
      ? hubRadius
      : (mobile ? Math.min(width * 0.087, height * 0.052) : Math.min(width * 0.049, height * 0.081)) * (0.88 + 0.22 * depth)
        * mix(0.97, 1.035, connectionStrength);
    // Keep a gap even when both crowns use the broadest projected form and depth.
    // Slots retain their bearings, so ranking changes never scramble the orbit.
    const footprint = form === "flared" ? 1.33 : form === "tall" ? 0.99 : 1.16;
    const safeDistance = hubRadius * (0.99 / 1.02) + radius * footprint / radiusFactor + 14;
    const slotDistance = Math.hypot(width * (left - hubLeft), height * (top - hubTop));
    const reach = hub || mobile ? 1 : Math.max(mix(1.09, 0.85, connectionStrength), safeDistance / slotDistance);
    const distance = hub ? 3.65 : 4.45 - depth * 0.28;
    const yaw = entry.raster?.yaw ?? scene.planted(entry).yaw;
    return {
      entry,
      x: width * mix(hubLeft, left, reach),
      y: height * mix(hubTop, top, reach),
      size: radius * distance / (5.8 * radiusFactor),
      weight: 1,
      opacity: hub ? 1 : 0.72 + 0.10 * depth + 0.13 * connectionStrength,
      focus: hub ? 1 : 0.83 + 0.13 * connectionStrength,
      light: hub ? 1 : 0.06 + 0.21 * connectionStrength,
      connectionStrength,
      depth: hub ? 1 : 0.35 + depth * 0.46,
      openness: hub ? 1 : Math.min(0.92, Math.max(0.68 + 0.15 * connectionStrength, entry.record.appearance.openness)),
      camera: { azimuth: -0.19 + yaw, elevation: hub ? Math.PI * 0.488 : 1.25 + depth * 0.20, distance }
    };
  }

  function capture(pose, scene) {
    return { ...pose, x: pose.x / scene.width, y: pose.y / scene.height, size: pose.size / Math.min(scene.width, scene.height) };
  }

  function place(from, to, progress, delay, scene) {
    const local = clamp((progress - delay) / (1 - delay));
    const t = ease(local);
    const x0 = from.x * scene.width;
    const y0 = from.y * scene.height;
    const size0 = from.size * Math.min(scene.width, scene.height);
    const arc = Math.min(scene.height * 0.049, Math.hypot(to.x - x0, to.y - y0) * 0.17);
    const weightProgress = from.weight === 0 ? ease(local / 0.18)
      : to.weight === 0 ? ease((local - 0.82) / 0.18) : t;
    const camera = {
      azimuth: mix(from.camera.azimuth, to.camera.azimuth, t),
      elevation: mix(from.camera.elevation, to.camera.elevation, t),
      distance: mix(from.camera.distance, to.camera.distance, t)
    };
    const tilt = from.camera.tilt ?? to.camera.tilt;
    if (tilt) {
      const angle = mix(from.camera.tilt?.angle ?? 0, to.camera.tilt?.angle ?? 0, t);
      if (angle > 0.001) camera.tilt = { x: tilt.x, y: tilt.y, angle };
    }
    const rimSweep = from.rimSweep && t < 1
      ? { phase: from.rimSweep.phase, strength: from.rimSweep.strength * (1 - t) } : undefined;
    return {
      entry: to.entry,
      x: mix(x0, to.x, t),
      y: mix(y0, to.y, t) - Math.sin(Math.PI * t) * arc,
      size: mix(size0, to.size, t),
      weight: mix(from.weight, to.weight, weightProgress),
      opacity: mix(from.opacity, to.opacity, t),
      focus: mix(from.focus, to.focus, t),
      light: mix(from.light, to.light, t),
      connectionStrength: mix(from.connectionStrength ?? 0, to.connectionStrength ?? 0, t),
      depth: mix(from.depth, to.depth, t),
      openness: mix(from.openness, to.openness, t),
      camera, rimSweep
    };
  }

  function paintGlow(ctx, x, y, radius, strength) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "rgba(251,205,214," + 0.21 * strength + ")");
    glow.addColorStop(0.53, "rgba(232,192,226," + 0.095 * strength + ")");
    glow.addColorStop(1, "rgba(226,182,219,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function paintSmallFlower(ctx, pose, backdrop, cache, budget) {
    const id = pose.entry.record.id;
    const camera = pose.camera;
    let raster = cache.get(id);
    const outOfDate = !raster || Math.abs(raster.camera.elevation - camera.elevation) > 0.085
      || Math.abs(raster.camera.distance - camera.distance) > 0.22
      || Math.abs(raster.camera.azimuth - camera.azimuth) > 0.09
      || Math.abs(raster.openness - pose.openness) > 0.065
      || Math.abs(raster.focus - pose.focus) > 0.16
      || Boolean(backdrop) !== raster.hasBackdrop;
    if (budget.available && outOfDate) {
      const image = raster?.image ?? document.createElement("canvas");
      const renderScale = 1.35;
      const referenceSize = 55;
      const anchor = referenceSize * 2.40;
      const width = anchor * 2;
      const pixels = Math.ceil(width * renderScale);
      if (image.width !== pixels) image.width = pixels;
      if (image.height !== pixels) image.height = pixels;
      const buffer = image.getContext("2d");
      const ratio = pose.size / referenceSize;
      buffer.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      buffer.clearRect(0, 0, width, width);
      window.GardenFlower.draw(buffer, {
        x: anchor, y: anchor, size: referenceSize, camera, openness: pose.openness,
        focus: pose.focus, appearance: pose.entry.record.appearance, detail: "reduced",
        backdrop: backdrop && {
          image: backdrop.image,
          x: anchor + (backdrop.x - pose.x) / ratio,
          y: anchor + (backdrop.y - pose.y) / ratio,
          scale: backdrop.scale / ratio
        }
      });
      raster = { image, anchor, width, size: referenceSize, camera, openness: pose.openness, focus: pose.focus, hasBackdrop: Boolean(backdrop) };
      cache.set(id, raster);
      budget.available = false;
    }

    ctx.save();
    ctx.globalAlpha = pose.weight * pose.opacity;
    if (pose.focus > 0.65) {
      const glowStrength = clamp((pose.focus - 0.65) / 0.26) * mix(0.42, 1, pose.connectionStrength ?? 0.5);
      const radius = pose.size * 5.8 / camera.distance * 1.40;
      paintGlow(ctx, pose.x, pose.y, radius, glowStrength);
    }
    if (raster) {
      const ratio = pose.size / raster.size;
      ctx.drawImage(raster.image, pose.x - raster.anchor * ratio, pose.y - raster.anchor * ratio, raster.width * ratio, raster.width * ratio);
    } else if (pose.entry.raster) {
      const original = pose.entry.raster;
      const ratio = pose.size * 5.8 / (camera.distance * original.size);
      ctx.drawImage(original.image, pose.x - original.anchorX * ratio, pose.y - original.anchorY * ratio, original.width * ratio, original.height * ratio);
    }
    ctx.restore();
  }

  function crownRadius(pose) {
    const form = pose.entry.record.appearance.form;
    const edge = form === "flared" ? 1.33 : form === "tall" ? 0.99 : 1.16;
    return pose.size * 5.8 / pose.camera.distance * edge;
  }

  function stablePhase(id) {
    let hash = 0;
    for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
    return (hash >>> 0) / 4294967296;
  }

  // At most four thin paths and twelve motes; no particle objects survive a frame.
  // This is a visual relationship only. Saved positions and bloom are untouched.
  function paintConnections(ctx, poses, hubId, time, reducedMotion = false) {
    const frames = poses instanceof Map ? [...poses.values()] : poses;
    const hub = frames.find(pose => pose.entry?.record.id === hubId);
    if (!hub || hub.weight <= 0) return;
    let count = 0;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const pose of frames) {
      if (count >= 4) break;
      if (pose === hub || !pose.entry || pose.weight <= 0 || pose.fusionOwner || !pose.connectionStrength) continue;
      const strength = clamp(pose.connectionStrength);
      const visibility = Math.min(hub.weight, pose.weight) * Math.min(hub.opacity, pose.opacity);
      if (visibility <= 0.01) continue;
      const dx = hub.x - pose.x;
      const dy = hub.y - pose.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const ux = dx / distance;
      const uy = dy / distance;
      const smallRadius = crownRadius(pose);
      const hubRadius = crownRadius(hub);
      const startX = pose.x + ux * smallRadius * 0.50;
      const startY = pose.y + uy * smallRadius * 0.50;
      const endX = hub.x - ux * hubRadius * 0.40;
      const endY = hub.y - uy * hubRadius * 0.40;
      const seed = stablePhase(pose.entry.record.id);
      const bend = Math.min(28, distance * 0.09) * (seed < 0.5 ? -1 : 1);
      const controlX = (startX + endX) / 2 - uy * bend;
      const controlY = (startY + endY) / 2 + ux * bend;
      const flow = visibility * (0.35 + 0.65 * strength);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(250,207,185," + (flow * 0.072) + ")";
      ctx.lineWidth = 0.5 + 0.3 * strength;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(controlX, controlY, endX, endY);
      ctx.stroke();
      const moteCount = reducedMotion ? 2 : 3;
      for (let index = 0; index < moteCount; index++) {
        const progress = reducedMotion ? (index + 1) / 3 : (time * (0.10 + 0.09 * strength) + seed + index / 3) % 1;
        const inverse = 1 - progress;
        const x = inverse * inverse * startX + 2 * inverse * progress * controlX + progress * progress * endX;
        const y = inverse * inverse * startY + 2 * inverse * progress * controlY + progress * progress * endY;
        const envelope = Math.sin(Math.PI * progress);
        const alpha = flow * envelope * (reducedMotion ? 0.18 : 0.68);
        const radius = 0.85 + 0.55 * strength;
        ctx.fillStyle = "rgba(255,215,180," + (alpha * 0.12) + ")";
        ctx.beginPath();
        ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,228,195," + alpha + ")";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      count++;
    }
    ctx.restore();
  }

  window.GardenConnectionMotion = { gardenPose, clusterPose, capture, place, paintGlow, paintSmallFlower, paintConnections };
})();
