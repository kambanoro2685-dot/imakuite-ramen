export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** normal=通常 / dim=控えめ / win=ルーレットの当選店 / me=現在地 */
  kind?: 'normal' | 'dim' | 'win' | 'me';
};

export type MapViewProps = {
  height?: number;
  center: { lat: number; lng: number };
  markers: MapMarker[];
  onSelect?: (id: string) => void;
};
