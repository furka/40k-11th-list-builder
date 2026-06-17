/**
 * Helpers that translate points → pixel height for the army-list panel.
 *
 * The panel is a flex column whose total available height is divided
 * proportionally by point cost: a 100pt unit and a 200pt unit render in a
 * 1:2 height ratio, and unused points (max − total used) render as a single
 * empty band pushed to the top so the user can see at-a-glance how full the
 * list is.
 *
 * `scale` = `panelPixelHeight / max(effectiveMaxPoints, totalPoints)`.
 * Treating max as a *floor* on the denominator means that when the list goes
 * over budget the units shrink proportionally to keep fitting the panel,
 * instead of overflowing past `overflow: hidden`. Components pass the scale
 * down through props so a single ResizeObserver in the panel can drive every
 * nested unit's height without re-measuring.
 */

export function unitHeightPx(points, scale) {
  const p = points > 0 ? points : 0;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return `${Math.floor(p * s)}px`;
}

export function emptyHeightPx(maxPoints, totalPoints, scale) {
  const remaining = Math.max(0, (maxPoints ?? 0) - (totalPoints ?? 0));
  const s = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return `${remaining * s}px`;
}

export function computeScale(panelHeight, effectiveMaxPoints, totalPoints = 0) {
  const denom = Math.max(effectiveMaxPoints ?? 0, totalPoints ?? 0);
  if (!panelHeight || !denom) return 0;
  return panelHeight / denom;
}
