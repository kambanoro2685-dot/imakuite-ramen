import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { googleMapsUrl, googleRouteUrl, openUrl } from './maps';
import MapView from './MapView';
import { Go } from './nav';
import { pinLabel, visitedPins } from './pins';
import { Credit } from './Search';
import { useSamples } from './sample';
import { useStore } from './store';
import { C, mono } from './theme';
import { useVenues, walkMin } from './venues';
import { Btn, Card, Chip, Chips, Head, Lbl, Muted } from './ui';

const DAY = 24 * 3600e3;

/**
 * 地図タブ。最初は空で、調査（投稿）した店が1件ずつ増えていく。
 * ルーレットで「ここに行く」を押した店は、今日の指令（🎯）として24時間のあいだ載る。
 */
export default function MapScreen({ go }: { go: Go }) {
  const { S } = useStore();
  const { venues, center, loading, error, locating, useMyLocation, byId } = useVenues();
  const [near, setNear] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const samples = useSamples();

  const pins = useMemo(() => visitedPins(S.posts, byId), [S.posts, venues]); // eslint-disable-line react-hooks/exhaustive-deps
  const mission = S.mission && Date.now() - S.mission.at < DAY ? S.mission : null;
  const base = center.source === 'gps' ? '現在地' : '岡山駅';

  const markers = [
    ...(near
      ? venues
          .filter((v) => !pins.some((p) => p.id === v.id) && v.id !== mission?.id)
          .slice(0, 200)
          .map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, kind: 'dim' as const, label: v.n }))
      : []),
    ...(center.source === 'gps' ? [{ id: 'me', lat: center.lat, lng: center.lng, kind: 'me' as const, label: '現在地' }] : []),
    ...pins.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, kind: 'normal' as const, label: pinLabel(p) })),
    ...(mission ? [{ id: mission.id, lat: mission.lat, lng: mission.lng, kind: 'win' as const, label: `指令: ${mission.n}` }] : []),
  ];

  // 選んだピンの情報（調査済み → 今日の指令 → 周辺の店 の順で探す）
  const selPin = sel ? pins.find((p) => p.id === sel) : undefined;
  const selVenue = sel ? byId(sel) : undefined;
  const info =
    selPin ? { id: selPin.id, n: selPin.n, g: selPin.g, lat: selPin.lat, lng: selPin.lng, note: `${selPin.count}回調査 ／ 最後の満足度 ${selPin.lastSat}` }
    : sel && mission && sel === mission.id ? { id: mission.id, n: mission.n, g: mission.g, lat: mission.lat, lng: mission.lng, note: '今日の指令（ルーレットで決めた店）' }
    : selVenue ? { id: selVenue.id, n: selVenue.n, g: selVenue.g, lat: selVenue.lat, lng: selVenue.lng, note: `${base}から 徒歩${walkMin(selVenue.dist)}分 ／ 未調査` }
    : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}>
      <Head title="地図" sub={`調査 ${pins.length}か所`} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Muted>基準: {base}</Muted>
        <Btn small kind="ghost" label={locating ? '取得中…' : center.source === 'gps' ? '📍 現在地を更新' : '📍 現在地にする'} onPress={useMyLocation} />
      </View>
      {error ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{error}</Text> : null}

      {mission ? (
        <Card>
          <Lbl>🎯 今日の指令</Lbl>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{mission.n}</Text>
          <Muted>{mission.g}　／　あと約{Math.max(1, Math.round((mission.at + DAY - Date.now()) / 3600e3))}時間。調査を提出すると、地図に調査済みのピンとして残ります。</Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn small kind="ghost" label="🗺️ Googleマップで開く" onPress={() => openUrl(googleMapsUrl(mission))} style={{ flex: 1 }} />
            <Btn small kind="ghost" label="🧭 徒歩ルート" onPress={() => openUrl(googleRouteUrl(mission))} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <MapView
        height={400}
        center={pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : mission ? { lat: mission.lat, lng: mission.lng } : center}
        markers={markers}
        onSelect={(id) => setSel(id)}
      />

      <Chips>
        <Chip label={near ? '✓ 周辺の店も表示中' : '周辺の店も表示する'} on={near} onPress={() => setNear(!near)} />
      </Chips>

      {info ? (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{info.n}</Text>
          <Muted>{info.g}　／　{info.note}</Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn small label="店の詳細" onPress={() => go('venue', info.id)} style={{ flex: 1 }} />
            <Btn small kind="ghost" label="Googleマップ" onPress={() => openUrl(googleMapsUrl(info))} style={{ flex: 1 }} />
            <Btn small kind="ghost" label="ルート" onPress={() => openUrl(googleRouteUrl(info))} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {pins.length === 0 ? (
        <Card>
          <Text style={{ color: C.ink, fontWeight: '800' }}>📍 まだ何も調査していません</Text>
          <Muted>
            調査報告を提出すると、その店がこの地図に追加されます。あなたが歩いた場所だけが、少しずつ地図に増えていきます。
            {loading ? '' : '「周辺の店も表示する」で、近くの店を薄いピンで確認できます。'}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn small label="調査を始める" onPress={() => go('post')} />
            <Btn small kind="ghost" label="ルーレットで決める" onPress={() => go('roulette')} />
            <Btn small kind="ghost" label="🧪 見本を入れてみる" onPress={samples.add} />
          </View>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <Lbl>調査した場所（新しい順）</Lbl>
          {samples.has ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Muted>見本が入っています（この端末だけ）。</Muted>
              <Btn small kind="ghost" label="🧹 見本を消す" onPress={samples.clear} />
            </View>
          ) : null}
          {pins.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontWeight: '800', color: C.ink, flexShrink: 1 }}>{p.n}</Text>
                <Text style={{ fontFamily: mono, fontSize: 11.5, color: C.ink3 }}>{new Date(p.last).toLocaleDateString('ja-JP')}</Text>
              </View>
              <Muted>{p.g}　／　{p.count}回調査　／　満足度 {p.lastSat}</Muted>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn small kind="ghost" label="地図で見る" onPress={() => setSel(p.id)} style={{ flex: 1 }} />
                <Btn small kind="ghost" label="店の詳細" onPress={() => go('venue', p.id)} style={{ flex: 1 }} />
              </View>
            </Card>
          ))}
        </View>
      )}
      <Credit />
    </ScrollView>
  );
}
