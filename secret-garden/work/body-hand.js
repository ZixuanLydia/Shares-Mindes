(() => {
  const fingerBases = [5, 9, 13, 17];
  const clamp = value => Math.max(0, Math.min(1, value));

  function distance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
  }

  function fingerOpenness(points, base, palmScale) {
    const knuckle = points[base];
    const firstJoint = points[base + 1];
    const secondJoint = points[base + 2];
    const tip = points[base + 3];
    const firstLength = distance(knuckle, firstJoint);
    const secondLength = distance(firstJoint, secondJoint);
    const thirdLength = distance(secondJoint, tip);
    if (Math.min(firstLength, secondLength, thirdLength) < palmScale * 0.025) return null;

    const alignment = (
      (firstJoint.x - knuckle.x) * (secondJoint.x - firstJoint.x) +
      (firstJoint.y - knuckle.y) * (secondJoint.y - firstJoint.y) +
      (firstJoint.z - knuckle.z) * (secondJoint.z - firstJoint.z)
    ) / (firstLength * secondLength);
    const reach = distance(knuckle, tip) / (firstLength + secondLength + thirdLength);

    // Straight fingers have aligned segments and reach their full chain length.
    // These margins let a relaxed palm reach 1 and a folded fist reach 0.
    const straightness = clamp((alignment + 0.45) / 1.4);
    const extension = clamp((reach - 0.38) / 0.56);
    return straightness * 0.6 + extension * 0.4;
  }

  function openness(points) {
    if (!Array.isArray(points) || points.length !== 21) return null;
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
    }

    const palmScale = (distance(points[0], points[9]) + distance(points[5], points[17])) / 2;
    if (!Number.isFinite(palmScale) || palmScale < 0.00001) return null;

    let total = 0;
    for (const base of fingerBases) {
      const amount = fingerOpenness(points, base, palmScale);
      if (amount === null) return null;
      total += amount;
    }
    const amount = clamp((total / fingerBases.length - 0.06) / 0.88);
    return amount * amount * (3 - 2 * amount);
  }

  window.GardenHandShape = { openness };
})();
