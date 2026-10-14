export function parcelId(city, seed, x, y, rot) {
  if (![seed, x, y, rot].every(Number.isFinite)) throw new TypeError('finite parcel coordinates required');
  if (!/^[a-z][a-z0-9-]*$/.test(city)) throw new TypeError('invalid city id');
  const q = v => Math.round(v * 100);
  const angle = ((rot % Math.PI) + Math.PI) % Math.PI;
  return `${city}:${seed}:p:${q(x)}:${q(y)}:${Math.round(angle * 10000)}`;
}
