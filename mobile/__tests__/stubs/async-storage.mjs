// In-memory stand-in for @react-native-async-storage/async-storage, used only by the Node test loader.
const m = new Map();
const AsyncStorage = {
  async getItem(k) { return m.has(k) ? m.get(k) : null; },
  async setItem(k, v) { m.set(k, String(v)); },
  async removeItem(k) { m.delete(k); },
  async multiGet(keys) { return keys.map(k => [k, m.has(k) ? m.get(k) : null]); },
  async multiSet(pairs) { pairs.forEach(([k, v]) => m.set(k, String(v))); },
  async multiRemove(keys) { keys.forEach(k => m.delete(k)); },
  async getAllKeys() { return [...m.keys()]; },
  async clear() { m.clear(); },
};
export default AsyncStorage;
