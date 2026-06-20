const PREFIX = "11th:";

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
  }
}

export function restore(key) {
  try {
    const item = localStorage.getItem(PREFIX + key);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e);
    return null;
  }
}

const DEBOUNCE_MS = 200;
const pendingTimers = new Map();

export function debouncedSave(key, value) {
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      save(key, value);
    }, DEBOUNCE_MS)
  );
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) {
    console.error(`Failed to remove ${key} from localStorage:`, e);
  }
}
