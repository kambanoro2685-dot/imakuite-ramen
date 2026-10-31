import * as Location from 'expo-location';
import { WEATHER_CODES } from './data';

export type Stamp = { weather: [string, number, number]; enteredAt: number; real: boolean };

// 岡山駅周辺（位置情報が取れない場合のフォールバック）
const FALLBACK = { latitude: 34.6666, longitude: 133.9183 };

export async function stampNow(): Promise<Stamp> {
  let coords: { latitude: number; longitude: number } = FALLBACK;
  let located = false;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({});
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      located = true;
    }
  } catch {
    // 権限なし・取得失敗は無視してフォールバック
  }
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' + coords.latitude +
      '&longitude=' + coords.longitude +
      '&current=temperature_2m,weather_code,surface_pressure';
    const res = await fetch(url);
    const j = await res.json();
    const cur = j.current;
    const label = WEATHER_CODES[cur.weather_code as number] ?? '☁️ くもり';
    return {
      weather: [label, Math.round(cur.temperature_2m), Math.round(cur.surface_pressure)],
      enteredAt: Date.now(),
      real: located,
    };
  } catch {
    return { weather: ['☁️ 取得できず', 0, 0], enteredAt: Date.now(), real: false };
  }
}
