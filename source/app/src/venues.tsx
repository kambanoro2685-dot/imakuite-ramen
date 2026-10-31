import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { friendly, oshiShops } from './account';
import { useStore } from './store';
import { supabase } from './supabase';

export type Venue = {
  id: string; // shop.id (uuid)
  n: string;
  g: string;
  lat: number;
  lng: number;
  url: string | null;
  /** 評価件数。3件未満は null（調査待ち） */
  reviews: number | null;
  /** 階級ごとの調査件数 [見習い,三等,二等,一等,主任,特別監察官]。3件未満は null */
  ranks: number[] | null;
  /** 口コミ3件以上の店だけ: いちばん多いスープの系統・濃さの平均(0〜4)・いちばん多い麺の太さ */
  soup: string | null;
  rich: number | null;
  thick: string | null;
  /** いちばん多い麺の種類（ちぢれ・ストレート・平打ち） */
  ntype: string | null;
  /** 口コミで多いトッピング（上位3つ） */
  toppings: string[] | null;
  /** 基準点（現在地 or 岡山駅）からの距離[m] */
  dist: number;
};

export type Center = { lat: number; lng: number; source: 'gps' | 'default' };

// 岡山駅（第1期の対象エリア: 岡山市北区・中心部）
export const DEFAULT_CENTER: Center = { lat: 34.6666, lng: 133.9183, source: 'default' };

export const walkMin = (m: number) => Math.max(1, Math.round(m / 80));
/** 近い店は「徒歩N分」、遠い店は「約N.Nkm」 */
export const walkText = (m: number) => (m <= 2500 ? `徒歩${walkMin(m)}分` : `約${(m / 1000).toFixed(1)}km`);

type Ctx = {
  venues: Venue[];
  center: Center;
  loading: boolean;
  error: string;
  locating: boolean;
  /** いま使っている検索の半径[m]。近くに店が少ないときは、自動で広げる */
  radius: number;
  reload: () => Promise<void>;
  useMyLocation: () => Promise<void>;
  /** 基準を岡山駅（対象エリアの中心）にもどす */
  resetCenter: () => void;
  byId: (id: string) => Venue | undefined;
  /** 推しが調査した店: shop.id → 行った推しのコードネーム */
  oshiOf: Record<string, string[]>;
  reloadOshi: () => Promise<void>;
};
const VenueCtx = createContext<Ctx>(null as unknown as Ctx);
export const useVenues = () => useContext(VenueCtx);

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const [center, setCenter] = useState<Center>(DEFAULT_CENTER);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(3000);
  const seen = useRef(new Map<string, Venue>());
  const { S } = useStore();
  const [oshiOf, setOshiOf] = useState<Record<string, string[]>>({});
  const loggedIn = !!S.account;

  const reloadOshi = useCallback(async () => {
    if (!loggedIn) { setOshiOf({}); return; }
    try {
      const l = await oshiShops();
      setOshiOf(Object.fromEntries(l.map((x) => [x.shop_id, x.names])));
    } catch { /* 推しの店が取れなくても、ほかの機能は使える */ }
  }, [loggedIn]);
  useEffect(() => { reloadOshi(); }, [reloadOshi]);

  const load = useCallback(async (c: Center) => {
    setLoading(true);
    setError('');
    // まず半径3km。店が少ない（6件未満）ときは、8km → 20km と広げて、近い順に候補を出す
    let rows: any[] = [];
    let used = 3000;
    for (const r of [3000, 8000, 20000]) {
      const { data, error: e } = await supabase.rpc('search_shops', {
        p_lat: c.lat, p_lng: c.lng, p_radius_m: r, p_limit: 300,
      });
      if (e) {
        setError(friendly(e));
        setLoading(false);
        return;
      }
      rows = (data as any[]) ?? [];
      used = r;
      if (rows.length >= 6) break;
    }
    setRadius(used);
    const list: Venue[] = rows.map((r) => ({
      id: r.id, n: r.name, g: r.genre ?? 'その他', lat: r.lat, lng: r.lng, url: r.url ?? null,
      reviews: r.review_count ?? null, ranks: r.rank_counts ?? null,
      soup: r.soup_top ?? null, rich: r.richness_avg == null ? null : Number(r.richness_avg), thick: r.thick_top ?? null, ntype: r.type_top ?? null, toppings: r.toppings_top ?? null, dist: r.distance_m ?? 0,
    }));
    list.forEach((v) => seen.current.set(v.id, v));
    setVenues(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(center); }, [center, load]);

  const reload = useCallback(() => load(center), [center, load]);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    setError('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('位置情報が許可されていません。ブラウザの設定で許可してください。');
      const pos = await Location.getCurrentPositionAsync({});
      setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '現在地を取得できませんでした。');
    } finally {
      setLocating(false);
    }
  }, []);

  const resetCenter = useCallback(() => setCenter(DEFAULT_CENTER), []);

  const byId = useCallback((id: string) => seen.current.get(id), []);

  return (
    <VenueCtx.Provider value={{ venues, center, loading, error, locating, reload, useMyLocation, resetCenter, radius, byId, oshiOf, reloadOshi }}>
      {children}
    </VenueCtx.Provider>
  );
}
