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

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) {
    console.error(`Failed to remove ${key} from localStorage:`, e);
  }
}
