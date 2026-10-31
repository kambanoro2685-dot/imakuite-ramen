import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { C, font, web } from './theme';

export function Btn({
  label, onPress, kind = 'solid', small, style,
}: {
  label: string; onPress: () => void; kind?: 'solid' | 'ghost' | 'amber'; small?: boolean; style?: ViewStyle;
}) {
  const bg = kind === 'solid' ? C.indigo : kind === 'amber' ? C.amber : C.surface;
  const edge = kind === 'solid' ? '#1B3566' : kind === 'amber' ? '#8A5410' : C.indigo;
  const fg = kind === 'ghost' ? C.indigo : '#FFFDF2';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        web({ boxShadow: pressed ? 'none' : `0 3px 0 ${edge}` }),
        { backgroundColor: bg, borderColor: edge, paddingVertical: small ? 8 : 13, transform: [{ translateY: pressed ? 2 : 0 }] },
        style,
      ]}
    >
      <Text {...font('head')} style={{ color: fg, fontWeight: '800', fontSize: small ? 13 : 15, textAlign: 'center', letterSpacing: 0.5 }}>{label}</Text>
    </Pressable>
  );
}

/** インデックスシール風の選択肢。選ぶと朱の枠＋インク色が変わる */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.chip, on && { backgroundColor: C.indigo, borderColor: '#1B3566', ...web({ boxShadow: '0 2px 0 #1B3566' }) }]}
    >
      <Text style={{ color: on ? '#FFFDF2' : C.ink2, fontSize: 13, fontWeight: on ? '800' : '500' }}>{label}</Text>
    </Pressable>
  );
}

/** チェックボックス（同意などに使う） */
export function Check({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: on ? C.indigo : C.ink2, backgroundColor: on ? C.indigo : '#FFFEF8', borderRadius: 3, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {on ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, lineHeight: 18 }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 21, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: React.ReactNode }) {
  return <View style={s.chips}>{children}</View>;
}

/** タイプ打ちのラベルシール */
export function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.lblWrap}>
      <Text {...font('mono')} style={s.lbl}>{children}</Text>
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

/** 紙片。上にマスキングテープを貼った体裁。flat は台紙に直接書いた枠 */
export function Card({ children, flat }: { children: React.ReactNode; flat?: boolean }) {
  return (
    <View style={[s.card, web({ boxShadow: '1px 2px 4px rgba(60,45,20,.18)' }), flat && { backgroundColor: C.surface2, borderStyle: 'dashed' }]}>
      {!flat ? <View style={s.tape} /> : null}
      {children}
    </View>
  );
}

export function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.head}>
      <View style={s.headRow}>
        <Text {...font('head')} style={s.h2}>{title}</Text>
        {sub ? <Text {...font('mono')} style={s.sub}>{sub}</Text> : null}
      </View>
      <View style={s.headLine} />
    </View>
  );
}

export function Meter({ pct, color = C.indigo }: { pct: number; color?: string }) {
  return (
    <View style={s.meter}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

export function Faces({
  opts, value, onPick,
}: { opts: [string, string][]; value: string; onPick: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {opts.map(([e, n]) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(on ? '' : n)}
            style={[s.face, web({ boxShadow: '1px 2px 3px rgba(60,45,20,.18)' }), on && { borderColor: C.crit, backgroundColor: '#FFF3EC', transform: [{ rotate: '-2deg' }] }]}
          >
            <Text style={{ fontSize: 24 }}>{e}</Text>
            <Text style={{ fontSize: 10.5, color: on ? C.crit : C.ink2, fontWeight: on ? '800' : '500' }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 記入欄: 下線を引いた書き込み欄 */
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.ink3}
      {...props}
      style={[s.input, props.multiline && { minHeight: 76, textAlignVertical: 'top' }, props.style]}
    />
  );
}

export function Steps({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn small kind="ghost" label="−" onPress={() => onChange(Math.max(min, value - step))} style={{ width: 52 }} />
      <Btn small kind="ghost" label="＋" onPress={() => onChange(Math.min(max, value + step))} style={{ width: 52 }} />
    </View>
  );
}

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>{children}</View>
    </Modal>
  );
}

export const s = StyleSheet.create({
  btn: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7 },
  lblWrap: { alignSelf: 'flex-start', backgroundColor: C.amberSoft, borderWidth: 1, borderColor: '#DDC992', borderRadius: 2, paddingHorizontal: 7, paddingVertical: 2, transform: [{ rotate: '-0.6deg' }] },
  lbl: { fontSize: 11.5, letterSpacing: 0.6, color: '#6B4A12', fontWeight: '700' },
  muted: { fontSize: 12.5, color: C.ink3, lineHeight: 19 },
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 3, padding: 14, paddingTop: 18, gap: 8 },
  tape: { position: 'absolute', top: -8, left: 18, width: 54, height: 15, backgroundColor: 'rgba(232,205,110,0.62)', transform: [{ rotate: '-3deg' }], borderWidth: 0.5, borderColor: 'rgba(160,130,40,0.35)' },
  head: { gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  headLine: { height: 5, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: C.ink },
  h2: { fontSize: 21, color: C.ink, flexShrink: 1, letterSpacing: 1 },
  sub: { fontSize: 11.5, color: C.ink3 },
  meter: { height: 12, borderWidth: 1.5, borderColor: C.ink, backgroundColor: C.surface, overflow: 'hidden' },
  face: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 3, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#FFFFFF' },
  input: { borderWidth: 1, borderBottomWidth: 2, borderColor: C.line, borderBottomColor: C.ink2, backgroundColor: '#FFFEF8', borderRadius: 2, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15, color: C.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,20,10,0.5)' },
  sheet: { backgroundColor: C.ground, padding: 18, gap: 12, borderTopWidth: 3, borderColor: C.ink, maxHeight: '85%' },
});
