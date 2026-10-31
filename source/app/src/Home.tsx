import React, { useEffect, useState } from 'react';
import { matchOf } from './match';
import { ScrollView, Text, View } from 'react-native';
import { useDraft } from './draft';
import { useVenues, walkMin } from './venues';
import { Go } from './nav';
import { useStore } from './store';
import { C, mono } from './theme';
import { Btn, Card, Head, Lbl, Muted } from './ui';
import { stampNow } from './weather';

// 同時投稿人数は仮の数値（サーバ接続後に実測値へ置き換える）
function liveBase() {
  const h = new Date().getHours();
  return h >= 11 && h <= 13 ? 840 : h >= 18 && h <= 21 ? 1120 : 260;
}

export default function Home({ go }: { go: Go }) {
  const { S, showToast } = useStore();
  const { D, setD } = useDraft();
  const [live, setLive] = useState(liveBase() + 20);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setLive(liveBase() + Math.floor(Math.random() * 60)), 10000);
    return () => clearInterval(t);
  }, []);

  const d = new Date();
  const last = S.posts[0];
  const { venues, center, oshiOf } = useVenues();
  const pick =
    venues.find((v) => oshiOf[v.id] && !S.visited.includes(v.id)) ??
    [...venues].filter((v) => !S.visited.includes(v.id) && (matchOf(v, S.profile).pct ?? 0) > 0).sort((a, b) => (matchOf(b, S.profile).pct ?? 0) - (matchOf(a, S.profile).pct ?? 0) || a.dist - b.dist)[0];

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    const st = await stampNow();
    setD((x) => ({ ...x, stamp: st }));
    setBusy(false);
    showToast(
      st.real
        ? `入店を記録：現在地・時刻・${st.weather[0]} ${st.weather[1]}℃・${st.weather[2]}hPa を封入しました`
        : '入店を記録しました（位置情報が使えないため岡山駅周辺の天気で代用）',
    );
    go('post');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 30 }}>
      <Head title={`調査官 ${S.profile.nickname}`} sub={`${d.getMonth() + 1}月${d.getDate()}日`} />
      <Text style={{ color: C.amber, fontWeight: '700', fontSize: 13 }}>
        今日のあなたの投稿が、未来のあなたの「食べたい」を支えます。
      </Text>

      {S.account && !S.account.passkey ? (
        <Card>
          <Text style={{ color: C.crit, fontWeight: '800' }}>⚠️ パスキーが未設定です</Text>
          <Muted>このままだと、ログアウトや端末の変更でアカウントに戻れなくなります。</Muted>
          <Btn small label="マイページで設定する" onPress={() => go('my')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={statBox}>
          <Text style={statV}>{live.toLocaleString()} 人</Text>
          <Muted>今この時間に投稿中（仮の数値）</Muted>
        </View>
        <View style={statBox}>
          <Text style={statV}>{S.posts.length} 件</Text>
          <Muted>あなたの投稿</Muted>
        </View>
      </View>

      <Btn label={D.stamp ? '✅ 入店記録済み（投稿へ）' : busy ? '記録中…' : '🚪 入店を記録する'} onPress={D.stamp ? () => go('post') : enter} />
      <Muted>押した瞬間に、座標・時刻・天気・気温・気圧をまとめて封入します。位置情報はこの操作のときだけ使います。</Muted>

      {last ? (
        <Card>
          <Lbl>直近の調査記録</Lbl>
          <Text style={{ fontSize: 14, color: C.ink, lineHeight: 22 }}>
            <Text style={{ fontWeight: '800' }}>{last.venueName}</Text>{last.sample ? '（見本）' : ''} で <Text style={{ fontWeight: '800' }}>{last.dish}</Text>。満足度は {last.sat}。
          </Text>
        </Card>
      ) : null}

      {pick ? (
        <Card>
          <Lbl>あなたの好みに合う未訪問のラーメン店</Lbl>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{pick.n}</Text>
          {oshiOf[pick.id] ? <Muted>💗 推しの {oshiOf[pick.id].join('・')} が調査した店</Muted> : null}
          <Muted>相性 {matchOf(pick, S.profile).pct}% ／ {pick.g} ／ {center.source === 'gps' ? '現在地' : '岡山駅'}から徒歩{walkMin(pick.dist)}分 ／ 初訪問で +30pt</Muted>
          <Btn small kind="ghost" label="この店を見る" onPress={() => go('venue', pick.id)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      {S.mission && Date.now() - S.mission.at < 24 * 3600e3 ? (
        <Card>
          <Lbl>🎯 今日の指令</Lbl>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{S.mission.n}</Text>
          <Muted>ルーレットで決めた店です。調査を提出すると、地図に残ります。</Muted>
          <Btn small kind="ghost" label="🗺️ 地図で見る" onPress={() => go('map')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <Card flat>
        <Lbl>迷っているなら</Lbl>
        <Btn kind="amber" label="🎯 ルーレットで決める" onPress={() => go('roulette')} />
      </Card>

      <Text style={{ fontFamily: mono, fontSize: 11, color: C.ink3, textAlign: 'center' }}>今日からあなたも、ラーメンインスペクター。</Text>
    </ScrollView>
  );
}

const statBox = { flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 3, padding: 12, gap: 2 } as const;
const statV = { fontSize: 20, fontWeight: '800', color: C.indigo } as const;
