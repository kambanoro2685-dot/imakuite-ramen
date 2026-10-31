import React, { useRef, useState } from 'react';
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
export type ReadState = { terms: boolean; privacy: boolean };
export const NOT_READ: ReadState = { terms: false, privacy: false };

/**
 * 利用規約・プライバシーポリシーを読む（切り替えられる）。
 * read / onRead を渡すと、文書の最後までスクロールしたときに onRead が呼ばれる（同意のチェックを許可する条件に使う）。
 */
export function TermsSheet({ visible, onClose, initial = 'terms', read, onRead }: { visible: boolean; onClose: () => void; initial?: 'terms' | 'privacy'; read?: ReadState; onRead?: (which: 'terms' | 'privacy') => void }) {
  const [tab, setTab] = useState<'terms' | 'privacy'>(initial);
  const size = useRef({ view: 0, content: 0 });
  const gate = !!onRead;
  const check = (y: number) => {
    const { view, content } = size.current;
    if (gate && view > 0 && content > 0 && y + view >= content - 24) onRead!(tab);
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text {...font('head')} style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>規約とポリシー</Text>
      <Muted>版: {TERMS_VERSION}　※ 試験運用版です。正式公開前に見直します。</Muted>
      <Chips>
        <Chip label="利用規約" on={tab === 'terms'} onPress={() => setTab('terms')} />
        <Chip label="プライバシーポリシー" on={tab === 'privacy'} onPress={() => setTab('privacy')} />
      </Chips>
      {gate ? (
        <Muted>
          {read?.[tab] ? '✓ この文書は、最後まで読みました。' : '⬇ 画面を下まで動かして、最後まで読んでください。'}
          {'　'}
          （利用規約 {read?.terms ? '✓' : '未'}／プライバシーポリシー {read?.privacy ? '✓' : '未'}）
        </Muted>
      ) : null}
      <ScrollView
        key={tab}
        style={{ maxHeight: 420 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        scrollEventThrottle={50}
        onLayout={(e) => { size.current.view = e.nativeEvent.layout.height; check(0); }}
        onContentSizeChange={(_w, h) => { size.current.content = h; check(0); }}
        onScroll={(e) => {
          const m = e.nativeEvent;
          // イベントが持つ寸法で判定する（レイアウトの通知を待たない）
          if (gate && m.layoutMeasurement.height > 0 && m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - 24) onRead!(tab);
        }}
      >
        <Doc sections={tab === 'terms' ? TERMS : PRIVACY} />
      </ScrollView>
      <Btn label="閉じる" onPress={onClose} />
    </Sheet>
  );
}
