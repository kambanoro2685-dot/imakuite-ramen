import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { RANKS } from './data';
import { Go } from './nav';
import { rankOf, useStore } from './store';
import { C, font, mono } from './theme';
import { TermsSheet } from './TermsSheet';
import { Btn, Card, Head, Lbl, Meter, Muted } from './ui';

// サーバが計算するポイント（supabase/migrations/0001_init.sql の submit_visit と一致させる）
const POINTS: { n: string; pt: string; note?: string }[] = [
  { n: '基本提出', pt: '+10' },
  { n: '自分は未踏の店で投稿', pt: '+30' },
  { n: '一杯カード（品名）', pt: '+8', note: '1来店で最大5枚' },
  { n: 'スープの系統を選ぶ', pt: '+5' },
  { n: '写真（1枚ごと・最大3枚）', pt: '+5', note: 'Web版・アカウント登録時にサーバへ保存' },
  { n: '【三等〜】清掃5項目をそろえる', pt: '+15' },
  { n: '【三等〜】環境（静かさ＋待ち時間）', pt: '+10' },
  { n: '【三等〜】体調（入店前の空腹＋食後の満腹）', pt: '+6' },
  { n: '【三等〜】濃さ・麺の太さ・麺の硬さをそろえる', pt: '+8' },
  { n: '【二等〜】スープの味の分析（甘み・塩気・酸味・苦み・うま味・辛さのうち3つ以上）', pt: '+8' },
  { n: '【二等〜】接客＋提供までの時間', pt: '+5' },
  { n: '【一等〜】品質4項目（香り・食感・温度・盛り付け）', pt: '+10' },
  { n: '【一等〜】混み具合＋支払い方法＋喫煙', pt: '+6' },
  { n: '【主任〜】騒音の測定', pt: '+5' },
  { n: '新しい店を登録', pt: '+100', note: '※登録画面は準備中' },
  { n: '自分で誤りを訂正（提出後72時間以内）', pt: '+3' },
  { n: 'ルーレットの店に行って投稿', pt: '+25', note: '※サーバ側の判定は準備中' },
  { n: '他の人の誤りを指摘して採用', pt: '+40', note: '※準備中' },
  { n: '誤情報と確定される', pt: '−50', note: '信頼スコアも下がる。※準備中' },
];

const TRUST: [string, string][] = [
  ['80〜100', '認定インスペクター。推薦への重み ×1.5。検証者になれる'],
  ['60〜79', '良好。推薦への重み ×1.2'],
  ['40〜59', '標準（はじめは50）。重み ×1.0'],
  ['20〜39', '要確認。重み ×0.5。投稿に「未検証」の表示'],
  ['0〜19', '保留。重み ×0.1。推薦には使われない'],
];

const STEPS = [
  ['入店を記録する', 'ホームの「入店を記録する」を押すと、時刻・天気・気温・気圧（と、許可すれば現在地）をまとめて記録します。'],
  ['調査報告書を書く', '「投稿」タブで、店・食べたもの・満足度を入れます。ここまでで提出できます。'],
  ['入力項目を増やす', '「入力項目」タブで、使いたい項目をONにすると、投稿画面に増えます。入力した分だけポイントが増えます。'],
  ['提出する', '提出すると、ポイントがサーバで計算されて階級が上がっていきます。間違いは、あとから「訂正」できます（履歴が残ります）。'],
  ['迷ったらルーレット', '行く店が決まらないときは「ルーレット」タブへ。行った後の感想で、当たり・外れも記録できます。'],
];

const FAQ: [string, string][] = [
  ['本名や連絡先は必要ですか？', '不要です。調査官名（ニックネーム）だけで使えます。氏名・住所・電話・メールは集めません。'],
  ['アレルギーの情報はどこに保存されますか？', 'この端末の中だけです。サーバには送りません。'],
  ['地図には何が表示されますか？', '「地図」タブは、最初は空です。調査報告を提出した店が1件ずつ追加され、あなたが歩いた場所だけが地図に増えていきます。ルーレットの当選店は、行く前でも地図で確認できます。'],
  ['写真に位置情報は残りますか？', '残りません。端末で縮小・再エンコードするときに、撮影場所や機種などの情報(EXIF)を取り除いてから保存します。ただし顔のぼかしはまだ無いので、人の顔が写らないように撮影してください。写真はサーバの公開領域に保存されます。'],
  ['評価の「██████」（黒塗り）は何ですか？', '店の詳細で、他の調査官の評価の一部が伏せ字になっています。理由は2つです。①階級が足りない項目（例: 味は二等から）。②あなたがまだ一度も入力したことがない項目（入力すると、他の人の同じ項目が読めるようになります）。調査官の名前は出ず、階級と信頼スコアだけが表示されます。'],
  ['ポイントは換金できますか？', 'できません。ポイントで得られるのは、見られる情報の範囲（権限）と称号だけです。'],
  ['機種変更・端末の紛失は？', 'パスキーが iCloud キーチェーンや Google パスワードマネージャーで同期されていれば、新しい端末で「パスキーでログイン」できます。同期されていない端末でパスキーを失うと、戻れません。'],
  ['データを消したい', 'マイページの「アカウントを削除」で、パスキーとプロフィールが消えます。過去の調査記録は、個人と結びつかない匿名の統計として残ります。'],
];

export default function Help({ go }: { go: Go }) {
  const { S } = useStore();
  const [showTerms, setShowTerms] = useState(false);
  const cur = rankOf(S.pt);
  const idx = RANKS.indexOf(cur);
  const next = RANKS[idx + 1];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 36 }}>
      <Head title="ヘルプ" sub="HELP" />

      <Card>
        <Lbl>あなたの現在地</Lbl>
        <Text {...font('head')} style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{cur.n}</Text>
        <Muted>{S.pt.toLocaleString()}pt ／ {next ? `次の「${next.n}」まであと ${(next.at - S.pt).toLocaleString()}pt` : '最上位です'}</Muted>
        <Meter pct={next ? ((S.pt - cur.at) / (next.at - cur.at)) * 100 : 100} />
      </Card>

      <View style={{ gap: 8 }}>
        <Lbl>階級の進み方</Lbl>
        {RANKS.map((r, i) => {
          const done = S.pt >= r.at && i < idx;
          const here = i === idx;
          return (
            <View
              key={r.n}
              style={{
                flexDirection: 'row', gap: 10, padding: 11, borderWidth: 1.5, borderRadius: 3,
                borderColor: here ? C.crit : C.line, backgroundColor: here ? '#FFF3EC' : C.surface,
              }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: here || done ? C.crit : C.line }}>
                <Text style={{ fontWeight: '800', color: here || done ? C.crit : C.ink3 }}>{done ? '✓' : i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text {...font('head')} style={{ fontWeight: '800', color: C.ink, flexShrink: 1 }}>{r.n}{here ? '　◀ 現在' : ''}</Text>
                  <Text style={{ fontFamily: mono, fontSize: 12, color: C.ink3 }}>{r.at.toLocaleString()}pt〜</Text>
                </View>
                <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>{r.unlock}</Text>
              </View>
            </View>
          );
        })}
        <Muted>階級が低いうちは、自分が調べた範囲の情報だけが見えます。見えない部分は黒塗り（███）で表示されます。</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>ポイントの付き方</Lbl>
        <Card>
          {POINTS.map((p) => (
            <View key={p.n} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 13.5 }}>{p.n}</Text>
                {p.note ? <Text style={{ color: C.ink3, fontSize: 11.5 }}>{p.note}</Text> : null}
              </View>
              <Text style={{ fontFamily: mono, fontWeight: '800', color: p.pt.startsWith('−') ? C.crit : C.good }}>{p.pt}</Text>
            </View>
          ))}
        </Card>
        <Muted>階級が足りない詳細項目は、入力欄が出ません（出ても加点されません）。階級が上がると「入力項目」タブに新しい項目が解放されます。アカウントを登録している場合、ポイントはサーバが計算します。端末内だけで使う場合の点数は目安です。</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>信頼スコア</Lbl>
        <Card>
          {TRUST.map(([r, d]) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: mono, fontWeight: '800', color: C.indigo, width: 64 }}>{r}</Text>
              <Text style={{ flex: 1, color: C.ink2, fontSize: 12.5, lineHeight: 18 }}>{d}</Text>
            </View>
          ))}
        </Card>
        <Muted>正確な投稿を続けると上がり、誤りが確定すると下がります。最上位の「特別監察官」には、ポイントに加えて信頼スコアの条件があります。</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>使い方</Lbl>
        {STEPS.map(([t, d], i) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ fontFamily: mono, fontWeight: '800', color: C.crit, width: 22 }}>{i + 1}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{t}</Text>
              <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 19 }}>{d}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Lbl>よくある質問</Lbl>
        {FAQ.map(([q, a]) => (
          <Card key={q}>
            <Text style={{ fontWeight: '800', color: C.ink }}>Q. {q}</Text>
            <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 19 }}>{a}</Text>
          </Card>
        ))}
      </View>

      <Btn kind="ghost" label="困ったとき・見つけた不具合は「不具合報告」へ" onPress={() => go('report')} />
      <Btn kind="ghost" label="📄 利用規約・プライバシーポリシー" onPress={() => setShowTerms(true)} />
      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} />
    </ScrollView>
  );
}
