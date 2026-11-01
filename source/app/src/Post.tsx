import { chipIcon } from './icons';
import React from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { photoSupported, processPhoto } from './photo';
import { uploadPhoto } from './storage';
import { DraftPhoto, useDraft } from './draft';
import { FIELDS, RANKS, TIER_TITLES, evalRules, ruleOf } from './data';
import { createShop, friendly } from './account';
import { useVenues, walkMin, walkText } from './venues';
import { Go } from './nav';
import { BANNED_NOTICE, findBanned } from './rules';
import { uuid4 } from './supabase';
import { Post, rankIndexOf, useStore } from './store';
import { useSyncer } from './useSyncer';
import { C, mono } from './theme';
import { Btn, Card, Chip, Chips, Faces, Head, Input, Lbl, Muted, Steps, s } from './ui';

const SAT: [string, string][] = [['😞', 'いまいち'], ['😐', 'ふつう'], ['🙂', 'good'], ['😋', 'うまい'], ['🤩', '絶品']];

export function draftPoints(
  D: ReturnType<typeof useDraft>['D'],
  palette: Record<string, boolean>,
  visited: string[],
  rankIdx: number,
) {
  return pointBreakdown(D, palette, visited, rankIdx).reduce((a, x) => a + x.pt, 0);
}

/** いまの入力で付くポイントの内訳（サーバの submit_visit と同じ表。ONの項目だけ数える） */
export function pointBreakdown(
  D: ReturnType<typeof useDraft>['D'],
  palette: Record<string, boolean>,
  visited: string[],
  rankIdx: number,
) {
  const vals: Record<string, string> = {};
  for (const f of FIELDS) {
    const on = f.parent ? palette[f.parent] : palette[f.k];
    if (f.rank <= rankIdx && on && f.type !== 'photo' && D.vals[f.k]) vals[f.k] = D.vals[f.k];
  }
  return evalRules({ dish: D.dish, vals, photos: palette.photo ? D.photos.length : 0, firstVisit: !!D.venue && !visited.includes(D.venue), rankIdx });
}

export default function PostScreen({ go }: { go: Go }) {
  const { S, signedIn, update, addPoints, showToast } = useStore();
  const { D, setD, clear } = useDraft();
  const syncer = useSyncer();
  const rankIdx = rankIndexOf(S.pt);
  const active = FIELDS.filter((f) => f.rank <= rankIdx && (f.parent ? S.palette[f.parent] : S.palette[f.k]));
  const pts = draftPoints(D, S.palette, S.visited, rankIdx);
  const { venues, byId, center, loading, error, locating, useMyLocation, locateHere, addVenue, addLocalVenue, resetCenter, radius, reload } = useVenues();
  const [adding, setAdding] = React.useState(false);
  const [addAsk, setAddAsk] = React.useState(false);
  const [addErr, setAddErr] = React.useState('');
  const [vq, setVq] = React.useState('');
  const nq = vq.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const near = (nq ? venues.filter((v) => v.n.normalize('NFKC').toLowerCase().includes(nq)) : venues).slice(0, 6);
  const picked = D.venue ? byId(D.venue) : undefined;
  const venueShown = picked && !near.some((v) => v.id === picked.id) ? [picked, ...near] : near;

  // ログインの状態: 端末だけで使っている（アカウントなし）／アカウントはあるがログインが切れている
  const needLogin = 'ログインの有効期限が切れています。ログインし直してください。';
  // 最初の画面（新規登録／ログイン）にもどる。この端末の記録（投稿・好み）は残る
  const toLogin = () => update((st) => ({ ...st, onboarded: false }));

  // 候補にない店（ラーメン専門店でない店・新しい店）を、いまの場所に追加する
  const addShop = async () => {
    const name = vq.trim();
    if (!name || adding) return;
    const localOnly = !S.account;
    if (S.account && !signedIn) return setAddErr(needLogin);
    if (!addAsk) return setAddErr(''), setAddAsk(true);
    setAdding(true);
    setAddErr('');
    try {
      const here = await locateHere();
      if (localOnly) {
        const lv = addLocalVenue(name, here.lat, here.lng);
        setD((x) => ({ ...x, venue: lv.id }));
        setVq('');
        setAddAsk(false);
        showToast(`「${name}」を、この端末の店として追加しました。（アカウントがないため、他の人には見えず、追加のポイントも付きません）`);
        return;
      }
      const id = await createShop(name, here.lat, here.lng);
      addVenue({ id, n: name, g: 'その他', lat: here.lat, lng: here.lng, url: null, reviews: null, ranks: null, soup: null, rich: null, thick: null, ntype: null, toppings: null, source: 'inspector', dist: 0 });
      setD((x) => ({ ...x, venue: id }));
      setVq('');
      setAddAsk(false);
      showToast(`「${name}」を現在地の店として追加しました。+100pt（サーバで計算）`);
    } catch (e) {
      const m = friendly(e);
      setAddErr(/duplicate_shop/i.test(String((e as any)?.message)) ? 'この近くに、同じ名前の店がすでにあります。店名で探して、候補から選んでください。' : m);
      await reload().catch(() => {});
    } finally {
      setAdding(false);
    }
  };

  // ラーメン以外の品目（定食・ご飯・チャーハン・餃子）は入力できない
  const [banMsg, setBanMsg] = React.useState('');
  const guard = (t: string): boolean => {
    const w = findBanned(t);
    if (w) { setBanMsg(`「${w}」は入力できません。${BANNED_NOTICE.replace('⚠ ', '')}`); return false; }
    setBanMsg('');
    return true;
  };

  const setVal = (k: string, v: string) => setD((x) => ({ ...x, vals: { ...x.vals, [k]: v } }));

  const upd = (id: string, patch: Partial<DraftPhoto>) =>
    setD((x) => ({ ...x, photos: x.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const pickPhoto = async () => {
    if (D.photos.length >= 3) return showToast('写真は1回の調査で3枚までです。');
    if (!photoSupported) return showToast('写真の保存は、いまは Web 版でのみ使えます。');
    let asset: ImagePicker.ImagePickerAsset | undefined;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      asset = res.canceled ? undefined : res.assets[0];
    } catch {
      return showToast('写真を取得できませんでした。');
    }
    if (!asset) return;
    const id = uuid4();
    setD((x) => ({ ...x, photos: [...x.photos, { id, uri: asset!.uri, busy: !!(S.account && signedIn) }] }));
    try {
      const p = await processPhoto(asset.uri); // 縮小＋再エンコード（位置情報などのEXIFを除去）
      upd(id, { uri: p.uri });
      if (S.account && signedIn) {
        const url = await uploadPhoto(p);
        upd(id, { url, busy: false });
      }
    } catch (e: any) {
      upd(id, { busy: false, error: e?.message ?? '保存できませんでした' });
      showToast(`写真を保存できませんでした: ${e?.message ?? ''}`);
    }
  };

  const submit = () => {
    if (!D.venue) return showToast('店を選んでください。「① 調査対象」の候補を1件タップします（選ぶと赤くなります）。');
    if (!D.dish.trim()) return showToast('「食べた一杯の品名」だけは必要です。記録の芯になります。');
    if (!D.sat) return showToast('満足度をひとつ選んでください。');
    for (const t of [D.dish, D.vals.base_other, D.vals.tops_other, D.vals.sides_other, D.vals.removed_other, D.vals.disliked_other]) {
      const w = t ? findBanned(t) : null;
      if (w) return showToast(`「${w}」は入力できません。ラーメンの丼の中身・トッピング・付け合わせだけを入力してください。`);
    }
    const v = byId(D.venue);
    if (!v) return showToast('店の情報を読み込めませんでした。もう一度選んでください。');
    const first = !S.visited.includes(v.id);
    const vals: Record<string, string> = {};
    for (const f of active) if (D.vals[f.k] && f.type !== 'photo') vals[f.k] = D.vals[f.k];
    const usePhotos = active.some((f) => f.k === 'photo');
    if (usePhotos && D.photos.length) vals.photo = String(D.photos.length);
    if (usePhotos && D.photos.some((p) => p.busy)) return showToast('写真の保存が終わるまで少し待ってください。');
    const post: Post = {
      id: Date.now(), venue: v.id, venueName: v.n, lat: v.lat, lng: v.lng, genre: v.g,
      photos: usePhotos ? D.photos.filter((p) => p.url).map((p) => ({ id: p.id, url: p.url! })) : undefined, dish: D.dish.trim(), sat: D.sat, vals,
      weather: D.stamp ? D.stamp.weather : null, enteredAt: D.stamp ? D.stamp.enteredAt : null,
      first, pts, rouletteId: D.rouletteId, t: Date.now(), edits: [],
      sync: S.account && signedIn ? { key: uuid4(), dishId: uuid4(), step: 0 } : undefined,
    };
    update((st) => ({ ...st, posts: [post, ...st.posts], visited: first ? [...st.visited, v.id] : st.visited, mission: st.mission?.id === v.id ? null : st.mission }));
    if (post.sync) {
      // アカウントがあるときのポイントはサーバが計算する（端末では加点しない）
      showToast('提出しました。サーバでポイントを計算します…');
      syncer(post).then(({ r, msg }) =>
        showToast(
          r === 'done' ? '同期完了。ポイントを更新しました。'
            : r === 'pending' ? `送信できなかったため端末に保存しました。接続できたら自動で再送します。（${msg ?? ''}）`
            : `サーバに受理されませんでした: ${msg ?? ''}`,
        ),
      );
    } else {
      addPoints(pts, `投稿：${v.n}${first ? '（初訪問 +30）' : ''}${D.rouletteId ? '（ルーレット由来 +15）' : ''}`);
      showToast(`投稿しました。+${pts}pt${first ? ' ／ 初めての店なので +30pt 上乗せ' : ''}`);
    }
    const fromRoulette = !!D.rouletteId;
    clear();
    go(fromRoulette ? 'my' : 'home');
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <Head title="調査報告書" sub={D.stamp ? `打刻済 ${D.stamp.weather[0]} ${D.stamp.weather[1]}℃` : '未打刻'} />

        <View style={{ gap: 7 }}>
          <Lbl>① 調査対象（どこで）</Lbl>
          <Input value={vq} onChangeText={setVq} placeholder="店名で探す（近くの店が候補に出ます）" />
          <Muted>
            ラーメン専門店でなくても構いません。候補にない店は、店名を上の欄に入れると、いまの場所の店として追加できます。
          </Muted>
          {vq.trim() ? (
            <View style={{ gap: 6 }}>
              {addAsk ? (
                <Text style={{ color: C.crit, fontWeight: '700', lineHeight: 20 }}>
                  「{vq.trim()}」を、いまいる場所（現在地）の店として追加します。{S.account ? '他の人の店リストにも載ります。' : 'この端末だけの店になります。'}よろしければ、もう一度押してください。
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Btn small label={adding ? '追加中…' : addAsk ? '追加する（現在地を使います）' : `＋ 「${vq.trim()}」を現在地の店として追加`} onPress={addShop} />
                {addAsk && !adding ? <Btn small kind="ghost" label="やめる" onPress={() => setAddAsk(false)} /> : null}
              </View>
              {S.account && !signedIn ? (
                <View style={{ gap: 6, backgroundColor: C.amberSoft, padding: 10, borderRadius: 3 }}>
                  <Text style={{ color: C.ink, fontWeight: '800' }}>{needLogin}</Text>
                  <Muted>
                    「ログインし直す」を押すと、最初の画面にもどります。パスキーか復旧コードでログインしてください。この端末の記録は残ります。
                  </Muted>
                  <Btn small label="ログインし直す" onPress={toLogin} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}
              {!S.account ? <Muted>アカウントがないときは、この端末だけの店として追加します（他の人には見えず、追加のポイントも付きません）。アカウントを登録すると、全員の店リストに載せて +100pt になります。</Muted> : null}
              {addErr && !(S.account && !signedIn) ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{addErr}</Text> : null}
            </View>
          ) : null}
          <Muted>
            基準: {center.source === 'gps' ? '現在地' : '岡山駅'}（近い店から表示。半径{radius / 1000}km）{radius > 3000 ? '　※ 近くに店が少ないため、範囲を広げています。' : ''}
          </Muted>
          {picked ? (
            <Text style={{ color: C.good, fontWeight: '800' }}>✓ 選んだ店: {picked.n}（もう一度押すと解除）</Text>
          ) : (
            <Text style={{ color: C.crit, fontWeight: '800' }}>⚠ 店がまだ選ばれていません。下の候補を1件タップしてください。</Text>
          )}
          <Chips>
            {venueShown.map((v) => (
              <Chip
                key={v.id}
                label={`${v.n} · ${walkText(v.dist)}`}
                on={D.venue === v.id}
                onPress={() => setD((x) => ({ ...x, venue: x.venue === v.id ? null : v.id }))}
              />
            ))}
          </Chips>
          {error ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{error}</Text> : null}
          {loading && venues.length === 0 ? <Muted>近くの店を読み込み中…</Muted> : null}
          {!loading && !error && venues.length === 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: C.ink, fontWeight: '800' }}>この周辺には、まだ店のデータがありません。</Text>
              <Muted>対応エリアは、いまは岡山市中心部（岡山駅の周辺）です。現在地がエリアの外だと、候補が出ません。</Muted>
              <Btn small label="岡山駅周辺の店を出す" onPress={resetCenter} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}
          {!loading && venues.length > 0 && nq && near.length === 0 ? <Muted>「{vq}」に合う店が、この周辺にありません。別の言葉で探すか、上のボタンで現在地の店として追加できます。</Muted> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {center.source === 'gps' ? <Btn small kind="ghost" label="岡山駅周辺にする" onPress={resetCenter} /> : null}
            <Btn small kind="ghost" label={locating ? '取得中…' : center.source === 'gps' ? '📍 現在地を更新' : '📍 現在地にする'} onPress={useMyLocation} />
          </View>
        </View>

        <View style={{ gap: 7 }}>
          <Lbl>② 食べた一杯（品名）</Lbl>
          <Input value={D.dish} onChangeText={(t) => { if (guard(t)) setD((x) => ({ ...x, dish: t })); }} placeholder="例：特製味噌ラーメン" />
          <Muted>{BANNED_NOTICE}</Muted>
          {banMsg ? <Text selectable style={{ color: C.crit, fontWeight: '700' }}>{banMsg}</Text> : null}
        </View>

        <View style={{ gap: 7 }}>
          <Lbl>③ 総合所見（満足度）</Lbl>
          <Faces
            opts={SAT}
            value={D.sat ? SAT[D.sat - 1][1] : ''}
            onPick={(n) => setD((x) => ({ ...x, sat: n ? SAT.findIndex((f) => f[1] === n) + 1 : 0 }))}
          />
        </View>

        {active.map((f) => (
          <View key={f.k} style={{ gap: 7 }}>
            <Lbl>{f.n}</Lbl>
            {f.hint ? <Muted>{f.hint}</Muted> : null}
            {ruleOf(f.g) && !f.parent && active.findIndex((x) => x.g === f.g) === active.indexOf(f) ? <Muted>🏷 「{ruleOf(f.g)!.n}」の組 ＋{ruleOf(f.g)!.pt}pt{ruleOf(f.g)!.note ? `（${ruleOf(f.g)!.note}）` : ''}</Muted> : null}
            {f.type === 'pick' ? (
              <Chips>
                {f.opts.map((o) => (
                  <Chip key={o} label={o} icon={chipIcon(f.k, o)} on={D.vals[f.k] === o} onPress={() => setVal(f.k, D.vals[f.k] === o ? '' : o)} />
                ))}
              </Chips>
            ) : f.type === 'faces' ? (
              <Faces opts={f.opts} value={D.vals[f.k] ?? ''} onPick={(v) => setVal(f.k, v)} />
            ) : f.type === 'range' ? (
              <View style={{ gap: 6 }}>
                <Chips>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Chip key={n} label={f.labels[n]} on={D.vals[f.k] === String(n)} onPress={() => setVal(f.k, D.vals[f.k] === String(n) ? '' : String(n))} />
                  ))}
                </Chips>
              </View>
            ) : f.type === 'rating' ? (
              <View style={{ gap: 4 }}>
                <Chips>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <Chip key={n} label={String(n)} on={D.vals[f.k] === String(n)} onPress={() => setVal(f.k, D.vals[f.k] === String(n) ? '' : String(n))} />
                  ))}
                </Chips>
                <Muted>0 = 感じない ／ 5 = とても強い</Muted>
              </View>
            ) : f.type === 'multi' ? (
              <Chips>
                {f.opts.map((o) => {
                  const cur = (D.vals[f.k] ?? '').split(',').filter(Boolean);
                  const on = cur.includes(o);
                  return (
                    <Chip
                      key={o}
                      label={o}
                      icon={chipIcon(f.k, o)}
                      on={on}
                      onPress={() => setVal(f.k, (on ? cur.filter((x) => x !== o) : [...cur, o]).join(','))}
                    />
                  );
                })}
              </Chips>
            ) : f.type === 'price' ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: mono, fontSize: 20, fontWeight: '800', color: C.ink }}>
                  {Number(D.vals[f.k] || 0) ? `¥${Number(D.vals[f.k]).toLocaleString()}` : '未設定'}
                </Text>
                <Steps value={Number(D.vals[f.k] || 0)} min={0} max={10000} step={100} onChange={(v) => setVal(f.k, v ? String(v) : '')} />
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn small kind="ghost" label="−10円" onPress={() => setVal(f.k, String(Math.max(0, Number(D.vals[f.k] || 0) - 10) || ''))} />
                  <Btn small kind="ghost" label="＋10円" onPress={() => setVal(f.k, String(Math.min(99990, Number(D.vals[f.k] || 0) + 10)))} />
                  <View style={{ width: 130 }}>
                    <Input
                      value={D.vals[f.k] ?? ''}
                      onChangeText={(t) => setVal(f.k, t.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 5))}
                      placeholder="金額を直接入力"
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>
                  <Text style={{ color: C.ink2 }}>円</Text>
                </View>
                <Muted>＋ / − で100円ずつ。「−10円」「＋10円」で10円ずつ。数字を直接入れると、1円単位でも入力できます（例：税込 1078）。</Muted>
              </View>
            ) : f.type === 'photo' ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {D.photos.map((p) => (
                    <View key={p.id} style={{ width: 96 }}>
                      <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: 2, borderWidth: 4, borderColor: '#FFFFFF', opacity: p.busy ? 0.5 : 1 }} />
                      <Text style={{ fontSize: 10.5, color: p.error ? C.crit : C.ink3 }}>
                        {p.error ? '失敗' : p.busy ? '保存中…' : p.url ? '保存済み' : '端末内'}
                      </Text>
                      <Btn small kind="ghost" label="外す" onPress={() => setD((x) => ({ ...x, photos: x.photos.filter((q) => q.id !== p.id) }))} />
                    </View>
                  ))}
                </View>
                {D.photos.length < 3 ? (
                  <Btn small kind="ghost" label={`📷 写真を選ぶ（${D.photos.length}/3）`} onPress={pickPhoto} style={{ alignSelf: 'flex-start' }} />
                ) : null}
                <Muted>
                  端末で縮小し、撮影場所などの情報(EXIF)を取り除いてから保存します。
                  {S.account ? '' : 'アカウントを登録すると、写真をサーバに保存できます（登録していないときは端末内のみ）。'}
                  人の顔が写らないようにしてください（顔のぼかしは未対応です）。
                </Muted>
              </View>
            ) : f.type === 'item' ? (
              <Input value={D.vals[f.k] ?? ''} onChangeText={(t) => { if (guard(t)) setVal(f.k, t.slice(0, 60)); }} placeholder="例：背脂、白髪ねぎ（ラーメンの具材だけ）" maxLength={60} />
            ) : (
              <Input value={D.vals[f.k] ?? ''} onChangeText={(t) => setVal(f.k, t)} placeholder="話しかけるように書いてください" multiline />
            )}
          </View>
        ))}

        <Card flat>
          <Lbl>いまの入力で付くポイント</Lbl>
          {pointBreakdown(D, S.palette, S.visited, rankIdx).map((x) => (
            <Text key={x.kind} style={{ color: C.ink2, fontSize: 13 }}>・{x.n}　<Text style={{ fontFamily: mono, color: C.good, fontWeight: '800' }}>+{x.pt}pt</Text></Text>
          ))}
          <Muted>同じ組の項目は、全部そろえると付きます。ポイントは、提出するとサーバが計算します（アカウントがないときは、この端末で同じ表で計算します）。</Muted>
        </Card>
        <Btn kind="ghost" label="⚙️ 入力する項目を選ぶ" onPress={() => go('palette')} />
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
        <View>
          <Text style={{ fontFamily: mono, fontSize: 22, fontWeight: '800', color: C.good }}>+{pts}</Text>
          <Text style={{ fontFamily: mono, fontSize: 10, color: C.ink3 }}>POINT</Text>
        </View>
        <Btn label="この内容で提出" onPress={submit} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function Palette({ go }: { go: Go }) {
  const { S, update } = useStore();
  const { setD } = useDraft();
  const rankIdx = rankIndexOf(S.pt);
  const total = FIELDS.filter((f) => !f.parent).length;
  const open = FIELDS.filter((f) => f.rank <= rankIdx && !f.parent).length;

  const toggle = (k: string) => {
    const on = !S.palette[k];
    const keys = [k, ...FIELDS.filter((f) => f.parent === k).map((f) => f.k)];
    update((st) => ({ ...st, palette: { ...st.palette, ...Object.fromEntries(keys.map((x) => [x, on])) } }));
    if (!on) setD((x) => ({ ...x, vals: { ...x.vals, ...Object.fromEntries(keys.map((x2) => [x2, ''])) } }));
  };
  const setTier = (tier: number, on: boolean) => {
    const keys = FIELDS.filter((f) => f.rank === tier).map((f) => f.k); // 自由入力も含む
    update((st) => {
      const next = { ...st.palette };
      keys.forEach((k) => { next[k] = on; });
      return { ...st, palette: next };
    });
    if (!on) setD((x) => ({ ...x, vals: Object.fromEntries(Object.entries(x.vals).filter(([k]) => !keys.includes(k))) }));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}>
      <Head title="入力項目" sub={`解放 ${open} / ${total}`} />
      <Muted>
        階級が上がると、より詳しい調査項目が使えるようになります。使いたい項目をONにすると投稿画面に現れ、入力した分だけポイントが増えます。
      </Muted>

      {TIER_TITLES.map((title, tier) => {
        const fields = FIELDS.filter((f) => f.rank === tier && !f.parent);
        const locked = tier > rankIdx;
        const need = RANKS[tier].at - S.pt;
        const allOn = fields.every((f) => S.palette[f.k]);
        return (
          <View key={tier} style={{ gap: 8, opacity: locked ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Lbl>{`${locked ? '🔒 ' : ''}${RANKS[tier].n}から｜${title}`}</Lbl>
              </View>
              {locked ? (
                <Text style={{ fontFamily: mono, fontSize: 11.5, color: C.crit, fontWeight: '800' }}>あと {need.toLocaleString()}pt</Text>
              ) : (
                <Btn small kind="ghost" label={allOn ? 'すべてOFF' : 'すべてON'} onPress={() => setTier(tier, !allOn)} />
              )}
            </View>
            {fields.map((f) => {
              const on = !locked && !!S.palette[f.k];
              return (
                <Pressable
                  key={f.k}
                  disabled={locked}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on, disabled: locked }}
                  onPress={() => toggle(f.k)}
                  style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14 }, on && { borderColor: C.indigo, backgroundColor: C.indigoSoft }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.ink }}>{f.n}</Text>
                    {f.hint ? <Text style={{ fontSize: 11.5, color: C.ink3 }}>{f.hint}</Text> : null}
                  </View>
                  {ruleOf(f.g) ? <Text style={{ fontFamily: mono, color: C.good, fontWeight: '800', fontSize: 12 }}>組 +{ruleOf(f.g)!.pt}pt</Text> : <Text style={{ fontFamily: mono, color: C.ink3, fontSize: 12 }}>記録のみ</Text>}
                  <Text style={{ fontSize: 18 }}>{locked ? '🔒' : on ? '✅' : '⬜'}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
      <Btn label="投稿画面にもどる" onPress={() => go('post')} />
    </ScrollView>
  );
}
