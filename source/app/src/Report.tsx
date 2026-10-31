import React, { useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { friendly } from './account';
import { BUILD } from './config';
import { Go, Screen } from './nav';
import { useStore } from './store';
import { supabase } from './supabase';
import { C } from './theme';
import { Btn, Card, Chip, Chips, Head, Input, Lbl, Muted } from './ui';

const CATS: { k: 'bug' | 'request' | 'other'; label: string }[] = [
  { k: 'bug', label: '不具合' },
  { k: 'request', label: '要望・アイデア' },
  { k: 'other', label: 'その他' },
];

export default function Report({ go, from }: { go: Go; from: Screen }) {
  const { S, showToast } = useStore();
  const [cat, setCat] = useState<'bug' | 'request' | 'other'>('bug');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    if (busy) return;
    if (!msg.trim()) { setErr('内容を書いてください。'); return; }
    setBusy(true);
    setErr('');
    const ua = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : Platform.OS;
    const { error } = await supabase.rpc('submit_bug_report', {
      p_category: cat, p_message: msg.trim(), p_screen: from, p_build: BUILD, p_user_agent: ua,
    });
    setBusy(false);
    if (error) {
      setErr(/rate_limited/.test(error.message) ? '送信が多すぎます。しばらくしてからお試しください。' : `送信できませんでした。\n原因: ${friendly(error)}`);
      return;
    }
    setMsg('');
    setDone(true);
    showToast('報告を送りました。ありがとうございます。');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
      <Head title="不具合報告" sub="REPORT" />
      <Muted>
        うまく動かない・表示がおかしい・こうだと便利、などをお知らせください。連絡先は集めません（返信はできません）。
        {S.account ? '\nログイン中のため、調査官IDが報告に添付されます。' : ''}
      </Muted>

      {done ? (
        <Card>
          <Text style={{ color: C.good, fontWeight: '800' }}>✓ 報告を受け付けました。</Text>
          <Muted>続けて別の報告も送れます。</Muted>
          <Btn small kind="ghost" label="もう1件書く" onPress={() => setDone(false)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : (
        <>
          <Lbl>種類</Lbl>
          <Chips>
            {CATS.map((c) => (
              <Chip key={c.k} label={c.label} on={cat === c.k} onPress={() => setCat(c.k)} />
            ))}
          </Chips>

          <Lbl>内容（2000文字まで）</Lbl>
          <Input
            value={msg}
            onChangeText={setMsg}
            multiline
            maxLength={2000}
            placeholder={cat === 'bug' ? 'どの画面で、何をしたら、どうなりましたか？\n例：投稿タブで「提出」を押したら赤い文字が出た' : 'ご意見をどうぞ'}
            style={{ minHeight: 140 }}
          />
          <Muted>{msg.length} / 2000　※ パスワードなどの大事な情報は書かないでください。</Muted>

          {err ? <Text selectable style={{ color: C.crit, fontWeight: '700', lineHeight: 20 }}>{err}</Text> : null}
          <Btn label={busy ? '送信中…' : '報告を送る'} onPress={send} />
        </>
      )}

      <Card flat>
        <Lbl>報告に自動で添えるもの</Lbl>
        <Muted>画面の名前（{from}）、アプリの版（{BUILD}）、ブラウザ・端末の種類。位置情報や投稿の内容は添えません。</Muted>
      </Card>
      <Btn small kind="ghost" label="ヘルプを見る" onPress={() => go('help')} style={{ alignSelf: 'flex-start' }} />
    </ScrollView>
  );
}
