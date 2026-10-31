export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** normal=通常 / dim=控えめ / win=ルーレットの当選店 / me=現在地 */
  kind?: 'normal' | 'dim' | 'win' | 'me';
  /** 行った順の番号（軌跡の表示で、ピンに数字を出す） */
  n?: number;
};

export type MapViewProps = {
  height?: number;
  center: { lat: number; lng: number };
  markers: MapMarker[];
  /** 軌跡: この順に線でつなぐ */
  path?: { lat: number; lng: number }[];
  onSelect?: (id: string) => void;
};
