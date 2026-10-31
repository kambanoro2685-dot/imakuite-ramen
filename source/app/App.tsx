import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchMe, recordTerms } from './src/account';
import { supabase } from './src/supabase';
import { SYNC_DONE } from './src/sync';
import { useSyncer } from './src/useSyncer';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DraftProvider } from './src/draft';
import Home from './src/Home';
import { Go, Screen } from './src/nav';
import Onboarding from './src/Onboarding';
import TermsGate from './src/TermsGate';
import { TERMS_VERSION } from './src/terms';
import PostScreen, { Palette } from './src/Post';
import Roulette from './src/Roulette';
import { Search, VenueDetail } from './src/Search';
import My from './src/My';
import Help from './src/Help';
import MapScreen from './src/MapScreen';
import Oshi from './src/Oshi';
import Report from './src/Report';
import { VenueProvider } from './src/venues';
import { rankIndexOf, rankOf, StoreProvider, useStore } from './src/store';
import { RANKS } from './src/data';
import { C, font, web } from './src/theme';

const TABS: { k: Screen; icon: string; label: string }[] = [
  { k: 'home', icon: '🏠', label: 'ホーム' },
  { k: 'post', icon: '✍️', label: '投稿' },
  { k: 'palette', icon: '🗂️', label: '入力項目' },
  { k: 'search', icon: '🔍', label: 'さがす' },
  { k: 'map', icon: '🗺️', label: '地図' },
  { k: 'roulette', icon: '🎯', label: 'ルーレット' },
  { k: 'oshi', icon: '💗', label: '推し' },
  { k: 'my', icon: '🎖️', label: 'マイページ' },
  { k: 'help', icon: '📖', label: 'ヘルプ' },
  { k: 'report', icon: '🐞', label: '不具合報告' },
];

// Web: 手書き・明朝・タイプライター風のフォントを読み込み、data-font で切り替える
function useBinderFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap';
    document.head.appendChild(link);
    const st = document.createElement('style');
    st.textContent = `
      html, body { background: ${C.desk}; }
      #root div[dir=auto], #root input, #root textarea { font-family: 'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif; }
      #root [data-font=head] { font-family: 'Shippori Mincho B1','Hiragino Mincho ProN','Yu Mincho',serif; }
      #root [data-font=mono] { font-family: 'IBM Plex Mono','Courier New',monospace; }
    `;
    document.head.appendChild(st);
    return () => { link.remove(); st.remove(); };
  }, []);
}

function Shell() {
  useBinderFonts();
  const { S, ready, toast, signedIn, update, showToast } = useStore();
  const syncer = useSyncer();
  // 階級が上がったら知らせる（入力項目が増える）
  const prevRank = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const idx = rankIndexOf(S.pt);
    if (prevRank.current !== null && idx > prevRank.current) {
      showToast(`🎖️ 「${RANKS[idx].n}」に昇格しました！入力項目が増えました。`);
    }
    prevRank.current = idx;
  }, [ready, S.pt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scr, setScr] = useState<Screen>('home');

  // アプリが前面に戻ったときだけトークンを自動更新する（Supabase の推奨）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);

  // アカウントがあるのにログアウト状態（セッション切れ）になったら知らせる
  useEffect(() => {
    if (ready && S.account && !signedIn) showToast('ログインの有効期限が切れました。パスキーで再ログインしてください。');
  }, [ready, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // 起動時・復帰時: 未送信の投稿を順に再送し、サーバのポイントを反映する
  useEffect(() => {
    if (!ready || !signedIn || !S.account) return;
    let cancelled = false;
    (async () => {
      for (const p of S.posts.filter((x) => x.sync && x.sync.step < SYNC_DONE).reverse()) {
        if (cancelled) return;
        await syncer(p);
      }
      try {
        const me = await fetchMe();
        if (me && !cancelled) update((s) => ({ ...s, pt: me.ikp, trust: Math.round(me.trust_score / 10) }));
      } catch { /* オフライン時は端末の値のまま */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signedIn]);
  const [venueId, setVenueId] = useState('');
  // 規約に（現行の版で）同意していなければ、同意するまで先へ進めない
  const needTerms = ready && S.onboarded && S.terms?.version !== TERMS_VERSION;

  // 同意の記録がサーバに届いていなければ、接続できたときに送る
  useEffect(() => {
    if (!ready || !signedIn || !S.account || !S.terms || S.terms.synced || S.terms.version !== TERMS_VERSION) return;
    recordTerms(S.terms.version)
      .then(() => update((s) => (s.terms ? { ...s, terms: { ...s.terms, synced: true } } : s)))
      .catch(() => {});
  }, [ready, signedIn, S.account, S.terms]); // eslint-disable-line react-hooks/exhaustive-deps
  const [prev, setPrev] = useState<Screen>('home');
  const go: Go = (to, id) => {
    if (id !== undefined) setVenueId(id);
    if (to !== 'report') setPrev(to); else if (scr !== 'report') setPrev(scr);
    setScr(to);
  };
  const [tabsW, setTabsW] = useState(0);
  // 幅が足りないときは2段に折り返して、全部のタブを画面内に収める
  const perRow = tabsW >= 640 ? TABS.length : Math.ceil(TABS.length / 2);
  const tabRows: { t: (typeof TABS)[number]; i: number }[][] = [];
  TABS.forEach((t, i) => {
    const r = Math.floor(i / perRow);
    (tabRows[r] = tabRows[r] ?? []).push({ t, i });
  });
  const { width } = useWindowDimensions();
  const wide = width >= 600;
  const tab = scr === 'venue' ? 'search' : scr;

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.indigo} /></View>;
  }

  const ruled = web({
    backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, ' + C.rule + ' 27px, ' + C.rule + ' 28px)',
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.desk, alignItems: 'center', justifyContent: 'center', padding: wide ? 16 : 0 }}>
      {/* 表紙 */}
      <View
        style={[
          { flex: 1, width: '100%', maxWidth: 560, backgroundColor: C.cover, paddingLeft: 30, paddingRight: 8, paddingTop: 8, paddingBottom: 10,
            borderRadius: wide ? 12 : 0, borderWidth: wide ? 2 : 0, borderColor: C.coverEdge },
          web({ boxShadow: '0 12px 32px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.08)' }),
        ]}
      >
        {/* インデックス見出し（色分け・上側） */}
        {S.onboarded && !needTerms ? (
          <View onLayout={(e) => setTabsW(e.nativeEvent.layout.width)} style={{ gap: 2, paddingHorizontal: 4 }}>
            {tabRows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
                {row.map(({ t, i }) => {
                  const on = tab === t.k;
                  return (
                    <Pressable
                      key={t.k}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      onPress={() => go(t.k)}
                      style={{
                        flex: 1, alignItems: 'center', gap: 1, paddingTop: on ? 6 : 3, paddingBottom: on ? 5 : 2, marginBottom: -1,
                        backgroundColor: C.tabs[i], borderTopLeftRadius: 9, borderTopRightRadius: 9,
                        borderWidth: 1.5, borderBottomWidth: 0, borderColor: 'rgba(60,45,20,.45)', opacity: on ? 1 : 0.82,
                      }}
                    >
                      <Text style={{ fontSize: on ? 18 : 15 }}>{t.icon}</Text>
                      <Text numberOfLines={1} {...font('head')} style={{ fontSize: perRow >= TABS.length ? 10 : 10.5, color: C.ink, fontWeight: on ? '800' : '500' }}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {/* 紙 */}
        <SafeAreaView style={[{ flex: 1, backgroundColor: C.ground, borderRadius: 3, overflow: 'hidden', paddingLeft: 12 }, ruled]}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1.5, backgroundColor: C.margin }} />
          {needTerms ? (
            <TermsGate />
          ) : S.onboarded ? (
            <>
              {/* ファイル見出しのラベル */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: C.line }}>
                <Text {...font('mono')} style={{ color: C.ink, fontWeight: '700', fontSize: 12 }}>調査官ファイル № {S.uid}</Text>
                <View style={{ borderWidth: 2, borderColor: C.crit, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: '-3deg' }] }}>
                  <Text {...font('mono')} style={{ color: C.crit, fontWeight: '800', fontSize: 11 }}>{rankOf(S.pt).n} · {S.pt.toLocaleString()}pt</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                {scr === 'home' && <Home go={go} />}
                {scr === 'post' && <PostScreen go={go} />}
                {scr === 'palette' && <Palette go={go} />}
                {scr === 'search' && <Search go={go} />}
                {scr === 'venue' && <VenueDetail id={venueId} go={go} />}
                {scr === 'roulette' && <Roulette go={go} />}
                {scr === 'oshi' && <Oshi go={go} />}
                {scr === 'my' && <My />}
                {scr === 'map' && <MapScreen go={go} />}
                {scr === 'help' && <Help go={go} />}
                {scr === 'report' && <Report go={go} from={prev} />}
              </View>
            </>
          ) : (
            <Onboarding />
          )}
          {toast ? (
            <View
              pointerEvents="none"
              style={[{ position: 'absolute', left: 16, right: 12, bottom: 12, backgroundColor: '#FFF1A6', borderWidth: 1, borderColor: '#D9C25A', padding: 12, transform: [{ rotate: '0.6deg' }] },
                web({ boxShadow: '2px 4px 8px rgba(60,45,20,.35)' })]}
            >
              <Text style={{ color: C.ink, fontSize: 13, lineHeight: 19 }}>{toast}</Text>
            </View>
          ) : null}
        </SafeAreaView>

        {/* 金属リング */}
        {[0.14, 0.5, 0.84].map((p) => (
          <View
            key={p}
            pointerEvents="none"
            style={[{ position: 'absolute', left: 3, top: `${p * 100}%`, width: 50, height: 17, borderRadius: 9, backgroundColor: '#D6DBE2', borderWidth: 2, borderColor: '#8A919C' },
              web({ boxShadow: '1px 3px 4px rgba(0,0,0,.4), inset 0 2px 2px rgba(255,255,255,.8)' })]}
          />
        ))}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <DraftProvider>
        <VenueProvider>
          <Shell />
        </VenueProvider>
      </DraftProvider>
    </StoreProvider>
  );
}
