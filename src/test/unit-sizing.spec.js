import { describe, it, expect } from "vitest";
import {
  scaledHeightPx,
  emptyHeightPx,
  computeLayout,
  MIN_ROW_PX,
} from "../utils/unit-sizing";

describe("computeLayout", () => {
  it("uses MIN_ROW_PX baseline and divides remaining space when there's room", () => {
    // 10 units × 22px = 220px baseline; (1000 - 220) / 2000 = 0.39
    const result = computeLayout(1000, 2000, 0, 10);
    expect(result.rowBaseline).toBe(MIN_ROW_PX);
    expect(result.scale).toBeCloseTo(0.39, 6);
  });

  it("uses totalPoints as the denominator when over-budget", () => {
    // 4 units × 22 = 88 baseline; (1000 - 88) / 4000 = 0.228
    const result = computeLayout(1000, 2000, 4000, 4);
    expect(result.rowBaseline).toBe(MIN_ROW_PX);
    expect(result.scale).toBeCloseTo(0.228, 3);
  });

  it("shrinks the baseline so all rows fit when the panel can't hold MIN_ROW_PX × N", () => {
    // 740px panel, 36 units → desired baseline 36×22 = 792 > panel.
    // Adaptive: rowBaseline = panel / N, scale = 0. No scrollbar.
    const panel = 740;
    const N = 36;
    const result = computeLayout(panel, 5500, 5265, N);
    expect(result.scale).toBe(0);
    expect(result.rowBaseline).toBeCloseTo(panel / N, 6);
    expect(result.rowBaseline).toBeLessThan(MIN_ROW_PX);
  });

  it("returns MIN_ROW_PX baseline + scale 0 for empty/missing inputs", () => {
    expect(computeLayout(0, 2000, 0, 5)).toEqual({ scale: 0, rowBaseline: MIN_ROW_PX });
    expect(computeLayout(800, 2000, 0, 0)).toEqual({ scale: 0, rowBaseline: MIN_ROW_PX });
  });

  it("returns MIN_ROW_PX baseline + scale 0 when there's no points budget to scale", () => {
    // Empty list with no max-points budget but there IS room for the baseline:
    // baseline stays at MIN_ROW_PX, scale is 0 because there's nothing to scale.
    const result = computeLayout(800, 0, 0, 5);
    expect(result.scale).toBe(0);
    expect(result.rowBaseline).toBe(MIN_ROW_PX);
  });
});

describe("scaledHeightPx", () => {
  it("returns just the scaled portion in px (no baseline)", () => {
    expect(scaledHeightPx(100, 1)).toBe("100px");
    expect(scaledHeightPx(100, 0.5)).toBe("50px");
    // floor: 100.7 → 100
    expect(scaledHeightPx(100, 1.007)).toBe("100px");
  });

  it("preserves the 1:2 ratio (100pt vs 200pt at the same scale)", () => {
    const scale = 0.4;
    const a = parseInt(scaledHeightPx(100, scale));
    const b = parseInt(scaledHeightPx(200, scale));
    expect(b).toBe(a * 2);
  });

  it("clamps negative points to zero", () => {
    expect(scaledHeightPx(-50, 1)).toBe("0px");
  });

  it("returns 0px when scale is 0 (panel not yet measured, or constrained)", () => {
    expect(scaledHeightPx(200, 0)).toBe("0px");
  });
});

describe("emptyHeightPx", () => {
  it("fills (maxPoints − totalPoints) × scale", () => {
    expect(emptyHeightPx(2000, 1500, 1)).toBe("500px");
    expect(emptyHeightPx(2000, 1500, 0.5)).toBe("250px");
  });

  it("is 0 when the list is at or over its budget", () => {
    expect(emptyHeightPx(2000, 2000, 1)).toBe("0px");
    expect(emptyHeightPx(2000, 2500, 1)).toBe("0px");
  });

  it("is 0 when scale is 0", () => {
    expect(emptyHeightPx(2000, 500, 0)).toBe("0px");
  });

  it("layout reconciles: N × rowBaseline + Σ scaled + empty band = panel height", () => {
    // Panel 800px, budget 2000, list = 100 + 200 = 300pt across 2 units
    const panel = 800;
    const N = 2;
    const { scale, rowBaseline } = computeLayout(panel, 2000, 300, N);
    const a = rowBaseline + parseInt(scaledHeightPx(100, scale));
    const b = rowBaseline + parseInt(scaledHeightPx(200, scale));
    const empty = parseInt(emptyHeightPx(2000, 300, scale));
    const sum = a + b + empty;
    // Per-unit Math.floor losses can shave a few sub-pixels off; the sum
    // must never exceed the panel (overflow is the bug we're guarding).
    expect(sum).toBeLessThanOrEqual(panel);
    expect(sum).toBeGreaterThanOrEqual(panel - N);
  });

  it("constrained layout still fits exactly within the panel (no scrollbar)", () => {
    // Dense list: 36 units, 740px panel — adaptive baseline kicks in.
    const panel = 740;
    const N = 36;
    const { scale, rowBaseline } = computeLayout(panel, 5500, 5265, N);
    // rowBaseline × N reconciles to ~panel (allow 1px for floor losses)
    const rowSum = rowBaseline * N;
    expect(rowSum).toBeLessThanOrEqual(panel);
    expect(rowSum).toBeGreaterThanOrEqual(panel - 1);
    // No scale → no scaled portion contributing to overflow
    expect(scale).toBe(0);
  });
});
