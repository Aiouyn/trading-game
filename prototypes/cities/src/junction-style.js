export function eligibleJunctionArm({
  nodeId,
  armId,
  degree,
  cls,
  walk,
  length,
  rail = false,
  bridge = false,
  portService = false,
  seen = null,
}) {
  if (!Number.isInteger(nodeId) || nodeId < 0) return false;
  if (!(degree >= 3)) return false;
  if (!(cls >= 3)) return false;
  if (!(walk > 0)) return false;
  if (!(length > 14)) return false;
  if (rail || bridge || portService) return false;
  if (seen) {
    const key = `${nodeId}:${armId}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
