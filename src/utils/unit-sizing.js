/**
 * Helpers that translate points → pixel height for the army-list panel.
 *
 * Each row's final height is composed in CSS as:
 *
 *     flex-basis: calc(var(--row-baseline) + <scaled portion>)
 *
 * `--row-baseline` is set once on `.army-list-pane` from `computeLayout`'s
 * `rowBaseline`, and inherits down to every `.army-list-unit`. The scaled
 * portion comes from `scaledHeightPx(points, scale)` and is bound per-row
 * via Vue's v-bind. The panel-level math is:
 *
 *     panelHeight = N × rowBaseline  +  scale × max(maxPoints, totalPoints)
 *
 * Solving for scale gives the formula in `computeLayout` below. When there's
 * room for `MIN_ROW_PX` per row, the baseline stays at that comfortable
 * minimum and the empty band absorbs unspent budget. When `N × MIN_ROW_PX`
 * exceeds the panel, the baseline shrinks so all rows still fit exactly —
 * no scrollbar — at the cost of slightly tighter rows. Scale is shared
 * across every row via props so a single ResizeObserver in the panel can
 * drive every nested unit's height without re-measuring.
 */

export const MIN_ROW_PX = 22;

export function scaledHeightPx(points, scale) {
  const p = points > 0 ? points : 0;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return `${Math.floor(p * s)}px`;
}

export function emptyHeightPx(maxPoints, totalPoints, scale) {
  const remaining = Math.max(0, (maxPoints ?? 0) - (totalPoints ?? 0));
  const s = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return `${remaining * s}px`;
}

export function computeLayout(panelHeight, effectiveMaxPoints, totalPoints = 0, numUnits = 0) {
  const denom = Math.max(effectiveMaxPoints ?? 0, totalPoints ?? 0);
  const N = Math.max(0, numUnits ?? 0);
  const p = panelHeight ?? 0;

  if (N === 0 || p <= 0) {
    return { scale: 0, rowBaseline: MIN_ROW_PX };
  }

  const desiredBaselineTotal = N * MIN_ROW_PX;
  if (desiredBaselineTotal >= p || !denom) {
    // No room for the desired baseline, or no points budget to scale.
    // Shrink the baseline so all rows fit exactly — never overflow into a
    // scrollbar, which the user has rejected as an option.
    return { scale: 0, rowBaseline: Math.min(MIN_ROW_PX, p / N) };
  }

  return {
    scale: (p - desiredBaselineTotal) / denom,
    rowBaseline: MIN_ROW_PX,
  };
}
