import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useCollectionStore } from "../stores/collection";

describe("collection store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("starts with an empty collection", () => {
    const store = useCollectionStore();
    expect(store.collection).toEqual({});
  });

  it("setCollection replaces the whole collection ref", () => {
    const store = useCollectionStore();
    const next = { "Necron Warriors": 2, Canoness: 1 };
    store.setCollection(next);
    expect(store.collection).toEqual(next);
  });

  it("setUnitCount adds/updates a single entry without disturbing others", () => {
    const store = useCollectionStore();
    store.setCollection({ Warriors: 2 });
    store.setUnitCount("Canoness", 1);
    expect(store.collection).toEqual({ Warriors: 2, Canoness: 1 });
    store.setUnitCount("Warriors", 5);
    expect(store.collection.Warriors).toBe(5);
  });

  it("getUnitCount returns the stored count when present", () => {
    const store = useCollectionStore();
    store.setUnitCount("Warriors", 3);
    expect(store.getUnitCount("Warriors")).toBe(3);
  });

  it("getUnitCount returns 999 (the 'unlimited' sentinel) when the entry is missing", () => {
    // When users haven't filled out their collection, every unit is effectively
    // available — the UI uses 999 as 'unlimited'. Documenting this here so the
    // sentinel doesn't get accidentally lowered to 0.
    const store = useCollectionStore();
    expect(store.getUnitCount("never-added")).toBe(999);
  });

  it("loadFromStorage hydrates the collection from a previously-saved value", () => {
    localStorage.setItem("11th:collection", JSON.stringify({ Warriors: 4 }));
    const store = useCollectionStore();
    store.loadFromStorage();
    expect(store.collection).toEqual({ Warriors: 4 });
  });

  it("loadFromStorage leaves the collection alone when storage is empty", () => {
    const store = useCollectionStore();
    store.setUnitCount("Warriors", 2);
    store.loadFromStorage();
    expect(store.collection).toEqual({ Warriors: 2 });
  });

  it("persists mutations to localStorage via the deep watcher", async () => {
    const store = useCollectionStore();
    store.setUnitCount("Warriors", 7);
    await nextTick();
    expect(localStorage.getItem("11th:collection")).toBe(
      JSON.stringify({ Warriors: 7 })
    );
  });
});
