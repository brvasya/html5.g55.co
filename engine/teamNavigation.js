// Read the map's grid; never replace or mutate its player-centered flood field.
// Each opponent gets an independent cached field, so two teams can route in
// different directions while the original map continues updating normally.
export function createTeamArena({ THREE, navigation, floorObjects, spawn }) {
  const grid = navigation?.grid;
  if (!grid?.walkable || !grid.width || !grid.cellSize || !Number.isFinite(grid.origin)) {
    throw new Error("Team deathmatch requires a map with an existing walkable navigation grid.");
  }
  const { width, cellSize, origin, walkable } = grid;
  const count = walkable.length, height = Math.floor(count / width);
  const queue = new Int32Array(count), fields = new Map();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 40);
  const floorNormal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  const directionTarget = new THREE.Vector3();
  const xAt = i => origin + (i % width + 0.5) * cellSize;
  const zAt = i => origin + (Math.floor(i / width) + 0.5) * cellSize;
  const positions = new Map();

  function cellAt(point) {
    const x = Math.floor((point.x - origin) / cellSize), z = Math.floor((point.z - origin) / cellSize);
    return x < 0 || z < 0 || x >= width || z >= height ? -1 : z * width + x;
  }
  function nearestCell(point, connected = null) {
    const cell = cellAt(point);
    if (cell >= 0 && walkable[cell] && (!connected || connected[cell] >= 0)) return cell;
    let best = -1, distance = Infinity;
    for (let i = 0; i < count; i++) {
      if (!walkable[i] || (connected && connected[i] < 0)) continue;
      const d = (point.x - xAt(i)) ** 2 + (point.z - zAt(i)) ** 2;
      if (d < distance) { best = i; distance = d; }
    }
    return best;
  }
  function neighbors(cell, visit) {
    const x = cell % width;
    if (x > 0) visit(cell - 1);
    if (x < width - 1) visit(cell + 1);
    if (cell >= width) visit(cell - width);
    if (cell + width < count) visit(cell + width);
  }
  function flood(cell) {
    const distance = new Int32Array(count); distance.fill(-1);
    if (cell < 0) return distance;
    let head = 0, tail = 1; queue[0] = cell; distance[cell] = 0;
    while (head < tail) {
      const current = queue[head++];
      neighbors(current, next => {
        if (!walkable[next] || distance[next] >= 0) return;
        distance[next] = distance[current] + 1; queue[tail++] = next;
      });
    }
    return distance;
  }
  const blueCell = nearestCell(spawn);
  const blueDistances = flood(blueCell);
  let redCell = blueCell;
  for (let i = 0; i < count; i++) if (blueDistances[i] > blueDistances[redCell]) redCell = i;
  if (blueCell < 0 || redCell === blueCell) throw new Error("No connected team spawn positions in this map.");
  const redDistances = flood(redCell);
  const connectedCells = Array.from({ length: count }, (_, i) => i).filter(i => blueDistances[i] >= 0);
  const anchors = { blue: blueCell, red: redCell };
  const pools = {};
  for (const team of ["blue", "red"]) {
    const own = team === "blue" ? blueDistances : redDistances;
    const other = team === "blue" ? redDistances : blueDistances;
    // Prefer a broad home area, with the connected map as a safety fallback.
    pools[team] = connectedCells.filter(i => own[i] <= Math.max(12, other[anchors[team]] * 0.25) && own[i] < other[i]);
  }

  function floorPoint(cell) {
    if (positions.has(cell)) return positions.get(cell);
    ray.ray.origin.set(xAt(cell), spawn.y + 8, zAt(cell));
    const hit = ray.intersectObjects(floorObjects, false).find(hit => {
      if (!hit.face || Math.abs(hit.point.y - (spawn.y - 1.75)) >= 1.5) return false;
      normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      return floorNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize().y > 0.45;
    });
    const point = hit ? hit.point.clone() : null;
    positions.set(cell, point);
    return point;
  }
  function getSpawnPoint(team, actors = []) {
    const ownDistances = team === "blue" ? blueDistances : redDistances;
    let best = null, bestScore = -Infinity;
    // Inspect a bounded random sample, then fall back to any reachable floor.
    for (const pool of [pools[team], connectedCells]) {
      const start = Math.floor(Math.random() * pool.length);
      for (let k = 0; k < Math.min(pool.length, 160); k++) {
        const cell = pool[(start + k) % pool.length];
        const point = floorPoint(cell);
        if (!point) continue;
        let occupied = false, nearestOpponent = 45, exposed = false;
        for (const actor of actors) {
          const d = Math.hypot(point.x - actor.position.x, point.z - actor.position.z);
          if (d < 1.5) { occupied = true; break; }
          if (actor.team !== team) {
            nearestOpponent = Math.min(nearestOpponent, d);
            if (d < 28 && navigation.hasLineOfSight(point, actor.position, 0.12)) exposed = true;
          }
        }
        if (occupied) continue;
        const score = Math.min(35, nearestOpponent) * 4 - (exposed ? 65 : 0)
          - ownDistances[cell] * 0.25 + Math.random() * 4;
        if (score > bestScore) { bestScore = score; best = point; }
      }
      if (bestScore >= 25) break;
    }
    return best?.clone() || null;
  }

  function getMoveTarget(position, target) {
    if (navigation.hasLineOfSight(position, target, 0.58)) return target;
    const cell = nearestCell(target, blueDistances);
    if (cell < 0) return position;
    let distances = fields.get(cell);
    if (!distances) {
      distances = flood(cell);
      if (fields.size >= 24) fields.delete(fields.keys().next().value);
      fields.set(cell, distances);
    }
    let current = nearestCell(position, blueDistances);
    if (current < 0 || distances[current] < 0) return position;
    directionTarget.set(xAt(current), position.y, zAt(current));
    for (let step = 0; step < 7; step++) {
      let next = current;
      neighbors(current, candidate => {
        if (distances[candidate] >= 0 && distances[candidate] < distances[next]) next = candidate;
      });
      if (next === current) break;
      const point = { x: xAt(next), y: position.y, z: zAt(next) };
      if (!navigation.hasLineOfSight(position, point, 0.58)) break;
      directionTarget.copy(point); current = next;
    }
    return directionTarget;
  }
  return { getSpawnPoint, getMoveTarget,
    canReach: point => {
      const cell = nearestCell(point, blueDistances);
      return cell >= 0 && Math.hypot(point.x - xAt(cell), point.z - zAt(cell)) < cellSize * 2;
    },
    facing: team => {
      const own = anchors[team], other = anchors[team === "blue" ? "red" : "blue"];
      return Math.atan2(xAt(own) - xAt(other), zAt(own) - zAt(other));
    }
  };
}
