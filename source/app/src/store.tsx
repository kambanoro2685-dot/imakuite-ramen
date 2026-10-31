import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PALETTE, RANKS } from './data';
import { shopUuid } from './config';
import { supabase } from './supabase';

export type Edit = { f: string; o: string; n: string; t: number; reason: string };
export type Post = {
  id: number;
  venue: string; // shop.id (uuid)
  venueName: string;
  /** 調査した店の座標（調査マップに載せるため） */
  lat?: number;
  lng?: number;
  genre?: string;
  dish: string;
  sat: number;
  vals: Record<string, string>;
  weather: [string, number, number] | null;
  enteredAt: number | null;
  first: boolean;
  pts: number;
  rouletteId: string | null;
  rev?: string;
  t: number;
  edits: Edit[];
  /** サーバ同期の進捗（アカウントがある時だけ）。key=visit.id、dishId=dish.id（端末で採番）。step は sync.ts 参照 */
  sync?: { key: string; dishId: string; step: number; photosDone?: boolean };
  /** アップロード済みの写真（最大3枚） */
  photos?: { id: string; url: string }[];
  /** 見本データ（この端末だけ。サーバへ送らず、ポイントにも数えない） */
  sample?: boolean;
};
export type Ledger = { n: number; r: string; t: number };
export type Profile = {
  nickname: string;
  nationality: string;
  gender: string;
  age: string;
  allergies: string;
  favorites: string[];
  /** ラーメンの好み: こってり度（0=あっさり … 4=こってり）と、麺の太さ。未設定は null / 空 */
  rich: number | null;
  thick: string;
  /** 麺の種類の好み（ちぢれ・ストレート・平打ち）。未設定は空 */
  ntype: string;
  /** 好きなトッピング（複数）。古い保存データには無いので、使うときは ?? [] にする */
  toppings: string[];
};
export type State = {
  uid: string;
  onboarded: boolean;
  /** Supabase のアカウント。null は端末内だけで使うモード。passkey=false は匿名のまま（パスキー未設定） */
  account: { publicId: string; passkey: boolean; recovery?: boolean } | null;
  profile: Profile;
  /** 同意した利用規約の版。synced=false はサーバへ記録できていない（接続できたら送る） */
  terms: { version: string; at: number; synced: boolean } | null;
  /** ルーレットで「ここに行く」を押した店（今日の指令）。24時間、地図に載る */
  /** アカウントなし（この端末だけ）で追加した店。サーバには送らない */
  localVenues: { id: string; n: string; g: string; lat: number; lng: number }[];
  mission: { id: string; n: string; g: string; lat: number; lng: number; at: number; sample?: boolean } | null;
  pt: number;
  trust: number;
  visited: string[]; // 訪問済みの shop.id
  posts: Post[];
  ledger: Ledger[];
  palette: Record<string, boolean>;
  spins: number;
  spinDay: string;
};

const KEY = 'imakuite_ramen_v1'; // 同じドメインの旧アプリ（imakuite_v1）と保存が混ざらないように分ける

function makeId() {
  const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += a.charAt(Math.floor(Math.random() * a.length));
    if (i === 3) s += '-';
  }
  return 'IKI-' + s;
}
export const today = () => new Date().toISOString().slice(0, 10);

export function freshState(): State {
  return {
    uid: makeId(),
    onboarded: false,
    account: null,
    profile: { nickname: '', nationality: '日本', gender: '', age: '', allergies: '', favorites: [], rich: null, thick: '', ntype: '', toppings: [] },
    terms: null,
    localVenues: [],
    mission: null,
    pt: 0,
    trust: 50,
    visited: [],
    posts: [],
    ledger: [],
    palette: { ...DEFAULT_PALETTE },
    spins: 0,
    spinDay: today(),
  };
}

export function rankIndexOf(pt: number) {
  let r = 0;
  RANKS.forEach((x, i) => { if (pt >= x.at) r = i; });
  return r;
}

export function rankOf(pt: number) {
  let r = RANKS[0];
  for (const x of RANKS) if (pt >= x.at) r = x;
  return r;
}

type Ctx = {
  S: State;
  ready: boolean;
  /** Supabase にログイン（匿名を含む）しているか */
  signedIn: boolean;
  update: (fn: (s: State) => State) => void;
  addPoints: (n: number, reason: string) => void;
  addTrust: (n: number) => void;
  reset: () => void;
  toast: string;
  showToast: (m: string) => void;
};
const Store = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(Store);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [S, setS] = useState<State>(freshState);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY).catch(() => null), supabase.auth.getSession().catch(() => null)])
      .then(([raw, sess]) => {
        if (raw) {
          const loaded = JSON.parse(raw) as State;
          const base = freshState();
          const account = loaded.account ? { ...loaded.account, passkey: loaded.account.passkey ?? false } : null;
          // 旧版（架空の試作店 1〜8 の数値ID）で保存されたデータを、shop.id(uuid)に直す
          const fix = (v: unknown) => (typeof v === 'number' ? shopUuid(v) : (v as string));
          const migrated = {
            ...loaded,
            visited: (loaded.visited ?? []).map(fix),
            posts: (loaded.posts ?? []).map((p) => ({ ...p, venue: fix(p.venue) })),
          };
          // 後から増えた入力項目（具材・トッピング・付け合わせ）は、古い保存データでも最初から使えるようにする
          const addedKeys = ['photo', 'price', 'amount', 'note', 'soup', 'rec', 'toppings', 'base', 'sides', 'removed', 'disliked'].filter((k) => loaded.palette?.[k] === undefined);
          const palette = { ...base.palette, ...(loaded.palette ?? {}), ...Object.fromEntries(addedKeys.map((k) => [k, true])) };
          setS({ ...base, ...migrated, palette, account, profile: { ...base.profile, ...loaded.profile, } });
        }
        setSignedIn(!!sess?.data?.session);
      })
      .catch(() => {})
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(S)).catch(() => {});
  }, [S, ready]);

  const update = useCallback((fn: (s: State) => State) => setS((s) => fn(s)), []);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 3200);
  }, []);
  const addPoints = useCallback((n: number, reason: string) => {
    setS((s) => ({
      ...s,
      pt: Math.max(0, s.pt + n),
      ledger: [{ n, r: reason, t: Date.now() }, ...s.ledger].slice(0, 60),
    }));
  }, []);
  const addTrust = useCallback((n: number) => {
    setS((s) => ({ ...s, trust: Math.max(0, Math.min(100, s.trust + n)) }));
  }, []);
  const reset = useCallback(() => {
    setS(freshState());
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  return (
    <Store.Provider value={{ S, ready, signedIn, update, addPoints, addTrust, reset, toast, showToast }}>
      {children}
    </Store.Provider>
  );
}
