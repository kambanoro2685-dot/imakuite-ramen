import { RANK_ICON } from './icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { addPasskey, deleteAccount, fetchMe, friendly, issueRecoveryCode, logout, passkeySupported } from './account';
import { RANKS } from './data';
import { SYNC_DONE } from './sync';
import { useSamples } from './sample';
import { TermsSheet } from './TermsSheet';
import { TERMS_VERSION } from './terms';
import { supabase } from './supabase';
import { Post, rankOf, useStore } from './store';
import { C, mono } from './theme';
import { Btn, Card, Chip, Chips, Faces, Head, Input, Lbl, Meter, Muted, Sheet } from './ui';

const REASONS = ['打ち間違えた', '後で確認したら違った', '店の情報が変わった', '写真の下書きが誤っていた'];
const REV: [string, string][] = [['😑', '外れ'], ['🙁', 'いまいち'], ['🙂', 'まあ当たり'], ['😋', '当たり'], ['🤩', '大当たり']];

function trustNote(t: number) {
  if (t >= 80) return '認定インスペクター · 推薦への重み ×1.5 · 検証者になれます';
  if (t >= 60) return '良好 · 推薦への重み ×1.2';
  if (t >= 40) return '標準 · 推薦への重み ×1.0';
  if (t >= 20) return '要確認 · 重み ×0.5 · 投稿に「未検証」表示';
  return '保留 · 重み ×0.1 · 推薦には使われません';
}

export default function My() {
  const { S, signedIn, update, addPoints, addTrust, reset, showToast } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pkErr, setPkErr] = useState('');
  const [rcode, setRcode] = useState('');
  const [rbusy, setRbusy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const samples = useSamples();
  const r = rankOf(S.pt);
  const idx = RANKS.indexOf(r);
  const next = RANKS[idx + 1];
  const [edit, setEdit] = useState<Post | null>(null);
  const [val, setVal] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [rev, setRev] = useState<Post | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const openEdit = (p: Post) => { setEdit(p); setVal(p.dish); setReason(REASONS[0]); };
  const saveEdit = async () => {
    if (!edit) return;
    const nv = val.trim();
    if (!nv) return showToast('新しい値を入れてください。');
    if (nv === edit.dish) { setEdit(null); return showToast('変更はありませんでした。'); }
    const onServer = signedIn && !!edit.sync && edit.sync.step >= 2;
    if (onServer) {
      // サーバ側が正（履歴・72時間ルールはサーバで判定）。成功してから端末に反映する
      try {
        const { error } = await supabase.rpc('correct_field', { p_table: 'dish', p_id: edit.sync!.dishId, p_field: 'name', p_new: nv, p_reason: reason });
        if (error) throw error;
        const me = await fetchMe();
        if (me) update((st) => ({ ...st, pt: me.ikp, trust: Math.round(me.trust_score / 10) }));
      } catch (e) {
        return showToast(friendly(e));
      }
    }
    update((st) => ({
      ...st,
      posts: st.posts.map((p) =>
        p.id === edit.id ? { ...p, dish: nv, edits: [...p.edits, { f: '品名', o: p.dish, n: nv, t: Date.now(), reason }] } : p,
      ),
    }));
    if (!onServer) addPoints(3, `自分から誤りを訂正（${reason}）`);
    setEdit(null);
    showToast('訂正しました。旧値は履歴に残ります。+3pt。');
  };
  const saveRev = (i: number) => {
    if (!rev) return;
    update((st) => ({ ...st, posts: st.posts.map((p) => (p.id === rev.id ? { ...p, rev: `${i + 1}/5` } : p)) }));
    addPoints(10, 'ルーレットの事後評価');
    setRev(null);
    showToast('事後評価を記録しました。+10pt。');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Head title="調査官ファイル" sub={S.uid} />
      <Muted>{S.profile.nickname}　／　{S.profile.nationality}　／　好み：{S.profile.favorites.join('・') || '未設定'}{S.profile.allergies ? `　／　避ける：${S.profile.allergies}` : ''}</Muted>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={box}><Text style={big}>{S.pt.toLocaleString()}</Text><Muted>総ポイント</Muted></View>
        <View style={box}><Text style={big}>{S.trust}</Text><Muted>信頼スコア</Muted></View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={RANK_ICON[idx]} style={{ width: 44, height: 44 }} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{r.n}</Text>
          </View>
          <Text style={{ fontFamily: mono, fontSize: 12, color: C.ink3 }}>
            {next ? `次「${next.n}」まで ${(next.at - S.pt).toLocaleString()}pt` : '最上位'}
          </Text>
        </View>
        <Meter pct={next ? ((S.pt - r.at) / (next.at - r.at)) * 100 : 100} />
        <Muted>{r.unlock}</Muted>
      </Card>

      <Card>
        <Lbl>信頼スコアの効果</Lbl>
        <Meter pct={S.trust} color={C.good} />
        <Muted>{trustNote(S.trust)}</Muted>
        <Muted>誤情報が確定すると −50pt・信頼 −30。誤りが多い人の加点倍率は ×0.25 に下がります（サーバ接続後に自動化）。</Muted>
        {!S.account ? <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn small kind="ghost" label="誤りを指摘された(試験)" style={{ flex: 1 }} onPress={() => { addPoints(-50, '誤情報が確定'); addTrust(-30); showToast('誤情報として確定：−50pt、信頼 −30。'); }} />
          <Btn small kind="ghost" label="指摘が採用された(試験)" style={{ flex: 1 }} onPress={() => { addPoints(40, '指摘が採用された（お礼）'); addTrust(3); showToast('指摘が採用されました：+40pt、信頼 +3。'); }} />
        </View> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <Lbl>投稿履歴</Lbl>
        {S.posts.length === 0 ? <Muted>まだ投稿がありません。ホームの「入店を記録する」から始めてください。</Muted> : null}
        {S.posts.map((p) => {
          const det: string[] = [];
          if (p.weather) det.push(`${p.weather[0]} ${p.weather[1]}℃ ${p.weather[2]}hPa`);
          if (p.vals.price) det.push(`¥${Number(p.vals.price).toLocaleString()}`);
          if (p.vals.amount) det.push(`量:${p.vals.amount}`);
          if (p.rouletteId) det.push('ルーレット由来');
          return (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: C.ink, flexShrink: 1 }}>{p.venueName}</Text>
                {p.sample ? <Text style={{ fontFamily: mono, color: C.amber, fontWeight: '800' }}>見本</Text> : <Text style={{ fontFamily: mono, color: C.good, fontWeight: '800' }}>+{p.pts}pt</Text>}
              </View>
              <Text style={{ color: C.ink2 }}>{p.dish} ／ 満足度 {p.sat}{p.first ? ' ／ 初訪問' : ''}</Text>
              {p.photos?.length ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {p.photos.map((ph) => (
                    <Image key={ph.id} source={{ uri: ph.url }} style={{ width: 64, height: 64, borderRadius: 2, borderWidth: 3, borderColor: '#FFFFFF' }} />
                  ))}
                </View>
              ) : null}
              {det.length ? <Muted>{det.join(' · ')}</Muted> : null}
              {p.edits.length ? (
                <Muted style={{ color: C.warn }}>
                  訂正済み {p.edits.length}件：{p.edits.map((e) => `${e.f}「${e.o}」→「${e.n}」`).join(' / ')}
                </Muted>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {p.sample ? null : <Btn small kind="ghost" label="訂正する" onPress={() => openEdit(p)} />}
                {p.rouletteId && !p.rev ? <Btn small label="ルーレットの事後評価" onPress={() => setRev(p)} /> : null}
                {p.rev ? <Muted>事後評価：{p.rev}</Muted> : null}
              </View>
            </Card>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>ポイント台帳（追記のみ）</Lbl>
        {S.ledger.length === 0 ? <Muted>まだ記録がありません</Muted> : null}
        {S.ledger.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line }}>
            <Text style={{ flex: 1, fontSize: 13, color: C.ink2 }}>{l.r}</Text>
            <Text style={{ fontFamily: mono, fontWeight: '800', color: l.n < 0 ? C.crit : C.good }}>{l.n > 0 ? '+' : ''}{l.n}</Text>
          </View>
        ))}
      </View>

      <Card>
        <Lbl>見本データ</Lbl>
        <Muted>
          地図や調査履歴の見え方を試すための見本です。近くの実在の店に、調査済みの記録を5件と、今日の指令を入れます。
          この端末の中だけに保存され、サーバへは送らず、ポイントにも数えません。いつでも消せます。
        </Muted>
        <Btn small kind="ghost" label={samples.has ? '🧹 見本を消す' : '🧪 見本を入れてみる'} onPress={samples.has ? samples.clear : samples.add} style={{ alignSelf: 'flex-start' }} />
      </Card>

      <Card>
        <Lbl>利用規約への同意</Lbl>
        <Muted>
          {S.terms
            ? `同意した版: ${S.terms.version}（${new Date(S.terms.at).toLocaleDateString('ja-JP')}）${S.terms.version !== TERMS_VERSION ? '　※ 新しい版があります' : ''}${S.account && !S.terms.synced ? '　※ サーバへの記録は送信待ち' : ''}`
            : '未同意'}
        </Muted>
        <Btn small kind="ghost" label="📄 利用規約・プライバシーポリシーを読む" onPress={() => setShowTerms(true)} style={{ alignSelf: 'flex-start' }} />
      </Card>
      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} />

      {S.account ? (
        <Card>
          <Lbl>アカウント（パスキー）</Lbl>
          <Muted>
            サーバ登録済み。ポイントと信頼スコアはサーバの値です。
            {S.posts.some((p) => p.sync && p.sync.step < SYNC_DONE) ? `未送信の投稿が ${S.posts.filter((p) => p.sync && p.sync.step < SYNC_DONE).length} 件あります（接続できたら自動で送信）。` : '未送信の投稿はありません。'}
          </Muted>
          {passkeySupported() ? (
            <Btn small kind={S.account.passkey ? 'ghost' : 'solid'} label={S.account.passkey ? 'この端末のパスキーを追加登録' : '⚠️ パスキーを設定する（未設定）'} onPress={async () => {
              setPkErr('');
              try {
                await addPasskey();
                update((st) => (st.account ? { ...st, account: { ...st.account, passkey: true } } : st));
                showToast('パスキーを設定しました。');
              } catch (e: any) { setPkErr(`${friendly(e)}  [${e?.name ?? ''}${e?.code ? ' ' + e.code : ''}${e?.status ? ' ' + e.status : ''}]`); }
            }} />
          ) : null}
          <Lbl>復旧コード</Lbl>
          <Muted>
            パスキーをなくしたとき・端末を替えたときに、ログインできるコードです。{S.account.recovery ? '発行済み。再発行すると、前のコードは使えなくなります。' : 'まだ発行していません。'}
          </Muted>
          <Btn small kind={S.account.recovery ? 'ghost' : 'solid'} label={rbusy ? '発行中…' : S.account.recovery ? '復旧コードを再発行する' : '🔑 復旧コードを発行する'} onPress={async () => {
            if (rbusy) return;
            setRbusy(true);
            setPkErr('');
            try {
              setRcode(await issueRecoveryCode());
              update((st) => (st.account ? { ...st, account: { ...st.account, recovery: true } } : st));
            } catch (e: any) { setPkErr(friendly(e)); } finally { setRbusy(false); }
          }} />
          {rcode ? (
            <View style={{ gap: 8, backgroundColor: C.amberSoft, padding: 12, borderRadius: 3, borderWidth: 2, borderColor: C.crit, borderStyle: 'dashed' }}>
              <Text style={{ color: C.crit, fontWeight: '800' }}>この画面を閉じると、二度と表示できません。</Text>
              <Text selectable style={{ fontFamily: mono, fontSize: 13, color: C.ink, lineHeight: 20 }}>{rcode}</Text>
              <Muted>パスワードマネージャーや、人に見られない場所に保管してください。このコードを知っている人は、あなたのアカウントに入れます。</Muted>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn small label="コピー" onPress={() => { try { (navigator as any).clipboard.writeText(rcode); showToast('コピーしました。'); } catch { showToast('コピーできませんでした。文字を選んでコピーしてください。'); } }} style={{ flex: 1 }} />
                <Btn small kind="ghost" label="保管した（閉じる）" onPress={() => setRcode('')} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}
          {pkErr ? <Text selectable style={{ color: C.crit, fontWeight: '700', lineHeight: 20 }}>{pkErr}</Text> : null}
          <Btn small kind="ghost" label="ログアウト" onPress={async () => { await logout(); reset(); }} />
          <Btn small kind="ghost" label="アカウントを削除" onPress={() => setConfirmDelete(true)} />
        </Card>
      ) : null}
      <Btn small kind="ghost" label="この端末のデータをすべて消す" onPress={() => setConfirmReset(true)} />

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>アカウントを削除しますか？</Text>
        <Muted>パスキーとプロフィールをサーバから削除し、ログインできなくなります。過去の調査記録は、個人と結びつかない匿名の統計として残ります。元に戻せません。</Muted>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn kind="ghost" label="やめる" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
          <Btn label="削除する" style={{ flex: 1 }} onPress={async () => {
            try {
              await deleteAccount();
              setConfirmDelete(false);
              reset();
            } catch (e) {
              showToast(friendly(e));
            }
          }} />
        </View>
      </Sheet>

      <Sheet visible={!!edit} onClose={() => setEdit(null)}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>投稿を訂正する</Text>
        <Lbl>項目：品名</Lbl>
        <Text style={{ color: C.ink3, textDecorationLine: 'line-through' }}>{edit?.dish}</Text>
        <Input value={val} onChangeText={setVal} />
        <Lbl>訂正の理由</Lbl>
        <Chips>{REASONS.map((x) => <Chip key={x} label={x} on={reason === x} onPress={() => setReason(x)} />)}</Chips>
        <Muted>旧値・新値・理由・日時が履歴として残ります（上書きではありません）。自己申告の訂正は +3pt。</Muted>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn kind="ghost" label="やめる" onPress={() => setEdit(null)} style={{ flex: 1 }} />
          <Btn label="訂正を確定" onPress={saveEdit} style={{ flex: 1 }} />
        </View>
      </Sheet>

      <Sheet visible={!!rev} onClose={() => setRev(null)}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>ルーレットの結果は当たりでしたか？</Text>
        <Muted>{rev?.venueName} ／ {rev?.dish}</Muted>
        <Faces opts={REV} value="" onPick={(n) => saveRev(REV.findIndex((f) => f[1] === n))} />
        <Muted>+10pt。評価が溜まるほど、あなたにとっての「当たり」の傾向が抽選に反映されます。</Muted>
        <Btn kind="ghost" label="あとで書く" onPress={() => setRev(null)} />
      </Sheet>

      <Sheet visible={confirmReset} onClose={() => setConfirmReset(false)}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>データを消しますか？</Text>
        <Muted>プロフィール・投稿・ポイントがすべて消え、元に戻せません。</Muted>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn kind="ghost" label="やめる" onPress={() => setConfirmReset(false)} style={{ flex: 1 }} />
          <Btn label="消す" onPress={() => { reset(); setConfirmReset(false); }} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

const box = { flex: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 3, padding: 12 } as const;
const big = { fontSize: 24, fontWeight: '800', color: C.indigo } as const;
