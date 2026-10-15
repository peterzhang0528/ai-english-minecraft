import {
  DIRT,
  GRASS,
  LEAVES,
  LOG,
  PLANKS,
  SAND,
  STONE,
  WATER,
  castRay,
  viewDirection,
  type World,
} from "./world.ts";

const COLORS: Record<number, [number, number, number]> = {
  [GRASS]: [86, 168, 72],
  [DIRT]: [139, 96, 52],
  [STONE]: [128, 128, 134],
  [LOG]: [122, 78, 42],
  [LEAVES]: [48, 122, 58],
  [WATER]: [62, 132, 206],
  [PLANKS]: [186, 148, 92],
  [SAND]: [214, 196, 138],
};

const SKY: [number, number, number] = [156, 206, 236];

interface Buffer {
  image: ImageData;
  depth: Float32Array;
  w: number;
  h: number;
}

const buffers = new WeakMap<HTMLCanvasElement, Buffer>();

function colorFor(id: number, top: boolean): [number, number, number] {
  if (id === GRASS && !top) return COLORS[DIRT];
  return COLORS[id] || [180, 180, 180];
}

function shade(rgb: [number, number, number], face: string, dist: number): [number, number, number] {
  const faceMul = face === "y" ? 1 : face === "z" ? 0.82 : 0.66;
  const fog = Math.min(0.78, dist / 28);
  return [
    Math.round(rgb[0] * faceMul * (1 - fog) + SKY[0] * fog),
    Math.round(rgb[1] * faceMul * (1 - fog) + SKY[1] * fog),
    Math.round(rgb[2] * faceMul * (1 - fog) + SKY[2] * fog),
  ];
}

function skyColor(dy: number): [number, number, number] {
  const horizon = Math.max(0, Math.min(1, 0.55 - dy));
  return [
    Math.round(128 + horizon * 90),
    Math.round(188 + horizon * 36),
    Math.round(232 - horizon * 12),
  ];
}

function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  let tMin = 0;
  let tMax = Infinity;
  const slabs: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [origin, dir, min, max] of slabs) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < min || origin > max) return Infinity;
      continue;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return Infinity;
  }
  if (tMin > 0.05) return tMin;
  return Infinity;
}

export function renderWorld(world: World, canvas: HTMLCanvasElement): void {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const bw = Math.max(120, Math.min(220, Math.round(cssW / 4)));
  const bh = Math.max(68, Math.round(bw * (cssH / cssW)));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  let buffer = buffers.get(canvas);
  if (!buffer || buffer.w !== bw || buffer.h !== bh || canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
    buffer = { image: ctx.createImageData(bw, bh), depth: new Float32Array(bw * bh), w: bw, h: bh };
    buffers.set(canvas, buffer);
  }
  const { image, depth } = buffer;
  const data = image.data;
  const eyeX = world.player.x;
  const eyeY = world.player.y + 1.5;
  const eyeZ = world.player.z;
  const forward = viewDirection(world);
  const yaw = world.player.yaw;
  const pitch = world.player.pitch;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const rx = cy;
  const ry = 0;
  const rz = -sy;
  const ux = -sy * sp;
  const uy = cp;
  const uz = -cy * sp;
  const fov = (72 * Math.PI) / 180;
  const scale = Math.tan(fov / 2);
  const aspect = bw / bh;
  depth.fill(Infinity);

  for (let py = 0; py < bh; py += 1) {
    const ndcY = 1 - (py + 0.5) / bh * 2;
    for (let px = 0; px < bw; px += 1) {
      const ndcX = (px + 0.5) / bw * 2 - 1;
      const dx = forward.x + rx * ndcX * scale * aspect + ux * ndcY * scale;
      const dy = forward.y + ry * ndcX * scale * aspect + uy * ndcY * scale;
      const dz = forward.z + rz * ndcX * scale * aspect + uz * ndcY * scale;
      const hit = castRay(world, eyeX, eyeY, eyeZ, dx, dy, dz);
      const offset = (py * bw + px) * 4;
      let rgb: [number, number, number];
      if (!hit) {
        const len = Math.hypot(dx, dy, dz) || 1;
        rgb = skyColor(dy / len);
      } else {
        depth[py * bw + px] = hit.dist;
        rgb = shade(colorFor(hit.id, hit.top), hit.face, hit.dist);
        if ((hit.x + hit.z) % 2 === 0 && hit.top) {
          rgb = [Math.min(255, rgb[0] + 8), Math.min(255, rgb[1] + 8), rgb[2]];
        }
      }
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }

  const maple = world.maple;
  const minX = maple.x - 0.32;
  const maxX = maple.x + 0.32;
  const minY = maple.y;
  const maxY = maple.y + 1.7;
  const minZ = maple.z - 0.32;
  const maxZ = maple.z + 0.32;
  for (let py = 0; py < bh; py += 1) {
    const ndcY = 1 - (py + 0.5) / bh * 2;
    for (let px = 0; px < bw; px += 1) {
      const ndcX = (px + 0.5) / bw * 2 - 1;
      const dx = forward.x + rx * ndcX * scale * aspect + ux * ndcY * scale;
      const dy = forward.y + ry * ndcX * scale * aspect + uy * ndcY * scale;
      const dz = forward.z + rz * ndcX * scale * aspect + uz * ndcY * scale;
      const len = Math.hypot(dx, dy, dz) || 1;
      const t = rayBox(eyeX, eyeY, eyeZ, dx / len, dy / len, dz / len, minX, minY, minZ, maxX, maxY, maxZ);
      if (!Number.isFinite(t) || t >= depth[py * bw + px]) continue;
      const hitY = eyeY + (dy / len) * t;
      const head = hitY > maple.y + 1.22;
      const offset = (py * bw + px) * 4;
      data[offset] = head ? 244 : 196;
      data[offset + 1] = head ? 214 : 78;
      data[offset + 2] = head ? 186 : 62;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}
