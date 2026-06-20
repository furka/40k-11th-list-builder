import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { save, restore, remove, debouncedSave } from "../utils/localStorage";

describe("localStorage utils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("save + restore round-trip", () => {
    it("round-trips a primitive value", () => {
      save("count", 42);
      expect(restore("count")).toBe(42);
    });

    it("round-trips an object", () => {
      const list = { name: "Necrons", units: [{ name: "Warriors", models: 10 }] };
      save("list", list);
      expect(restore("list")).toEqual(list);
    });

    it("prefixes the key with '11th:' so it does not collide with other apps", () => {
      save("foo", "bar");
      expect(localStorage.getItem("11th:foo")).toBe('"bar"');
      expect(localStorage.getItem("foo")).toBe(null);
    });
  });

  describe("restore", () => {
    it("returns null for a missing key", () => {
      expect(restore("never-saved")).toBe(null);
    });

    it("returns null and logs when stored value is not valid JSON", () => {
      const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem("11th:broken", "{not valid json");
      expect(restore("broken")).toBe(null);
      expect(consoleErr).toHaveBeenCalled();
      consoleErr.mockRestore();
    });
  });

  describe("remove", () => {
    it("removes a previously saved value", () => {
      save("temp", { a: 1 });
      remove("temp");
      expect(restore("temp")).toBe(null);
    });
  });

  describe("save error handling", () => {
    it("swallows + logs errors from localStorage.setItem", () => {
      const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(() => save("x", "y")).not.toThrow();
      expect(consoleErr).toHaveBeenCalled();
      setItem.mockRestore();
      consoleErr.mockRestore();
    });
  });

  describe("remove error handling", () => {
    it("swallows + logs errors from localStorage.removeItem", () => {
      const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
      const removeItem = vi
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(() => {
          throw new Error("nope");
        });
      expect(() => remove("x")).not.toThrow();
      expect(consoleErr).toHaveBeenCalled();
      removeItem.mockRestore();
      consoleErr.mockRestore();
    });
  });

  describe("debouncedSave", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("delays the save by 200 ms", () => {
      debouncedSave("d", "v1");
      expect(restore("d")).toBe(null);
      vi.advanceTimersByTime(199);
      expect(restore("d")).toBe(null);
      vi.advanceTimersByTime(1);
      expect(restore("d")).toBe("v1");
    });

    it("coalesces successive calls — only the last value is persisted", () => {
      debouncedSave("d", "v1");
      vi.advanceTimersByTime(100);
      debouncedSave("d", "v2");
      vi.advanceTimersByTime(100);
      debouncedSave("d", "v3");
      expect(restore("d")).toBe(null);
      vi.advanceTimersByTime(200);
      expect(restore("d")).toBe("v3");
    });

    it("treats different keys independently", () => {
      debouncedSave("a", 1);
      debouncedSave("b", 2);
      vi.advanceTimersByTime(200);
      expect(restore("a")).toBe(1);
      expect(restore("b")).toBe(2);
    });
  });
});
