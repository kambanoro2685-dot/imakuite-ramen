import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { addOshi, friendly, getMyPublic, inspectorRanking, myOshi, MyPublic, PublicInspector, removeOshi, searchInspectors, setPublic } from './account';
import { Go } from './nav';
import { useStore } from './store';
import { C, mono } from './theme';
import { useVenues } from './venues';
import { Btn, Card, Chip, Chips, Head, Input, Lbl, Muted } from './ui';

const medal = (pos?: number) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos ? `${pos}位` : '');

function Row({ r, onToggle, busy }: { r: PublicInspector; onToggle: (r: PublicInspector) => void; busy: boolean }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
            {r.pos ? <Text style={{ fontFamily: mono, color: C.amber }}>{medal(r.pos)}　</Text> : null}
            {r.codename}{r.is_me ? <Text style={{ color: C.crit }}>（あなた）</Text> : null}
          </Text>
          <Muted>{r.rank_name} ／ {r.ikp.toLocaleString()}pt ／ 調査{r.visits}件 ／ 💗 {r.fans}人が推し</Muted>
        </View>
        {r.is_me ? null : (
          <Btn small kind={r.is_oshi ? 'ghost' : 'solid'} label={r.is_oshi ? '推し解除' : '💗 推す'} onPress={() => onToggle(r)} style={{ opacity: busy ? 0.5 : 1 }} />
        )}
      </View>
    </Card>
  );
}

/** 推しの調査官。公開をオンにした調査官だけが、検索・ランキング・推しの対象になる */
export default function Oshi({ go }: { go: Go }) {
  const { S, showToast } = useStore();
  const { reloadOshi } = useVenues();
  const [mine, setMine] = useState<MyPublic | null>(null);
  const [list, setList] = useState<PublicInspector[]>([]);
  const [rank, setRank] = useState<PublicInspector[]>([]);
  const [kind, setKind] = useState<'points' | 'fans'>('points');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PublicInspector[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!S.account) return;
    try {
      setErr('');
      const [m, o, r] = await Promise.all([getMyPublic(), myOshi(), inspectorRanking(kind)]);
      setMine(m); setList(o); setRank(r);
    } catch (e) { setErr(friendly(e)); }
  }, [S.account, kind]);
  useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (!q.trim()) { setFound(null); return; }
    try { setErr(''); setFound(await searchInspectors(q.trim())); } catch (e) { setErr(friendly(e)); }
  };

  const toggle = async (r: PublicInspector) => {
    if (busy) return;
    setBusy(true);
    try {
      setErr('');
      if (r.is_oshi) await removeOshi(r.public_id); else await addOshi(r.public_id);
      showToast(r.is_oshi ? `${r.codename} を推しから外しました。` : `${r.codename} を推しにしました。この人が行った店を優先して表示します。`);
      await Promise.all([load(), reloadOshi(), found ? search() : Promise.resolve()]);
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };

  const publish = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      setErr('');
      setMine(await setPublic(on));
      setConfirm(false);
      showToast(on ? '公開しました。ランキングと検索に載ります。' : '非公開に戻しました。');
      await load();
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };

  if (!S.account) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Head title="推し" sub="推しの調査官とランキング" />
        <Card>
          <Text style={{ color: C.ink, fontWeight: '800' }}>アカウントの登録が必要です</Text>
          <Muted>推しの登録とランキングは、アカウント（サーバ登録）を作った人だけが使えます。端末だけで使っている間は、まだ使えません。</Muted>
        </Card>
      </ScrollView>
    );
  }

  const set = (v: boolean) => (v ? '公開中' : '非公開');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <Head title="推し" sub="推しの調査官とランキング" />
      {err ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{err}</Text> : null}

      <Card>
        <Lbl>あなたの公開設定</Lbl>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{mine ? set(mine.is_public) : '確認中…'}</Text>
        <Muted>
          {mine?.is_public
            ? `調査官名・階級・ポイント・調査件数が、他の調査官の検索とランキングに表示されています。あなたを推している人: ${mine.fans}人。`
            : '初期状態では、あなたの名前や実績は誰にも見えません。公開すると、ランキングに載り、他の調査官から推してもらえます。'}
        </Muted>
        {mine?.is_public ? (
          <Btn small kind="ghost" label="非公開に戻す" onPress={() => publish(false)} style={{ alignSelf: 'flex-start' }} />
        ) : confirm ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.crit, fontWeight: '700', lineHeight: 20 }}>
              公開すると、調査官名「{S.profile.nickname}」・階級・ポイント・調査件数・推されている数が、他の調査官に見えます。あなたが誰を推しているかは見えません。いつでも非公開に戻せます。
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn small label="公開する" onPress={() => publish(true)} style={{ flex: 1 }} />
              <Btn small kind="ghost" label="やめる" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Btn small label="公開する（推し・ランキングに参加）" onPress={() => setConfirm(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </Card>

      <View style={{ gap: 8 }}>
        <Lbl>💗 あなたの推し（{list.length}/20）</Lbl>
        {list.length === 0 ? (
          <Muted>まだ推しはいません。下の検索かランキングから、推したい調査官を選んでください。推しが行った店は、さがす・ルーレット・ホームで優先されます。</Muted>
        ) : (
          list.map((r) => <Row key={r.public_id} r={r} onToggle={toggle} busy={busy} />)
        )}
        {list.length > 0 ? <Btn small kind="ghost" label="🔍 推しが行った店を見る" onPress={() => go('search')} style={{ alignSelf: 'flex-start' }} /> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>調査官を探す</Lbl>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input value={q} onChangeText={setQ} placeholder="コードネームで検索" onSubmitEditing={search} returnKeyType="search" />
          </View>
          <Btn small label="検索" onPress={search} />
        </View>
        <Muted>公開している調査官だけが見つかります。</Muted>
        {found ? (found.length === 0 ? <Muted>見つかりませんでした。</Muted> : found.map((r) => <Row key={r.public_id} r={r} onToggle={toggle} busy={busy} />)) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>ランキング（公開している調査官）</Lbl>
        <Chips>
          <Chip label="ポイント順" on={kind === 'points'} onPress={() => setKind('points')} />
          <Chip label="推されている数" on={kind === 'fans'} onPress={() => setKind('fans')} />
        </Chips>
        {rank.some((r) => r.codename.startsWith('見本')) ? <Muted>※ 名前が「見本」で始まる調査官は、見本のデータです（試験用。本物の利用者が増えたら消します）。</Muted> : null}
        {rank.length === 0 ? <Muted>まだ公開している調査官がいません。公開すると、あなたが最初の1人になります。</Muted> : rank.map((r) => <Row key={r.public_id} r={r} onToggle={toggle} busy={busy} />)}
      </View>
    </ScrollView>
  );
}
