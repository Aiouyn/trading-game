export class LRU {
  constructor(max = 2) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be >= 1');
    this.max = max;
    this.map = new Map();
  }
  get size() {
    return this.map.size;
  }
  has(key) {
    return this.map.has(key);
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return this;
  }
  keys() {
    return [...this.map.keys()];
  }
}
