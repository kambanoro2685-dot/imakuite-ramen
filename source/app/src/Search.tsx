import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useDraft } from './draft';
import { GENRES } from './data';
import { googleMapsUrl, googleRouteUrl, openUrl } from './maps';
import MapView from './MapView';
import { Go } from './nav';
import { matchOf } from './match';
import { useStore } from './store';
import { C, mono } from './theme';
import { visitedPins, pinLabel } from './pins';
import ShopReviews from './Reviews';
import { Venue, useVenues, walkMin } from './venues';
import { Btn, Card, Chip, Chips, Head, Input, Lbl, Muted, s } from './ui';

const SORTS = ['おすすめ順', '相性順', '近い順', '未訪問だけ', '推しの店だけ'] as const;
type Sort = (typeof SORTS)[number];

function Tag({ t, kind }: { t: string; kind?: 'new' | 'cnt' }) {
  const bg = kind === 'new' ? C.amberSoft : kind === 'cnt' ? C.goodSoft : C.surface2;
  const fg = kind === 'new' ? C.amber : kind === 'cnt' ? C.good : C.ink2;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11.5, color: fg, fontWeight: '600' }}>{t}</Text>
    </View>
  );
}

const RANK_SHORT = ['見習い', '三等', '二等', '一等', '主任', '特別監察官'];

/** この店を調査した人の階級の内訳（3件以上のときだけ。個人は特定できない） */
export function RankMix({ ranks, big }: { ranks: number[] | null; big?: boolean }) {
  if (!ranks) return null;
  const items = ranks.map((n, i) => ({ n, i })).filter((x) => x.n > 0).reverse();
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: big ? 12.5 : 11.5, color: C.ink3, fontWeight: '700' }}>調査した人の階級</Text>
      {items.map((x) => (
        <View key={x.i} style={{ backgroundColor: x.i >= 3 ? C.amberSoft : C.surface2, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ fontSize: big ? 12.5 : 11.5, color: x.i >= 3 ? C.amber : C.ink2, fontWeight: '700' }}>{RANK_SHORT[x.i]} {x.n}人</Text>
        </View>
      ))}
    </View>
  );
}

const matchTag = (v: Venue, p: Parameters<typeof matchOf>[1]) => {
  const m = matchOf(v, p);
  if (m.pct == null) return null;
  return <Tag t={`相性 ${m.pct}%${m.basis === 'name' ? '（店名から推定）' : ''}`} kind={m.pct >= 70 ? 'cnt' : undefined} />;
};

export const Credit = () => <Muted>地図・店舗データ: © OpenStreetMap contributors。情報が古い場合があります（閉店・移転など）。</Muted>;

export function Search({ go }: { go: Go }) {
  const { S } = useStore();
  const { venues, center, loading, error, locating, useMyLocation, resetCenter, byId, oshiOf } = useVenues();
  const [g, setG] = useState('すべて');
  const [sort, setSort] = useState<Sort>('おすすめ順');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);

  const fav = (v: Venue) => matchOf(v, S.profile).pct ?? -1;
  const mine = (id: string) => S.posts.filter((p) => p.venue === id).length;

  const genres = useMemo(() => {
    const have = new Set(venues.map((v) => v.g));
    return ['すべて', ...GENRES.filter((x) => have.has(x)), ...(have.has('その他') ? ['その他'] : [])];
  }, [venues]);

  const list = useMemo(() => {
    const nq = q.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    let l = venues.filter((v) => (g === 'すべて' || v.g === g) && (!nq || v.n.normalize('NFKC').toLowerCase().includes(nq)));
    if (sort === '未訪問だけ') l = l.filter((v) => !S.visited.includes(v.id));
    if (sort === '推しの店だけ') l = l.filter((v) => oshiOf[v.id]);
    const osh = (v: Venue) => (oshiOf[v.id] ? 1 : 0);
    if (sort === '相性順') return [...l].sort((a, b) => fav(b) - fav(a) || a.dist - b.dist);
    return [...l].sort((a, b) => (sort === '近い順' || sort === '未訪問だけ' || sort === '推しの店だけ' ? a.dist - b.dist : osh(b) - osh(a) || fav(b) - fav(a) || a.dist - b.dist));
  }, [venues, g, q, sort, S.visited, S.profile.favorites, oshiOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = list.slice(0, limit);
  const pins = useMemo(() => visitedPins(S.posts, byId), [S.posts, venues]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = center.source === 'gps' ? '現在地' : '岡山駅';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <Head title="店をさがす" sub={loading ? '読み込み中…' : `${list.length} 件`} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Muted>基準: {base}（半径3km）</Muted>
        <Btn small kind="ghost" label={locating ? '取得中…' : center.source === 'gps' ? '📍 現在地を更新' : '📍 現在地にする'} onPress={useMyLocation} />
      </View>
      {error ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{error}</Text> : null}
      {!loading && !error && venues.length === 0 ? (
        <Card>
          <Text style={{ color: C.ink, fontWeight: '800' }}>この周辺には、まだ店舗データがありません。</Text>
          <Muted>対応エリアは、いまは岡山市北区・中心部（岡山駅周辺）です。</Muted>
          <Btn small kind="ghost" label="岡山駅周辺にもどす" onPress={resetCenter} />
        </Card>
      ) : null}

      <Btn small kind="ghost" label={`🗺️ 地図で見る（調査 ${pins.length}か所）`} onPress={() => go('map')} style={{ alignSelf: 'flex-start' }} />

      <Input value={q} onChangeText={(t) => { setQ(t); setLimit(30); }} placeholder="店名で絞り込む（例：らーめん）" />
      <Chips>
        {genres.map((x) => (
          <Chip key={x} label={x} on={g === x} onPress={() => { setG(x); setLimit(30); }} />
        ))}
      </Chips>
      <Chips>
        {SORTS.map((x) => (
          <Chip key={x} label={x} on={sort === x} onPress={() => setSort(x)} />
        ))}
      </Chips>

      {shown.map((v) => (
        <Pressable key={v.id} onPress={() => go('venue', v.id)} style={[s.card, { gap: 6 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 }}>{v.n}</Text>
            <Text style={{ fontFamily: mono, fontSize: 12, color: C.ink3 }}>{base}から 徒歩{walkMin(v.dist)}分</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Tag t={v.g} />
            <Tag t={v.reviews ? `${v.reviews + mine(v.id)}人が評価` : '調査待ち'} kind={v.reviews ? 'cnt' : undefined} />
            {oshiOf[v.id] ? <Tag t={`💗 推し: ${oshiOf[v.id].slice(0, 2).join('・')}${oshiOf[v.id].length > 2 ? ` ほか${oshiOf[v.id].length - 2}人` : ''}`} kind="new" /> : null}
            {matchTag(v, S.profile)}
            {!S.visited.includes(v.id) ? <Tag t="未訪問 +30pt" kind="new" /> : null}
          </View>
          <RankMix ranks={v.ranks} />
        </Pressable>
      ))}
      {list.length > shown.length ? <Btn kind="ghost" label={`さらに表示（残り${list.length - shown.length}件）`} onPress={() => setLimit(limit + 30)} /> : null}
      <Credit />
    </ScrollView>
  );
}

export function VenueDetail({ id, go }: { id: string; go: Go }) {
  const { S } = useStore();
  const { setD } = useDraft();
  const { byId, center, oshiOf } = useVenues();
  const post0 = S.posts.find((p) => p.venue === id && p.lat != null);
  const v: Venue | undefined = byId(id) ?? (post0 ? { id, n: post0.venueName, g: post0.genre ?? 'その他', lat: post0.lat!, lng: post0.lng!, url: null, reviews: null, ranks: null, soup: null, rich: null, thick: null, ntype: null, toppings: null, dist: 0 } : undefined);
  if (!v) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Btn small kind="ghost" label="← 一覧にもどる" onPress={() => go('search')} style={{ alignSelf: 'flex-start' }} />
        <Muted>店の情報が見つかりません。一覧から選び直してください。</Muted>
      </ScrollView>
    );
  }
  const mine = S.posts.filter((p) => p.venue === id);
  const base = center.source === 'gps' ? '現在地' : '岡山駅';

  const post = () => {
    setD((x) => ({ ...x, venue: id }));
    go('post');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }}>
      <Btn small kind="ghost" label="← 一覧にもどる" onPress={() => go('search')} style={{ alignSelf: 'flex-start' }} />
      <Head title={v.n} sub={v.g} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Tag t={v.g} />
        <Tag t={`${base}から 徒歩${walkMin(v.dist)}分（約${v.dist.toLocaleString()}m）`} />
        <Tag t={v.reviews ? `${v.reviews + mine.length}人が評価` : '調査待ち'} kind={v.reviews ? 'cnt' : undefined} />
        {!S.visited.includes(v.id) ? <Tag t="未訪問 +30pt" kind="new" /> : null}
        {matchTag(v, S.profile)}
        {v.soup ? <Tag t={`口コミで多いスープ: ${v.soup}`} /> : null}
        {v.rich != null ? <Tag t={`濃さ ${v.rich}/4`} /> : null}
        {v.toppings?.length ? <Tag t={`人気のトッピング: ${v.toppings.join('・')}`} /> : null}
        {v.thick || v.ntype ? <Tag t={`麺: ${[v.thick, v.ntype].filter(Boolean).join('・')}`} /> : null}
        {oshiOf[v.id] ? <Tag t={`💗 推しが調査: ${oshiOf[v.id].join('・')}`} kind="new" /> : null}
      </View>

      <MapView
        height={240}
        center={{ lat: v.lat, lng: v.lng }}
        markers={[
          { id: v.id, lat: v.lat, lng: v.lng, kind: 'win', label: v.n },
        ]}
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn small kind="ghost" label="🗺️ Googleマップで開く" onPress={() => openUrl(googleMapsUrl(v))} style={{ flex: 1 }} />
        <Btn small kind="ghost" label="🧭 徒歩ルート" onPress={() => openUrl(googleRouteUrl(v))} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {v.url ? <Btn small kind="ghost" label="🌐 公式サイト" onPress={() => openUrl(v.url!)} style={{ flex: 1 }} /> : null}
        <Btn small label="ここで投稿する" onPress={post} style={{ flex: 1 }} />
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>調査状況</Lbl>
        <Card>
          <Text style={{ color: C.ink, fontWeight: '800' }}>
            {v.reviews ? `${v.reviews + mine.length}人の調査官が評価しています` : 'まだ調査待ちです（3件集まると評価が表示されます）'}
          </Text>
          <RankMix ranks={v.ranks} big />
        </Card>
        {mine.map((p) => (
          <Card key={p.id}>
            <Text style={{ fontWeight: '800', color: C.ink }}>あなたの調査{p.sample ? '（見本）' : ''}　<Text style={{ color: C.amber }}>満足度 {p.sat}</Text></Text>
            <Text style={{ color: C.ink2 }}>{p.dish}{p.vals.price ? ` ／ ¥${Number(p.vals.price).toLocaleString()}` : ''}</Text>
            {p.photos?.length ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {p.photos.map((ph) => (
                    <Image key={ph.id} source={{ uri: ph.url }} style={{ width: 64, height: 64, borderRadius: 2, borderWidth: 3, borderColor: '#FFFFFF' }} />
                  ))}
                </View>
              ) : null}
          </Card>
        ))}
      </View>
      <ShopReviews shopId={v.id} />
      <Credit />
    </ScrollView>
  );
}
