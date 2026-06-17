import { describe, it, expect } from "vitest";
import {
  unitHeightPx,
  emptyHeightPx,
  computeScale,
} from "../utils/unit-sizing";

describe("computeScale", () => {
  it("returns panel-height / max-points", () => {
    expect(computeScale(2000, 2000)).toBe(1);
    expect(computeScale(1000, 2000)).toBe(0.5);
    expect(computeScale(3000, 2000)).toBe(1.5);
  });

  it("returns 0 when either input is missing or zero", () => {
    expect(computeScale(0, 2000)).toBe(0);
    expect(computeScale(2000, 0)).toBe(0);
    expect(computeScale(null, 2000)).toBe(0);
    expect(computeScale(2000, undefined)).toBe(0);
  });
});

describe("unitHeightPx", () => {
  it("multiplies points by scale and floors to integer px", () => {
    expect(unitHeightPx(100, 1)).toBe("100px");
    expect(unitHeightPx(100, 0.5)).toBe("50px");
    // floor: 100.7 → 100
    expect(unitHeightPx(100, 1.007)).toBe("100px");
  });

  it("a 200pt unit is twice as tall as a 100pt unit at the same scale", () => {
    const scale = 0.4;
    const a = parseInt(unitHeightPx(100, scale));
    const b = parseInt(unitHeightPx(200, scale));
    expect(b).toBe(a * 2);
  });

  it("clamps negative points to zero", () => {
    expect(unitHeightPx(-50, 1)).toBe("0px");
  });

  it("renders 0px when scale is 0 (panel not yet measured)", () => {
    expect(unitHeightPx(200, 0)).toBe("0px");
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

  it("complements unitHeightPx: sum of (each unit + empty space) = panel height", () => {
    // Panel 800px tall, budget 2000pt, list = 100 + 200 = 300pt
    const scale = computeScale(800, 2000); // 0.4
    const a = parseInt(unitHeightPx(100, scale));
    const b = parseInt(unitHeightPx(200, scale));
    const empty = parseInt(emptyHeightPx(2000, 300, scale));
    expect(a + b + empty).toBe(800);
  });
});
