import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { friendly } from './account';
import { RANKS } from './data';
import { rankIndexOf, useStore } from './store';
import { supabase } from './supabase';
import { C, font, mono } from './theme';
import { Card, Chip, Chips, Lbl, Muted } from './ui';

type Masked = { masked: true; reason: 'rank' | 'input'; need_rank?: number };
const isMasked = (x: any): x is Masked => x && x.masked === true;

const VOL: Record<string, string> = { less: '少なめ', just_right: 'ちょうど', more: '多め', huge: '驚愕' };
const MOOD: Record<string, string> = { great: '絶好調', good: '上機嫌', normal: '普通', tired: '疲れ', bad: '不調' };
const G3 = ['良い', 'ふつう', '気になる'];
const QUIET = ['とても静か', '静か', 'ふつう', 'にぎやか', '騒がしい'];
const SERVICE = ['残念', 'いまいち', 'ふつう', '良い', 'とても良い'];
const CROWD = ['空いている', 'ふつう', 'やや混み', '満席', '行列'];
const PAY: Record<string, string> = { cash: '現金', ic: '交通系IC', credit: 'クレジット', qr: 'QR' };
const SMOKE: Record<string, string> = { no: '禁煙', yes: '喫煙可', separated: '分煙' };
const SEATS: Record<string, string> = { counter: 'カウンター', table: 'テーブル', tatami: '座敷', private_room: '個室' };

const nn = (x: any) => x !== null && x !== undefined;
const join = (xs: (string | null)[]) => xs.filter(Boolean).join('　') || '—';

/** 項目ごとの表示文字列（値が無ければ '—'） */
const FORMAT: Record<string, (v: any) => string> = {
  price: (v) => (nn(v.price_yen) ? `¥${Number(v.price_yen).toLocaleString()}` : '—'),
  volume: (v) => VOL[v.volume] ?? '—',
  note: (v) => v.comment || '—',
  rec: (v) => join([v.would_return === true ? 'また行く' : v.would_return === false ? '行かない' : null, v.would_recommend ? '人にすすめたい' : null]),
  party: (v) => (nn(v.party_size) ? `${v.party_size}人` : '—'),
  mood: (v) => MOOD[v.mood] ?? '—',
  condition: (v) => join([nn(v.hunger_before) ? `入店前の空腹 ${v.hunger_before}%` : null, nn(v.fullness_after) ? `食後の満腹 ${v.fullness_after}%` : null]),
  clean: (v) => join([['入口', v.entrance], ['席', v.seating], ['食器', v.tableware], ['お手洗い', v.restroom], ['厨房', v.kitchen]].map(([n, x]: any) => (nn(x) ? `${n}:${G3[x]}` : null))),
  quiet: (v) => (nn(v.quietness) ? QUIET[v.quietness] : '—'),
  wait: (v) => (nn(v.wait_min) ? `${v.wait_min}分` : '—'),
  taste: (v) => join([['甘', v.sweet], ['塩', v.salty], ['酸', v.sour], ['苦', v.bitter], ['うま', v.umami], ['辛', v.hot]].map(([n, x]: any) => (nn(x) ? `${n}${x}` : null))),
  service: (v) => join([nn(v.service) ? `接客:${SERVICE[v.service]}` : null, nn(v.serve_speed_min) ? `提供まで${v.serve_speed_min}分` : null]),
  quality: (v) => join([['香り', v.aroma], ['食感', v.texture], ['温度', v.temperature], ['盛り付け', v.presentation]].map(([n, x]: any) => (nn(x) ? `${n}:${G3[x]}` : null))),
  facility: (v) => join([
    nn(v.crowdedness) ? CROWD[v.crowdedness] : null,
    v.payment_methods ? String(v.payment_methods).split(',').map((p) => PAY[p] ?? p).join('・') : null,
    v.smoking ? SMOKE[v.smoking] : null,
    v.seat_types ? String(v.seat_types).split(',').map((p) => SEATS[p] ?? p).join('・') : null,
    v.accessibility ? 'バリアフリー' : null, v.kids_friendly ? '子連れ向き' : null, v.solo_friendly ? '一人向き' : null, v.multilingual_menu ? '多言語メニュー' : null,
  ]),
  noise: (v) => (nn(v.noise_db) ? `${v.noise_db}dB` : '—'),
};

const LABELS: [string, string][] = [
  ['price', '価格'], ['volume', '量'], ['note', '感想'], ['rec', 'おすすめ'], ['party', '人数'],
  ['mood', '気分'], ['condition', '体調'], ['clean', '清掃'], ['quiet', '静かさ'], ['wait', '待ち時間'],
  ['taste', '味'], ['service', '接客'], ['quality', '品質'], ['facility', '設備・支払い'], ['noise', '騒音'],
];

/** 黒塗り（伏せ字）。理由を小さく添える */
function Redacted({ m }: { m: Masked }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <View style={{ backgroundColor: C.ink, borderRadius: 1, paddingHorizontal: 8, paddingVertical: 1 }}>
        <Text style={{ color: C.ink, fontSize: 13 }}>██████</Text>
      </View>
      <Text style={{ fontSize: 10.5, color: C.ink3, flexShrink: 1 }}>
        {m.reason === 'rank' ? `🔒 ${RANKS[m.need_rank ?? 0].n}から` : '✏️ 入力すると見える'}
      </Text>
    </View>
  );
}

function Row({ label, node, kind }: { label: string; node: any; kind: string }) {
  if (isMasked(node)) {
    return (
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={{ width: 70, fontSize: 12, color: C.ink3 }}>{label}</Text>
        <Redacted m={node} />
      </View>
    );
  }
  const txt = kind === 'corrections'
    ? (Array.isArray(node) && node.length ? node.map((c: any) => `${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`).join(' ／ ') : '訂正なし')
    : kind === 'photos' ? '' : FORMAT[kind]?.(node) ?? '—';
  if (kind === 'photos') return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 70, fontSize: 12, color: C.ink3 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: C.ink, lineHeight: 19 }}>{txt}</Text>
    </View>
  );
}

const SORTS: [string, string][] = [['new', '新しい順'], ['high', '満足度が高い順'], ['low', '満足度が低い順'], ['cheap', '安い順']];

export default function ShopReviews({ shopId }: { shopId: string }) {
  const { S, signedIn } = useStore();
  const [sort, setSort] = useState('new');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const rankIdx = rankIndexOf(S.pt);

  useEffect(() => {
    if (!S.account || !signedIn) return;
    let dead = false;
    setLoading(true);
    setErr('');
    supabase.rpc('shop_reviews', { p_shop: shopId, p_sort: sort, p_limit: 30 }).then(({ data: d, error }) => {
      if (dead) return;
      setLoading(false);
      if (error) setErr(friendly(error)); else setData(d);
    });
    return () => { dead = true; };
  }, [shopId, sort, S.account, signedIn, S.pt]);

  if (!S.account || !signedIn) {
    return (
      <Card flat>
        <Text style={{ color: C.ink, fontWeight: '800' }}>🔒 他の調査官の評価</Text>
        <Muted>アカウントを登録（ログイン）すると、階級に応じて他の調査官の評価を読めます。</Muted>
      </Card>
    );
  }
  if (err) return <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{err}</Text>;
  if (!data) return <Muted>{loading ? '評価を読み込み中…' : ''}</Muted>;

  const vr: number = data.viewer_rank ?? rankIdx;
  const scopeText: Record<string, string> = {
    locked: 'この店を調査（投稿）すると、他の調査官の評価が読めるようになります。',
    own_shop: `${RANKS[vr].n}は、自分が調査した店の評価だけ読めます（新しい順 ${data.limit}件まで）。`,
    '30days': `${RANKS[vr].n}は、直近30日の評価が読めます（${data.limit}件まで）。`,
    all: `${RANKS[vr].n}は、全期間の評価が読めます。並べ替えもできます。`,
  };
  const hidden = Math.max(0, data.total - data.shown);
  const sm = data.summary ?? {};

  return (
    <View style={{ gap: 10 }}>
      <Lbl>他の調査官の評価</Lbl>
      <Muted>{scopeText[data.scope]}</Muted>
      <Text style={{ fontSize: 12.5, color: C.ink2 }}>
        全{data.total}件中 <Text style={{ fontWeight: '800', color: C.ink }}>{data.shown}件</Text> を表示
        {hidden > 0 ? `（残り${hidden}件は、階級が上がると読めます）` : ''}
      </Text>

      {data.scope === 'all' ? (
        <Chips>{SORTS.map(([k, l]) => <Chip key={k} label={l} on={sort === k} onPress={() => setSort(k)} />)}</Chips>
      ) : null}

      {sm.n ? (
        <Card>
          <Text {...font('head')} style={{ fontWeight: '800', color: C.ink }}>平均値（{sm.n}件）</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ width: 70, fontSize: 12, color: C.ink3 }}>満足度</Text>
            {isMasked(sm.satisfaction) ? <Redacted m={sm.satisfaction} /> : <Text style={{ fontSize: 13, color: C.ink }}>{sm.satisfaction.avg}（100点満点）</Text>}
          </View>
          {([['price', '価格', (v: any) => `¥${Number(v.avg).toLocaleString()}`], ['wait', '待ち時間', (v: any) => `${v.avg}分`], ['quiet', '静かさ', (v: any) => `${v.avg}（0=静か〜4=騒がしい）`]] as const).map(([k, l, f]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ width: 70, fontSize: 12, color: C.ink3 }}>{l}</Text>
              {isMasked(sm[k]) ? <Redacted m={sm[k]} /> : <Text style={{ fontSize: 13, color: C.ink }}>{f(sm[k])}</Text>}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ width: 70, fontSize: 12, color: C.ink3 }}>味</Text>
            {isMasked(sm.taste) ? <Redacted m={sm.taste} /> : <Text style={{ fontSize: 13, color: C.ink }}>{FORMAT.taste(sm.taste)}</Text>}
          </View>
        </Card>
      ) : null}

      {data.items.map((it: any) => (
        <Card key={it.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontFamily: mono, fontSize: 11.5, color: C.ink3 }}>{it.date}</Text>
            <Text style={{ fontSize: 12, color: C.ink2, flexShrink: 1, textAlign: 'right' }}>{it.reviewer.rank_name}（信頼 {it.reviewer.trust}）</Text>
          </View>
          <Text style={{ fontWeight: '800', color: C.ink }}>
            {it.dish ?? '（品名なし）'}　<Text style={{ color: C.amber }}>満足度 {it.satisfaction}</Text>
          </Text>
          {Array.isArray(it.photos) && it.photos.length ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {it.photos.map((u: string) => <Image key={u} source={{ uri: u }} style={{ width: 64, height: 64, borderRadius: 2, borderWidth: 3, borderColor: '#FFFFFF' }} />)}
            </View>
          ) : null}
          {LABELS.map(([k, l]) => <Row key={k} label={l} node={it[k]} kind={k} />)}
          {isMasked(it.photos) ? <Row label="写真" node={it.photos} kind="photos_masked" /> : null}
          <Row label="訂正履歴" node={it.corrections} kind="corrections" />
        </Card>
      ))}

      {data.items.length === 0 && data.scope !== 'locked' ? <Muted>表示できる評価がまだありません。</Muted> : null}
      <Muted>██████ は伏せ字です。階級が足りない項目か、あなたがまだ一度も入力していない項目です。入力するほど、他の人の同じ項目が読めるようになります。</Muted>
    </View>
  );
}
