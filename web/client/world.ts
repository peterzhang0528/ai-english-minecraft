export const WORLD_W = 48;
export const WORLD_H = 16;
export const WORLD_D = 48;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const LOG = 4;
export const LEAVES = 5;
export const WATER = 6;
export const PLANKS = 7;
export const SAND = 8;

export const BLOCK_LABELS: Record<number, { en: string; zh: string }> = {
  [GRASS]: { en: "grass", zh: "草方块" },
  [DIRT]: { en: "dirt", zh: "泥土" },
  [STONE]: { en: "stone", zh: "石头" },
  [LOG]: { en: "wood", zh: "木头" },
  [LEAVES]: { en: "leaves", zh: "树叶" },
  [WATER]: { en: "water", zh: "水" },
  [PLANKS]: { en: "wood planks", zh: "木板" },
  [SAND]: { en: "sand", zh: "沙子" },
};

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface Player {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vy: number;
  onGround: boolean;
}

export interface MapleNpc {
  x: number;
  y: number;
  z: number;
  yaw: number;
  follow: boolean;
  homeX: number;
  homeZ: number;
}

export interface World {
  blocks: Uint8Array;
  player: Player;
  maple: MapleNpc;
}

export interface RayHit {
  dist: number;
  id: number;
  face: "x" | "y" | "z";
  top: boolean;
  x: number;
  y: number;
  z: number;
}

const SPEED = 4.5;
const GRAVITY = 22;
const JUMP = 7.3;
const BODY = 1.62;
const RADIUS = 0.27;

export function isSolid(id: number): boolean {
  return id !== AIR;
}

export function blockIndex(x: number, y: number, z: number): number {
  return x + WORLD_W * (z + WORLD_D * y);
}

export function getBlock(world: World, x: number, y: number, z: number): number {
  if (y < 0) return STONE;
  if (x < 0 || z < 0 || x >= WORLD_W || y >= WORLD_H || z >= WORLD_D) return AIR;
  return world.blocks[blockIndex(x, y, z)];
}

export function setBlock(world: World, x: number, y: number, z: number, id: number): void {
  if (x < 0 || y < 0 || z < 0 || x >= WORLD_W || y >= WORLD_H || z >= WORLD_D) return;
  world.blocks[blockIndex(x, y, z)] = id;
}

function hash(x: number, z: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function columnTop(x: number, z: number): number {
  const n = hash(x, z);
  if (n > 0.93) return 6;
  if (n > 0.8) return 5;
  if (n > 0.55) return 4;
  return 3;
}

function fillColumn(world: World, x: number, z: number, top: number, surface: number): void {
  for (let y = 0; y <= top; y += 1) {
    let id = STONE;
    if (y > top - 3) id = DIRT;
    if (y === top) id = surface;
    setBlock(world, x, y, z, id);
  }
}

function plantTree(world: World, x: number, z: number, ground: number): void {
  for (let y = 1; y <= 3; y += 1) setBlock(world, x, ground + y, z, LOG);
  for (let y = 3; y <= 4; y += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (y === 4 && Math.abs(dx) + Math.abs(dz) === 2) continue;
        if (dx === 0 && dz === 0 && y === 3) continue;
        const id = getBlock(world, x + dx, ground + y, z + dz);
        if (id === AIR || id === LEAVES) setBlock(world, x + dx, ground + y, z + dz, LEAVES);
      }
    }
  }
}

function buildHut(world: World): void {
  const x0 = 8;
  const z0 = 36;
  const floor = 4;
  for (let x = x0; x <= x0 + 4; x += 1) {
    for (let z = z0; z <= z0 + 4; z += 1) {
      setBlock(world, x, floor, z, PLANKS);
      for (let y = floor + 1; y <= floor + 3; y += 1) setBlock(world, x, y, z, AIR);
    }
  }
  for (let x = x0; x <= x0 + 4; x += 1) {
    for (let z = z0; z <= z0 + 4; z += 1) {
      const edge = x === x0 || x === x0 + 4 || z === z0 || z === z0 + 4;
      if (!edge) continue;
      const door = x === x0 + 2 && z === z0;
      for (let y = floor + 1; y <= floor + 2; y += 1) {
        if (door && y <= floor + 2) continue;
        setBlock(world, x, y, z, PLANKS);
      }
      setBlock(world, x, floor + 3, z, PLANKS);
    }
  }
}

export function createWorld(): World {
  const world: World = {
    blocks: new Uint8Array(WORLD_W * WORLD_H * WORLD_D),
    player: { x: 24.5, y: 5, z: 24.5, yaw: Math.PI / 2, pitch: 0, vy: 0, onGround: true },
    maple: { x: 27.6, y: 5, z: 24.5, yaw: -Math.PI / 2, follow: false, homeX: 27.6, homeZ: 24.5 },
  };

  for (let z = 0; z < WORLD_D; z += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const dx = x - 38;
      const dz = z - 12;
      const pond = dx * dx + dz * dz < 18;
      if (pond) {
        fillColumn(world, x, z, 2, STONE);
        setBlock(world, x, 3, z, WATER);
        continue;
      }
      const nearPond = dx * dx + dz * dz < 30;
      let top = columnTop(x, z);
      if (x >= 16 && x <= 32 && z >= 16 && z <= 32) top = 4;
      fillColumn(world, x, z, top, nearPond ? SAND : GRASS);
      const treeRoll = hash(x + 19, z + 7);
      const clear = x >= 16 && x <= 32 && z >= 16 && z <= 32;
      if (!clear && !nearPond && treeRoll > 0.945 && x > 1 && z > 1 && x < WORLD_W - 2 && z < WORLD_D - 2) {
        plantTree(world, x, z, top);
      }
    }
  }
  buildHut(world);
  world.player.y = floorTop(world, world.player.x, world.player.z) + 1;
  world.maple.y = floorTop(world, world.maple.x, world.maple.z) + 1;
  return world;
}

export function floorTop(world: World, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  for (let y = WORLD_H - 1; y >= 0; y -= 1) {
    if (isSolid(getBlock(world, ix, y, iz))) return y;
  }
  return 0;
}

export function bodyBlocked(world: World, x: number, feet: number, z: number): boolean {
  if (x < 0.8 || z < 0.8 || x > WORLD_W - 0.8 || z > WORLD_D - 0.8) return true;
  const ys = [feet + 0.12, feet + 0.9, feet + BODY - 0.08];
  const xs = [x - RADIUS, x, x + RADIUS];
  const zs = [z - RADIUS, z, z + RADIUS];
  for (const y of ys) {
    for (const sx of xs) {
      for (const sz of zs) {
        if (isSolid(getBlock(world, Math.floor(sx), Math.floor(y), Math.floor(sz)))) return true;
      }
    }
  }
  return false;
}

export function look(world: World, dxPixels: number, dyPixels: number, sensitivity = 0.0055): void {
  world.player.yaw += dxPixels * sensitivity;
  world.player.pitch -= dyPixels * sensitivity;
  const limit = Math.PI / 2 - 0.08;
  if (world.player.pitch > limit) world.player.pitch = limit;
  if (world.player.pitch < -limit) world.player.pitch = -limit;
}

export function setFollow(world: World, follow: boolean): void {
  world.maple.follow = follow;
  if (!follow) {
    world.maple.homeX = world.maple.x;
    world.maple.homeZ = world.maple.z;
  }
}

function moveHorizontal(world: World, dx: number, dz: number): void {
  const player = world.player;
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (!bodyBlocked(world, nx, player.y, nz)) {
    player.x = nx;
    player.z = nz;
    return;
  }
  if (
    player.onGround &&
    !bodyBlocked(world, player.x, player.y + 1, player.z) &&
    !bodyBlocked(world, nx, player.y + 1, nz)
  ) {
    player.y += 1;
    player.x = nx;
    player.z = nz;
    return;
  }
  if (!bodyBlocked(world, nx, player.y, player.z)) player.x = nx;
  else if (!bodyBlocked(world, player.x, player.y, nz)) player.z = nz;
}

function moveVertical(world: World, dt: number): void {
  const player = world.player;
  const next = player.y + player.vy * dt;
  if (!bodyBlocked(world, player.x, next, player.z)) {
    player.y = next;
    player.onGround = false;
    return;
  }
  if (player.vy < 0) {
    let lo = next;
    let hi = player.y;
    for (let i = 0; i < 10; i += 1) {
      const mid = (lo + hi) / 2;
      if (bodyBlocked(world, player.x, mid, player.z)) lo = mid;
      else hi = mid;
    }
    player.y = hi;
    player.onGround = true;
  }
  player.vy = 0;
}

function moveMaple(world: World, dt: number): void {
  const maple = world.maple;
  const targetX = maple.follow ? world.player.x : maple.homeX;
  const targetZ = maple.follow ? world.player.z : maple.homeZ;
  let dx = targetX - maple.x;
  let dz = targetZ - maple.z;
  const dist = Math.hypot(dx, dz);
  const stop = maple.follow ? 1.85 : 0.2;
  if (dist > stop) {
    dx /= dist;
    dz /= dist;
    const stepLen = Math.min(3.4 * dt, dist - stop);
    const nx = maple.x + dx * stepLen;
    const nz = maple.z + dz * stepLen;
    const current = floorTop(world, maple.x, maple.z);
    const next = floorTop(world, nx, nz);
    const inside = nx > 1 && nz > 1 && nx < WORLD_W - 1 && nz < WORLD_D - 1;
    if (inside && next <= current + 1) {
      maple.x = nx;
      maple.z = nz;
    } else if (inside && floorTop(world, nx, maple.z) <= current + 1) {
      maple.x = nx;
    } else if (inside && floorTop(world, maple.x, nz) <= current + 1) {
      maple.z = nz;
    }
    maple.yaw = Math.atan2(dx, dz);
  }
  maple.y = floorTop(world, maple.x, maple.z) + 1;
}

export function step(world: World, input: MoveInput, dt: number): void {
  const frame = Math.max(0, Math.min(dt, 0.05));
  const player = world.player;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let mx = 0;
  let mz = 0;
  if (input.forward) {
    mx += sin;
    mz += cos;
  }
  if (input.back) {
    mx -= sin;
    mz -= cos;
  }
  if (input.left) {
    mx -= cos;
    mz += sin;
  }
  if (input.right) {
    mx += cos;
    mz -= sin;
  }
  const length = Math.hypot(mx, mz);
  if (length > 0) {
    moveHorizontal(world, (mx / length) * SPEED * frame, (mz / length) * SPEED * frame);
  }
  if (input.jump && player.onGround) {
    player.vy = JUMP;
    player.onGround = false;
  } else {
    player.vy -= GRAVITY * frame;
    if (player.vy < -28) player.vy = -28;
  }
  moveVertical(world, frame);
  moveMaple(world, frame);
}

export function castRay(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): RayHit | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);
  let mapZ = Math.floor(oz);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  const stepZ = dz < 0 ? -1 : 1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? mapX + 1 - ox : ox - mapX) / Math.abs(dx);
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? mapY + 1 - oy : oy - mapY) / Math.abs(dy);
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? mapZ + 1 - oz : oz - mapZ) / Math.abs(dz);
  let face: "x" | "y" | "z" = "y";
  for (let i = 0; i < 80; i += 1) {
    let dist = 0;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      dist = tMaxX;
      mapX += stepX;
      tMaxX += tDeltaX;
      face = "x";
    } else if (tMaxY <= tMaxZ) {
      dist = tMaxY;
      mapY += stepY;
      tMaxY += tDeltaY;
      face = "y";
    } else {
      dist = tMaxZ;
      mapZ += stepZ;
      tMaxZ += tDeltaZ;
      face = "z";
    }
    if (dist > 32) return null;
    const id = getBlock(world, mapX, mapY, mapZ);
    if (isSolid(id)) {
      const top = face === "y" && stepY === -1;
      return { dist, id, face, top, x: mapX, y: mapY, z: mapZ };
    }
  }
  return null;
}

export function viewDirection(world: World): { x: number; y: number; z: number } {
  const cosPitch = Math.cos(world.player.pitch);
  return {
    x: Math.sin(world.player.yaw) * cosPitch,
    y: Math.sin(world.player.pitch),
    z: Math.cos(world.player.yaw) * cosPitch,
  };
}

export function lookingAt(world: World): { id: number; en: string; zh: string } | null {
  const eyeY = world.player.y + 1.5;
  const dir = viewDirection(world);
  const hit = castRay(world, world.player.x, eyeY, world.player.z, dir.x, dir.y, dir.z);
  if (!hit || hit.dist > 6) return null;
  const label = BLOCK_LABELS[hit.id];
  if (!label) return null;
  return { id: hit.id, en: label.en, zh: label.zh };
}

const BARE = new Set(["grass", "water", "stone", "wood", "sand", "dirt", "leaves"]);

export function seeSentence(en: string): string {
  return BARE.has(en) ? `I see ${en}.` : `I see a ${en}.`;
}
