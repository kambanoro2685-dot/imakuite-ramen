import { Post } from './store';
import { Venue } from './venues';

export type Pin = { id: string; n: string; g: string; lat: number; lng: number; count: number; lastSat: number; last: number };

/** 自分が調査（投稿）した店だけを、調査マップのピンにまとめる。座標が無い古い投稿は載せられない */
export function visitedPins(posts: Post[], byId: (id: string) => Venue | undefined): Pin[] {
  const m = new Map<string, Pin>();
  for (const p of posts) {
    const v = byId(p.venue);
    const lat = p.lat ?? v?.lat;
    const lng = p.lng ?? v?.lng;
    if (lat == null || lng == null) continue;
    const cur = m.get(p.venue);
    if (!cur) m.set(p.venue, { id: p.venue, n: p.venueName, g: p.genre ?? v?.g ?? 'その他', lat, lng, count: 1, lastSat: p.sat, last: p.t });
    else {
      cur.count++;
      if (p.t > cur.last) { cur.last = p.t; cur.lastSat = p.sat; }
    }
  }
  return [...m.values()].sort((a, b) => b.last - a.last);
}

export const pinLabel = (p: Pin) => `${p.n}（${p.count}回調査）`;

export type Trail = {
  /** 行った順に並べた店（初めて行った順。番号は 1 から） */
  stops: (Pin & { no: number; first: number })[];
  /** 軌跡の線: 投稿を古い順にたどった座標（同じ店が続くときは 1 つにまとめる） */
  path: { lat: number; lng: number }[];
  /** 線の長さの合計[m]（直線距離の合計。実際に歩いた距離ではない） */
  meters: number;
  visits: number;
};

const rad = Math.PI / 180;
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  6371000 * Math.acos(Math.min(1, Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad) + Math.sin(a.lat * rad) * Math.sin(b.lat * rad)));

/** 今までに行った店の「軌跡」: 投稿を古い順にたどり、初めて行った順に番号を付ける */
export function buildTrail(posts: Post[], byId: (id: string) => Venue | undefined): Trail {
  const sorted = [...posts].sort((a, b) => a.t - b.t);
  const pins = new Map(visitedPins(posts, byId).map((p) => [p.id, p]));
  const stops: Trail['stops'] = [];
  const seen = new Map<string, number>();
  const path: { lat: number; lng: number }[] = [];
  let lastId = '';
  for (const p of sorted) {
    const pin = pins.get(p.venue);
    if (!pin) continue;
    if (!seen.has(p.venue)) {
      seen.set(p.venue, stops.length + 1);
      stops.push({ ...pin, no: stops.length + 1, first: p.t });
    }
    if (p.venue !== lastId) path.push({ lat: pin.lat, lng: pin.lng });
    lastId = p.venue;
  }
  let meters = 0;
  for (let i = 1; i < path.length; i++) meters += dist(path[i - 1], path[i]);
  return { stops, path, meters: Math.round(meters), visits: sorted.length };
}
