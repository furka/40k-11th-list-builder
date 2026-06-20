import { describe, it, expect } from "vitest";
import { displayFactionTitle } from "../utils/display-faction-title";

describe("displayFactionTitle", () => {
  it("returns just the primary when no allies", () => {
    expect(displayFactionTitle("CHAOS KNIGHTS", [])).toBe("CHAOS KNIGHTS");
  });

  it("joins primary and allies with ' + '", () => {
    expect(
      displayFactionTitle("CHAOS KNIGHTS", ["CHAOS DAEMONS"])
    ).toBe("CHAOS KNIGHTS + CHAOS DAEMONS");
  });

  it("supports multiple allies", () => {
    expect(
      displayFactionTitle("CHAOS KNIGHTS", [
        "CHAOS DAEMONS",
        "CHAOS SPACE MARINES",
      ])
    ).toBe("CHAOS KNIGHTS + CHAOS DAEMONS + CHAOS SPACE MARINES");
  });

  it("tolerates missing primary", () => {
    expect(displayFactionTitle("", ["CHAOS DAEMONS"])).toBe("CHAOS DAEMONS");
    expect(displayFactionTitle(null, ["CHAOS DAEMONS"])).toBe("CHAOS DAEMONS");
  });

  it("tolerates missing or invalid allies argument", () => {
    expect(displayFactionTitle("CHAOS KNIGHTS", null)).toBe("CHAOS KNIGHTS");
    expect(displayFactionTitle("CHAOS KNIGHTS", undefined)).toBe(
      "CHAOS KNIGHTS"
    );
  });

  it("filters empty-string allies", () => {
    expect(
      displayFactionTitle("CHAOS KNIGHTS", ["", "CHAOS DAEMONS"])
    ).toBe("CHAOS KNIGHTS + CHAOS DAEMONS");
  });
});
