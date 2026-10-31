import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDraft } from './draft';
import { googleMapsUrl, googleRouteUrl, openUrl } from './maps';
import MapView from './MapView';
import { Go } from './nav';
import { visitedPins, pinLabel } from './pins';
import { Credit, RankMix } from './Search';
import { today, useStore } from './store';
import { C, mono } from './theme';
import { Venue, isRamenShop, useVenues, walkMin, walkText } from './venues';
import ShopReviews, { ReviewFieldPicker } from './Reviews';
import { GENRES } from './data';
import { matchOf } from './match';
import { Btn, Chip, Chips, Head, Lbl, Muted } from './ui';

const WEIGHTS = ['好みを優先', '推しを優先', '未訪問を優先', '近さを優先', '完全ランダム'] as const;
type W = (typeof WEIGHTS)[number];
const RADIUS = [500, 1000, 1500, 3000];
const CELLS = 8; // ルーレットに載せる候補の数

export default function Roulette({ go }: { go: Go }) {
  const { S, update, showToast } = useStore();
  const { setD } = useDraft();
  const { venues, center, loading, error, byId, oshiOf } = useVenues();
  const [g, setG] = useState('すべて');
  const [w, setW] = useState<W>('好みを優先');
  const [radius, setRadius] = useState(1000);
  const [deal, setDeal] = useState(0); // 候補を引き直すたびに増える
  const [on, setOn] = useState(-1);
  const [win, setWin] = useState<Venue | null>(null);
  const [rid, setRid] = useState('');
  const spinning = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const spinsToday = S.spinDay === today() ? S.spins : 0;
  const unlimited = S.pt >= 300;
  const base = center.source === 'gps' ? '現在地' : '岡山駅';

  const weight = (v: Venue) => {
    if (w === '完全ランダム') return 1;
    if (w === '推しを優先') return (oshiOf[v.id] ? 6 : 1) * (S.visited.includes(v.id) ? 1 : 1.5);
    if (w === '近さを優先') return 1 / (1 + v.dist / 200);
    if (w === '未訪問を優先') return S.visited.includes(v.id) ? 1 : 4;
    return (1 + (matchOf(v, S.profile).pct ?? 25) / 20) * (S.visited.includes(v.id) ? 1 : 1.5); // 相性0%→1、100%→6
  };

  // 系統の選択肢: いま候補にあるラーメンの店の系統だけ（系統が分からない店は「その他」）
  const genreOpts = useMemo(() => {
    const have = new Set(venues.filter(isRamenShop).map((v) => v.g));
    return ['すべて', ...GENRES.filter((x) => have.has(x)), ...(have.has('その他') ? ['その他'] : [])];
  }, [venues]);
  const pool = useMemo(
    () => venues.filter((v) => isRamenShop(v) && v.dist <= radius && (g === 'すべて' || v.g === g)),
    [venues, radius, g],
  );

  // 条件に合う店から、重みつきで CELLS 件を選んでホイールに載せる（引き直しで入れ替わる）
  const cells = useMemo(() => {
    const left = [...pool];
    const out: Venue[] = [];
    while (out.length < CELLS && left.length) {
      const total = left.reduce((a, v) => a + weight(v), 0);
      let r = Math.random() * total;
      let i = left.length - 1;
      for (let k = 0; k < left.length; k++) { r -= weight(left[k]); if (r <= 0) { i = k; break; } }
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }, [pool, w, deal]); // eslint-disable-line react-hooks/exhaustive-deps

  // 条件や候補が変わったら、前回の結果は消す
  useEffect(() => { setWin(null); setOn(-1); }, [pool, deal, w]);

  const spin = () => {
    if (spinning.current || cells.length === 0) return;
    if (!unlimited && spinsToday >= 3) return showToast('今日のルーレットは3回まで。300ptで無制限になります。');
    const idx = Math.floor(Math.random() * cells.length);
    update((st) => ({ ...st, spinDay: today(), spins: (st.spinDay === today() ? st.spins : 0) + 1 }));
    setWin(null);
    spinning.current = true;
    const steps = cells.length * 3 + idx;
    let i = 0;
    let delay = 55;
    const step = () => {
      setOn(i % cells.length);
      i++;
      if (i <= steps) {
        if (i > steps - cells.length) delay += 26;
        timer.current = setTimeout(step, delay);
      } else {
        spinning.current = false;
        setWin(cells[idx]);
        setRid('R' + Date.now());
      }
    };
    step();
  };

  const goThere = () => {
    if (!win) return;
    setD((x) => ({ ...x, venue: win.id, rouletteId: rid }));
    update((st) => ({ ...st, mission: { id: win.id, n: win.n, g: win.g, lat: win.lat, lng: win.lng, at: Date.now() } }));
    showToast('ルーレット由来の投稿として記録します（+15pt）。');
    go('post');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }}>
      <Head title="ルーレット" sub={unlimited ? '無制限（ランク特典）' : `残り${Math.max(0, 3 - spinsToday)}回`} />
      <View style={{ gap: 7 }}>
        <Lbl>系統</Lbl>
        <Chips>{genreOpts.map((x) => <Chip key={x} label={x} on={g === x} onPress={() => setG(x)} />)}</Chips>
      </View>
      <View style={{ gap: 7 }}>
        <Lbl>{base}から</Lbl>
        <Chips>{RADIUS.map((r) => <Chip key={r} label={r >= 1000 ? `${r / 1000}km以内` : `${r}m以内`} on={radius === r} onPress={() => setRadius(r)} />)}</Chips>
      </View>
      <View style={{ gap: 7 }}>
        <Lbl>重みづけ</Lbl>
        <Chips>{WEIGHTS.map((x) => <Chip key={x} label={x} on={w === x} onPress={() => setW(x)} />)}</Chips>
      </View>

      {error ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{error}</Text> : null}
      {loading ? <Muted>店のデータを読み込み中…</Muted> : null}
      {!loading && cells.length === 0 ? (
        <Muted>条件に合う店がありません。系統や範囲を変えてください。</Muted>
      ) : (
        <Muted>条件に合う {pool.length} 件から、{cells.length} 件をルーレットに載せました。</Muted>
      )}
      <Muted>ルーレットには、ラーメンの店だけが載ります（自分で追加した店は、店名や口コミでラーメンと分かるものだけ）。</Muted>

      <View style={{ gap: 6 }}>
        {cells.map((v, i) => {
          const isWin = win?.id === v.id && on === i && !spinning.current;
          const lit = on === i;
          return (
            <View
              key={v.id}
              style={{
                borderWidth: 1.5, borderRadius: 3, padding: 10,
                borderColor: isWin ? C.crit : lit ? C.indigo : C.line,
                backgroundColor: isWin ? '#FFF3EC' : lit ? C.indigoSoft : C.surface,
              }}
            >
              <Text style={{ fontWeight: '700', color: C.ink }}>{v.n}</Text>
              <Text style={{ fontSize: 11.5, color: C.ink3 }}>{v.g} · {walkText(v.dist)}</Text>
            </View>
          );
        })}
      </View>
      <Btn small kind="ghost" label="🔄 候補を引き直す" onPress={() => setDeal((d) => d + 1)} style={{ alignSelf: 'flex-start' }} />

      <Btn kind="amber" label="🎯 回す" onPress={spin} />

      {win ? (
        <View style={{ backgroundColor: C.amberSoft, borderRadius: 3, borderWidth: 2, borderColor: C.crit, borderStyle: 'dashed', padding: 14, gap: 8 }}>
          <Text style={{ fontFamily: mono, fontSize: 11, color: C.crit, fontWeight: '800' }}>RESULT ／ 本日の指令</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{win.n}</Text>
          <Muted>{win.g} ／ {base}から {walkText(win.dist)}（約{win.dist.toLocaleString()}m）{S.visited.includes(win.id) ? '' : ' ／ 未訪問'}</Muted>
          {(() => { const m = matchOf(win, S.profile); return m.pct == null ? null : <Text style={{ color: C.good, fontWeight: '800' }}>あなたとの相性 {m.pct}%{m.basis === 'name' ? '（店名から推定）' : ''}</Text>; })()}
          {oshiOf[win.id] ? <Text style={{ color: C.crit, fontWeight: '800' }}>💗 推しの {oshiOf[win.id].join('・')} が調査した店</Text> : null}
          {win.ranks ? <RankMix ranks={win.ranks} big /> : <Muted>調査した人の階級: まだ3件未満のため表示できません（調査待ち）</Muted>}

          <MapView
            height={260}
            center={{ lat: win.lat, lng: win.lng }}
            markers={[
              ...visitedPins(S.posts, byId).filter((p) => p.id !== win.id).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, kind: 'dim' as const, label: pinLabel(p) })),
              ...(center.source === 'gps' ? [{ id: 'me', lat: center.lat, lng: center.lng, kind: 'me' as const, label: '現在地' }] : []),
              { id: win.id, lat: win.lat, lng: win.lng, kind: 'win' as const, label: win.n },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn small kind="ghost" label="🗺️ Googleマップで開く" onPress={() => openUrl(googleMapsUrl(win))} style={{ flex: 1 }} />
            <Btn small kind="ghost" label="🧭 徒歩ルート" onPress={() => openUrl(googleRouteUrl(win))} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" label="引き直す" onPress={spin} style={{ flex: 1 }} />
            <Btn label="ここに行く" onPress={goThere} style={{ flex: 1 }} />
          </View>
          <ReviewFieldPicker />
          <ShopReviews key={win.id} shopId={win.id} fields={S.reviewFields ?? []} />
          <Muted>「ここに行く」で +15pt。帰ってきたら事後評価で さらに +10pt。調査を提出すると、この店があなたの調査マップに追加されます。</Muted>
          <Credit />
        </View>
      ) : null}
    </ScrollView>
  );
}
