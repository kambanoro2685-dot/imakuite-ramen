import { Linking } from 'react-native';

export type Place = { n: string; lat: number; lng: number };

/** Google マップで店を開く（APIキー不要の公開URL。店名＋座標で検索する） */
export const googleMapsUrl = (p: Place) =>
  `https://www.google.com/maps/search/${encodeURIComponent(p.n)}/@${p.lat},${p.lng},18z`;

/** Google マップの徒歩ルート案内 */
export const googleRouteUrl = (p: Place) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;

export const openUrl = (url: string) => Linking.openURL(url).catch(() => {});
