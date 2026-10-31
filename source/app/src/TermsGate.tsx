import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useStore } from './store';
import { CHECKBOX_TEXT, TERMS_VERSION } from './terms';
import { TermsSheet } from './TermsSheet';
import { C, font } from './theme';
import { Btn, Card, Check, Head, Muted } from './ui';

/** 規約が新しい版になったとき（または未同意のとき）、同意するまで先へ進めない画面 */
export default function TermsGate() {
  const { S, update, reset } = useStore();
  const [agree, setAgree] = useState(false);
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const updated = !!S.terms; // 以前に別の版へ同意している

  const accept = () => {
    if (!agree) return;
    // アカウントがあるときは、サーバへの記録を後で送る（接続できなくても使える）
    update((s) => ({ ...s, terms: { version: TERMS_VERSION, at: Date.now(), synced: !s.account } }));
  };

  if (declined) {
    return (
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <Head title="ご利用いただけません" />
        <Muted>規約に同意いただけない場合、本サービスはご利用いただけません。</Muted>
        <Muted>
          この端末の保存データ（下書き・好み・ログイン状態）を消して終了できます。サーバにアカウントがある場合は、あとで再度ログインして同意すれば、元に戻せます。
          アカウント自体を消したい場合は、一度同意したうえでマイページの「アカウントを削除」を使ってください。
        </Muted>
        <Btn kind="ghost" label="この端末のデータを消す" onPress={reset} />
        <Btn label="規約にもどる" onPress={() => setDeclined(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Head title={updated ? '規約が更新されました' : '利用規約の確認'} sub={TERMS_VERSION} />
      <Muted>
        {updated
          ? '利用規約・プライバシーポリシーが新しくなりました。続けて使うには、もう一度ご確認のうえ同意してください。'
          : 'ご利用の前に、利用規約とプライバシーポリシーをご確認ください。'}
      </Muted>
      <Card>
        <Text {...font('head')} style={{ fontWeight: '800', color: C.ink }}>要点</Text>
        <Text style={{ fontSize: 13, lineHeight: 21, color: C.ink2 }}>
          {'・氏名・住所・電話・メールは集めません。\n'}
          {'・調査記録は、名前を伏せて他の調査官に表示されます。\n'}
          {'・写真は公開の保存領域に置かれます。人の顔や個人が分かる情報は写さないでください。\n'}
          {'・ポイントは現金などと交換できません（見られる範囲と称号のためのもの）。\n'}
          {'・店の情報は古いことがあります。アレルギーは、必ず店に確認してください。\n'}
          {'・パスキーを失うと、アカウントに戻れないことがあります。\n'}
          {'・いつでも、マイページからアカウントを削除できます。'}
        </Text>
      </Card>
      <Btn kind="ghost" label="📄 利用規約・プライバシーポリシーを読む" onPress={() => setOpen(true)} />
      <Check on={agree} label={CHECKBOX_TEXT} onPress={() => setAgree(!agree)} />
      <Btn label="同意して使う" onPress={accept} style={{ opacity: agree ? 1 : 0.45 }} />
      <Btn small kind="ghost" label="同意しない" onPress={() => setDeclined(true)} style={{ alignSelf: 'flex-start' }} />
      <Muted>※ 試験運用版の規約です。正式公開前に見直します。</Muted>
      <TermsSheet visible={open} onClose={() => setOpen(false)} />
    </ScrollView>
  );
}
