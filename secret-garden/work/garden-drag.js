// Position dragging uses the same normalized coordinates as the garden camera.
// Pointer capture, persistence and click/drag intent stay in the scene controller.
(() => {
  "use strict";

  const limits = Object.freeze({ minX: 0.08, maxX: 0.96, minY: 0.22, maxY: 0.82 });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = value => Number.isFinite(value);
  const validView = view => view && finite(view.width) && finite(view.height) && view.width > 0 && view.height > 0;
  const validPoint = value => value && finite(value.x) && finite(value.y);
  const validPosition = value => validPoint(value) && finite(value.z);

  function point(event, rect, view) {
    if (!event || !rect || !validView(view) || !finite(event.clientX) || !finite(event.clientY)
      || !finite(rect.left) || !finite(rect.top) || !finite(rect.width) || !finite(rect.height)
      || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) * view.width / rect.width,
      y: (event.clientY - rect.top) * view.height / rect.height
    };
  }

  function start(position, pointer, view) {
    if (!validPosition(position) || !validPoint(pointer) || !validView(view)) return null;
    return Object.freeze({
      from: Object.freeze({ x: position.x, y: position.y, z: position.z }),
      pointer: Object.freeze({ x: pointer.x / view.width, y: pointer.y / view.height })
    });
  }

  function normalizedBounds(origin, requested = {}) {
    const result = {};
    for (const axis of ["X", "Y"]) {
      const lowKey = "min" + axis;
      const highKey = "max" + axis;
      let low = finite(requested[lowKey]) ? clamp(requested[lowKey], limits[lowKey], limits[highKey]) : limits[lowKey];
      let high = finite(requested[highKey]) ? clamp(requested[highKey], limits[lowKey], limits[highKey]) : limits[highKey];
      // Tiny viewports may not fit the full crown. Collapse the safe interval
      // instead of producing a reversed clamp or a NaN.
      if (low > high) low = high = (low + high) / 2;
      const original = origin[axis.toLowerCase()];
      result[lowKey] = Math.min(low, original);
      result[highKey] = Math.max(high, original);
    }
    return result;
  }

  function position(from, dx, dy, view, options = {}) {
    if (!validPosition(from) || !finite(dx) || !finite(dy) || !validView(view)) return null;
    const origin = {
      x: clamp(from.x, limits.minX, limits.maxX),
      y: clamp(from.y, limits.minY, limits.maxY)
    };
    const bounds = normalizedBounds(origin, options.bounds);
    let y = origin.y + dy / view.height;
    if (options.mobile && dy !== 0) {
      // The legacy narrow view has a compressed vertical lane and a floor.
      // Invert the displayed lane so the first actual drag pixel follows the
      // pointer even for an imported point underneath that floor.
      const shown = Math.max(0.40, 0.56 + (origin.y - 0.49) * 0.85);
      y = 0.49 + (shown + dy / view.height - 0.56) / 0.85;
    }
    return {
      x: clamp(origin.x + dx / view.width, bounds.minX, bounds.maxX),
      y: clamp(y, bounds.minY, bounds.maxY),
      z: from.z
    };
  }

  function delta(anchor, pointer, view) {
    if (!anchor || !validPosition(anchor.from) || !validPoint(anchor.pointer) || !validPoint(pointer) || !validView(view)) return null;
    return {
      x: pointer.x - anchor.pointer.x * view.width,
      y: pointer.y - anchor.pointer.y * view.height
    };
  }

  function move(anchor, pointer, view, options) {
    const amount = delta(anchor, pointer, view);
    return amount ? position(anchor.from, amount.x, amount.y, view, options) : null;
  }

  function moved(anchor, pointer, view, threshold = 6) {
    const amount = delta(anchor, pointer, view);
    return Boolean(amount && Math.hypot(amount.x, amount.y) + 1e-7 >= (finite(threshold) ? Math.max(0, threshold) : 6));
  }

  window.GardenPositionDrag = Object.freeze({ point, start, move, position, moved, limits });
})();
