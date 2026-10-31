import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PRIVACY, Section, TERMS, TERMS_VERSION } from './terms';
import { C, font } from './theme';
import { Btn, Chip, Chips, Muted, Sheet } from './ui';

function Doc({ sections }: { sections: Section[] }) {
  return (
    <View style={{ gap: 14 }}>
      {sections.map((s) => (
        <View key={s.title} style={{ gap: 5 }}>
          <Text {...font('head')} style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>{s.title}</Text>
          {s.body.map((b, i) => (
            <Text key={i} style={{ fontSize: 13, lineHeight: 21, color: C.ink2 }}>{b}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 利用規約・プライバシーポリシーを読む（切り替えられる） */
export function TermsSheet({ visible, onClose, initial = 'terms' }: { visible: boolean; onClose: () => void; initial?: 'terms' | 'privacy' }) {
  const [tab, setTab] = useState<'terms' | 'privacy'>(initial);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text {...font('head')} style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>規約とポリシー</Text>
      <Muted>版: {TERMS_VERSION}　※ 試験運用版です。正式公開前に見直します。</Muted>
      <Chips>
        <Chip label="利用規約" on={tab === 'terms'} onPress={() => setTab('terms')} />
        <Chip label="プライバシーポリシー" on={tab === 'privacy'} onPress={() => setTab('privacy')} />
      </Chips>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
        <Doc sections={tab === 'terms' ? TERMS : PRIVACY} />
      </ScrollView>
      <Btn label="閉じる" onPress={onClose} />
    </Sheet>
  );
}
