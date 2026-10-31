import { useCallback } from 'react';
import { Post, useStore } from './store';
import { Venue, useVenues } from './venues';

// ジャンルごとの見本の品名・価格・感想
const DISH: Record<string, [string, number, string]> = {
  醤油: ['中華そば', 850, '鶏ガラの出汁がやさしい。麺は細めで、スープによく絡む。'],
  味噌: ['味噌ラーメン', 950, 'コクがあって、体が温まる。野菜がたっぷり。'],
  塩: ['塩ラーメン', 880, 'すっきりしているのに、うま味がしっかり。'],
  豚骨: ['豚骨ラーメン', 900, '白濁したスープが濃厚。替え玉が進む。'],
  家系: ['家系ラーメン', 950, '鶏油が効いたスープ。海苔とほうれん草が合う。'],
  二郎系: ['小ラーメン ヤサイマシ', 1000, '麺も野菜も圧倒的な量。にんにくが効いている。'],
  つけ麺: ['濃厚つけ麺', 1100, '麺が太くてもちもち。スープ割りまで楽しめた。'],
  'まぜそば・油そば': ['油そば', 850, 'タレと油が麺に絡む。酢とラー油で味変した。'],
  担々麺: ['担々麺', 980, 'ごまの風味と山椒の痺れ。辛さの後にコクが来る。'],
  '煮干し・魚介': ['煮干しそば', 900, '煮干しの香りが強い。ガツンと来るのに後味は軽い。'],
  鶏白湯: ['鶏白湯ラーメン', 950, 'クリーミーでまろやか。柚子の香りが爽やか。'],
  その他: ['ラーメン', 900, 'ほどよい味。麺の茹で加減がちょうどよかった。'],
};

const SAT = [5, 4, 3, 4, 5, 4];
const DAYS = [1, 2, 4, 6, 9, 12];

/** 近くの店（ジャンルが重ならないように）から、見本の調査記録と「今日の指令」を作る */
export function buildSample(venues: Venue[], exclude: string[]): { posts: Post[]; mission: Venue | null } | null {
  const pool = venues.filter((v) => !exclude.includes(v.id)).sort((a, b) => a.dist - b.dist);
  const picked: Venue[] = [];
  for (const v of pool) {
    if (picked.length >= 6) break;
    if (!picked.some((p) => p.g === v.g)) picked.push(v);
  }
  for (const v of pool) {
    if (picked.length >= 6) break;
    if (!picked.includes(v)) picked.push(v);
  }
  if (picked.length < 3) return null;
  const mission = picked.length >= 6 ? picked[5] : null;
  const now = Date.now();
  const posts: Post[] = picked.slice(0, 5).map((v, i) => {
    const [dish, price, note] = DISH[v.g] ?? DISH['その他'];
    return {
      id: now - i * 1000, // 重ならない見本用ID
      venue: v.id, venueName: v.n, lat: v.lat, lng: v.lng, genre: v.g,
      dish, sat: SAT[i], vals: { price: String(price), note, amount: 'ちょうど' },
      weather: null, enteredAt: null, first: true, pts: 0, rouletteId: null,
      t: now - DAYS[i] * 24 * 3600e3, edits: [], sample: true,
    };
  });
  return { posts, mission };
}

/** 見本データ（この端末だけ。サーバへは送らず、ポイントにも数えない）の出し入れ */
export function useSamples() {
  const { S, update, showToast } = useStore();
  const { venues, loading } = useVenues();
  const has = S.posts.some((p) => p.sample);

  const add = useCallback(() => {
    if (has) return;
    if (loading || venues.length === 0) return showToast('店のデータを読み込めていません。少し待ってからもう一度お試しください。');
    const made = buildSample(venues, S.posts.map((p) => p.venue));
    if (!made) return showToast('見本に使える店が、近くに足りません。');
    update((s) => ({
      ...s,
      posts: [...made.posts, ...s.posts],
      mission: s.mission ?? (made.mission ? { id: made.mission.id, n: made.mission.n, g: made.mission.g, lat: made.mission.lat, lng: made.mission.lng, at: Date.now() - 3600e3, sample: true } : null),
    }));
    showToast(`見本を${made.posts.length}件入れました（この端末だけ・ポイントには数えません）。`);
  }, [has, loading, venues, S.posts, update, showToast]);

  const clear = useCallback(() => {
    update((s) => ({
      ...s,
      posts: s.posts.filter((p) => !p.sample),
      mission: s.mission?.sample ? null : s.mission,
    }));
    showToast('見本を消しました。');
  }, [update, showToast]);

  return { has, add, clear };
}
