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
