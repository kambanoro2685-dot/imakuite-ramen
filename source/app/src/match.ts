import { Profile } from './store';
import { Venue } from './venues';

export type Match = {
  /** 相性 0〜100。材料がなければ null */
  pct: number | null;
  /** 何から出した値か: reviews=調査官の口コミ（3件以上）／name=店名から推定した系統だけ */
  basis: 'reviews' | 'name' | 'none';
};

/**
 * 好みと店の相性。系統（好きなラーメン）・こってり度・麺の太さの3つを、分かるものだけで見る。
 * 口コミが3件以上たまった店は、いちばん多いスープ・濃さの平均・麺の太さを使う。
 * まだの店は、店名から推定した系統だけ（目安）。
 */
export function matchOf(v: Venue, p: Profile): Match {
  const parts: { w: number; s: number }[] = [];
  const fav = p.favorites;
  if (fav.length) {
    if (v.soup && fav.includes(v.soup)) parts.push({ w: 0.35, s: 1 });
    else if (v.g !== 'その他' && fav.includes(v.g)) parts.push({ w: 0.35, s: 1 });
    else if (v.soup || v.g !== 'その他') parts.push({ w: 0.35, s: 0.2 }); // 好みの系統でなくても、0%にはしない
  }
  if (p.rich != null && v.rich != null) parts.push({ w: 0.25, s: Math.max(0, 1 - Math.abs(v.rich - p.rich) / 4) });
  if (p.thick && v.thick) {
    const o = ['細', '中', '太', '極太'];
    const gap = Math.abs(o.indexOf(v.thick) - o.indexOf(p.thick));
    parts.push({ w: 0.15, s: gap === 0 ? 1 : gap === 1 ? 0.5 : 0 });
  }
  if (p.ntype && v.ntype) parts.push({ w: 0.15, s: p.ntype === v.ntype ? 1 : 0 });
  const pt = p.toppings ?? [];
  if (pt.length && v.toppings?.length) {
    // 好きなトッピングのうち、口コミで多いトッピングに入っているものの割合（少ない方の数で割る）
    const hit = v.toppings.filter((t) => pt.includes(t)).length;
    parts.push({ w: 0.1, s: Math.min(1, hit / Math.min(pt.length, v.toppings.length)) });
  }
  if (!parts.length) return { pct: null, basis: 'none' };
  const w = parts.reduce((a, x) => a + x.w, 0);
  const pct = Math.round((parts.reduce((a, x) => a + x.w * x.s, 0) / w) * 100);
  return { pct, basis: v.rich != null || v.thick != null || v.ntype != null || v.toppings != null || v.soup ? 'reviews' : 'name' };
}
