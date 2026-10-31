import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { addPasskey, friendly, loginWithPasskey, loginWithRecoveryCode, passkeySupported, recordTerms, startAccount } from './account';
import { CHECKBOX_TEXT, TERMS_VERSION } from './terms';
import { NOT_READ, ReadState, TermsSheet } from './TermsSheet';
import { BUILD } from './config';
import { GENRES, NOODLE_TYPES, RICHNESS, THICKNESS, TOPPINGS } from './data';
import { useStore } from './store';
import { pushProfile } from './sync';
import { C } from './theme';
import { Btn, Card, Check, Chip, Chips, Input, Lbl, Muted } from './ui';

const GENDERS = ['回答しない', '女性', '男性', 'その他'];
const AGES = ['〜19', '20代', '30代', '40代', '50代', '60代〜'];

export default function Onboarding() {
  const { S, update, addPoints, showToast } = useStore();
  const [nick, setNick] = useState(S.profile.nickname);
  const [nat, setNat] = useState(S.profile.nationality);
  const [gender, setGender] = useState(S.profile.gender);
  const [age, setAge] = useState(S.profile.age);
  const [allergy, setAllergy] = useState(S.profile.allergies);
  const [favs, setFavs] = useState<string[]>(S.profile.favorites);
  const [rich, setRich] = useState<number | null>(S.profile.rich);
  const [thick, setThick] = useState(S.profile.thick);
  const [ntype, setNtype] = useState(S.profile.ntype);
  const [tops, setTops] = useState<string[]>(S.profile.toppings ?? []);
  const toggleTop = (t: string) => setTops((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  // 利用規約・プライバシーポリシーを最後まで読むまで、同意のチェックは入れられない
  const [read, setRead] = useState<ReadState>(NOT_READ);
  const allRead = read.terms && read.privacy;
  const markRead = (w: 'terms' | 'privacy') => setRead((r) => (r[w] ? r : { ...r, [w]: true }));
  const canPasskey = passkeySupported();
  // 入り口を分ける: choose=最初の画面 / new=はじめての方（新規登録）/ login=登録済みの方（ログイン）
  const [step, setStep] = useState<'choose' | 'new' | 'login'>(passkeySupported() ? 'choose' : 'new');
  const go = (s: 'choose' | 'new' | 'login') => { setStep(s); setErr(''); };
  const [showRecovery, setShowRecovery] = useState(false);
  const [rcode, setRcode] = useState('');

  const toggle = (g: string) => setFavs((f) => (f.includes(g) ? f.filter((x) => x !== g) : [...f, g]));
  const profile = () => ({ nickname: nick.trim(), nationality: nat.trim(), gender, age, allergies: allergy.trim(), favorites: favs, rich, thick, ntype, toppings: tops });

  const detail = (e: unknown) => {
    const x = e as any;
    console.warn('[imakuite]', e);
    return `${friendly(e)}  [${x?.name ?? ''}${x?.code ? ' ' + x.code : ''}${x?.status ? ' ' + x.status : ''}]`;
  };

  // 足りない項目は、ボタンのすぐ近くに文字で出す（トーストは消えるうえ、画面の外にあると気づきにくい）
  const [formMsg, setFormMsg] = useState('');
  const validate = () => {
    const miss: string[] = [];
    if (!nick.trim()) miss.push('① 調査官名（本名は不要です）');
    if (favs.length === 0) miss.push('② 好きなラーメンの系統（1つ以上）');
    if (!allRead) miss.push('⑦ 利用規約とプライバシーポリシーを最後まで読む');
    else if (!agree) miss.push('⑦ 同意のチェック');
    if (miss.length) {
      const msg = `まだ足りません: ${miss.join('、')}。`;
      setFormMsg(msg);
      showToast(msg);
      return false;
    }
    setFormMsg('');
    return true;
  };

  // ---- 端末内だけで使う（従来どおり）----
  const startLocal = () => {
    if (!validate()) return;
    update((s) => ({ ...s, onboarded: true, account: null, profile: profile(), terms: { version: TERMS_VERSION, at: Date.now(), synced: true } }));
    addPoints(20, '調査官登録（プロフィール入力）');
    showToast('登録完了。+20pt。最初の任務は「入店を記録する」です。');
  };

  // ---- アカウント登録（匿名セッション → 公開ID発行 → パスキー設定）----
  const register = async () => {
    if (!validate() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const { publicId } = await startAccount(nick.trim());
      const p = profile();
      update((s) => ({ ...s, onboarded: true, account: { publicId, passkey: false }, uid: publicId, pt: 0, trust: 50, profile: p, terms: { version: TERMS_VERSION, at: Date.now(), synced: false } }));
      recordTerms(TERMS_VERSION)
        .then(() => update((s) => (s.terms ? { ...s, terms: { ...s.terms, synced: true } } : s)))
        .catch(() => {}); // 送れなかったら、接続できたときに自動で再送する
      pushProfile(p).catch(() => {});
      try {
        await addPasskey();
        update((s) => (s.account ? { ...s, account: { ...s.account, passkey: true } } : s));
        showToast('登録完了。パスキーを設定しました。マイページで「復旧コード」も発行しておくと、パスキーをなくしても戻れます。');
      } catch (e) {
        // 登録自体は完了している。パスキーだけ後からマイページで設定できる
        setErr(`登録は完了しましたが、パスキーは未設定です。マイページから設定できます。
原因: ${detail(e)}`);
        showToast('登録しました。ただしパスキーは未設定です。');
      }
    } catch (e) {
      setErr(`登録できませんでした。
原因: ${detail(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // ---- 既存アカウントでログイン ----
  const login = (recovery = false) => async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const me = recovery ? await loginWithRecoveryCode(rcode) : await loginWithPasskey();
      update((s) => ({
        ...s,
        onboarded: true,
        account: { publicId: me.public_id, passkey: !recovery, recovery },
        uid: me.public_id,
        pt: me.ikp,
        trust: Math.round(me.trust_score / 10),
        profile: { ...s.profile, nickname: me.codename, favorites: s.profile.favorites.length ? s.profile.favorites : favs },
        // 同意済みの版が現行ならそのまま。そうでなければ、次の画面で同意を求める
        terms: me.terms_version === TERMS_VERSION ? { version: TERMS_VERSION, at: Date.now(), synced: true } : null,
      }));
      showToast(`おかえりなさい、${me.codename} 調査官。`);
    } catch (e) {
      setErr(`ログインできませんでした。
原因: ${detail(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>
          ImaKuite<Text style={{ color: C.crit }}>!</Text>Ramen<Text style={{ color: C.crit }}>!</Text>
        </Text>
        <Text style={{ color: C.amber, fontWeight: '700' }}>今日からあなたも、ラーメンインスペクター。</Text>
        {step === 'choose' ? <Muted>はじめての方と、登録済みの方で、入り口が分かれています。</Muted> : null}
        {step === 'new' ? <Muted>調査官登録書（第1号様式）。必要最小限だけ記入してください。氏名・住所・連絡先は集めません。</Muted> : null}
        {step === 'login' ? <Muted>おかえりなさい。登録したときの方法で、ログインしてください。</Muted> : null}
      </View>

      {step !== 'choose' && canPasskey ? (
        <Btn small kind="ghost" label="← 最初の画面にもどる" onPress={() => go('choose')} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      {step === 'choose' ? (
        <View style={{ gap: 14 }}>
          <Card>
            <Lbl>はじめての方</Lbl>
            <Muted>調査官名と、好きなラーメンの好みを登録します。数分で終わります。</Muted>
            <Btn label="新しく登録する" onPress={() => go('new')} />
          </Card>
          <Card>
            <Lbl>登録済みの方</Lbl>
            <Muted>以前に登録した調査官は、パスキーか復旧コードでログインします。</Muted>
            <Btn kind="ghost" label="ログインする" onPress={() => go('login')} />
          </Card>
        </View>
      ) : null}

      {err ? (
        <Card>
          <Text selectable style={{ color: C.crit, fontWeight: '700', lineHeight: 20 }}>{err}</Text>
        </Card>
      ) : null}

      {step === 'login' && canPasskey ? (
        <Card flat>
          <Lbl>登録済みの方のログイン</Lbl>
          <Btn kind="ghost" label={busy ? '確認中…' : 'パスキーでログイン'} onPress={login()} />
          <Btn small kind="ghost" label={showRecovery ? '閉じる' : 'パスキーをなくした・使えない方（復旧コード）'} onPress={() => setShowRecovery(!showRecovery)} style={{ alignSelf: 'flex-start' }} />
          {showRecovery ? (
            <View style={{ gap: 8 }}>
              <Muted>マイページで発行した「復旧コード」（IKRC- で始まる文字列）を貼り付けてください。</Muted>
              <Input value={rcode} onChangeText={setRcode} placeholder="IKRC-…" autoCapitalize="none" autoCorrect={false} />
              <Btn small label={busy ? '確認中…' : '復旧コードでログイン'} onPress={login(true)} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {step === 'new' ? (
      <>
      <Card>
        <Lbl>調査官ID</Lbl>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.indigo, letterSpacing: 1 }}>{S.uid}</Text>
        <Muted>端末内だけで使う場合の仮ID。アカウントを登録すると、正式なIDが発行されます。</Muted>
      </Card>

      <View style={{ gap: 7 }}>
        <Lbl>① 調査官名（本名でなくて構いません）</Lbl>
        <Input value={nick} onChangeText={setNick} placeholder="例：ハラペコ二号" maxLength={16} />
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>② 好きなラーメン（系統・複数選択）</Lbl>
        <Chips>
          {GENRES.map((g) => (
            <Chip key={g} label={g} on={favs.includes(g)} onPress={() => toggle(g)} />
          ))}
        </Chips>
        <Muted>ルーレットや「さがす」で、好みに合う店を優先します（相性%を出します）。</Muted>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>②-2 こってり度の好み（任意）</Lbl>
        <Chips>
          {RICHNESS.map((r, i) => (
            <Chip key={r} label={r} on={rich === i} onPress={() => setRich(rich === i ? null : i)} />
          ))}
        </Chips>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>②-3 麺の太さの好み（任意）</Lbl>
        <Chips>
          {THICKNESS.map((t) => (
            <Chip key={t} label={t} on={thick === t} onPress={() => setThick(thick === t ? '' : t)} />
          ))}
        </Chips>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>②-4 麺の種類の好み（任意）</Lbl>
        <Chips>
          {NOODLE_TYPES.map((t) => (
            <Chip key={t} label={t} on={ntype === t} onPress={() => setNtype(ntype === t ? '' : t)} />
          ))}
        </Chips>
        <Muted>ちぢれ麺はスープをよく持ち上げ、ストレートは喉ごしがよく、平打ちはもちもちです。</Muted>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>②-5 好きなトッピング（複数・任意）</Lbl>
        <Chips>
          {TOPPINGS.map((t) => (
            <Chip key={t} label={t} on={tops.includes(t)} onPress={() => toggleTop(t)} />
          ))}
        </Chips>
        <Muted>口コミで人気のトッピングが合う店ほど、相性が上がります。</Muted>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>③ 国籍</Lbl>
        <Input value={nat} onChangeText={setNat} placeholder="例：日本" maxLength={20} />
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>④ 年代（任意）</Lbl>
        <Chips>
          {AGES.map((a) => (
            <Chip key={a} label={a} on={age === a} onPress={() => setAge(age === a ? '' : a)} />
          ))}
        </Chips>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>⑤ 性別（任意）</Lbl>
        <Chips>
          {GENDERS.map((g) => (
            <Chip key={g} label={g} on={gender === g} onPress={() => setGender(gender === g ? '' : g)} />
          ))}
        </Chips>
      </View>

      <View style={{ gap: 7 }}>
        <Lbl>⑥ アレルギー・苦手（任意）</Lbl>
        <Input value={allergy} onChangeText={setAllergy} placeholder="例：そば、甲殻類" maxLength={80} />
        <Muted>アレルギーはこの端末の中にだけ保存します（サーバには送りません）。身長・体重は、投稿のたびに任意で記録できる項目として別に用意する予定です。</Muted>
      </View>

      <Card>
        <Lbl>⑦ 利用規約への同意</Lbl>
        <Btn small kind={allRead ? 'ghost' : 'solid'} label={allRead ? '📄 もう一度読む' : '📄 利用規約・プライバシーポリシーを読む（必須）'} onPress={() => setShowTerms(true)} style={{ alignSelf: 'flex-start' }} />
        <Muted>
          {allRead
            ? '✓ 利用規約とプライバシーポリシーを、最後まで読みました。'
            : `同意のチェックは、利用規約とプライバシーポリシーを、画面を下まで動かして最後まで読むと入れられます。（利用規約 ${read.terms ? '✓' : '未'}／プライバシーポリシー ${read.privacy ? '✓' : '未'}）`}
        </Muted>
        <Check on={agree} disabled={!allRead} label={CHECKBOX_TEXT} onPress={() => (allRead ? setAgree(!agree) : showToast('先に、利用規約とプライバシーポリシーを最後まで読んでください。'))} />
      </Card>

      {formMsg ? <Text selectable style={{ color: C.crit, fontWeight: '700', lineHeight: 21 }}>⚠ {formMsg}</Text> : null}
      {err ? <Text selectable style={{ color: C.crit, fontWeight: '700', lineHeight: 21 }}>{err}</Text> : null}
      {canPasskey ? (
        <>
          <Btn label={busy ? '登録中…' : 'アカウントを登録する（パスキー・推奨）'} onPress={register} />
          <Muted>
            パスワードもメールも使いません。端末の指紋・顔認証・PINで本人確認します。パスキーは iCloud キーチェーンや
            Google パスワードマネージャーで同期され、機種変更後も使えます。
          </Muted>
          <Btn kind="ghost" label="登録せず、この端末の中だけで使う" onPress={startLocal} />
        </>
      ) : (
        <>
          <Btn label="調査官として登録する" onPress={startLocal} />
          <Muted>この環境ではパスキーを使えないため、端末内だけで保存します（アカウント機能は現在 Web 版のみ）。</Muted>
        </>
      )}
      </>
      ) : null}
      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} read={read} onRead={markRead} />
      <Text style={{ color: C.ink3, fontSize: 11, textAlign: 'center' }}>build {BUILD}</Text>
    </ScrollView>
  );
}
