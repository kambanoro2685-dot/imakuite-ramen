import React from 'react';
import { Text } from 'react-native';
import { openUrl } from './maps';
import { Btn, Card, Muted } from './ui';
import { C } from './theme';
import { MapViewProps } from './MapView.types';

// ネイティブ（iOS/Android）の地図は未対応（Web 版は MapView.web.tsx）。Google マップを開く案内だけ出す。
export default function MapView({ center, markers }: MapViewProps) {
  const first = markers.find((m) => m.kind === 'win') ?? markers[0];
  const at = first ?? { ...center, label: '' };
  return (
    <Card flat>
      <Text style={{ color: C.ink, fontWeight: '800' }}>🗺️ 地図はWeb版で表示できます</Text>
      <Muted>このアプリでは、地図の表示は現在 Web 版のみ対応です。</Muted>
      <Btn small kind="ghost" label="Googleマップで開く" onPress={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`)} />
    </Card>
  );
}
