import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { C } from './theme';
import { MapMarker, MapViewProps } from './MapView.types';

// 地図は Leaflet + OpenStreetMap。データ・タイルの出典表示（© OpenStreetMap contributors）は必須。
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
let loader: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET}/leaflet.min.css`;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = `${LEAFLET}/leaflet.min.js`;
      js.onload = () => resolve(w.L);
      js.onerror = () => { loader = null; reject(new Error('地図ライブラリを読み込めませんでした')); };
      document.head.appendChild(js);
    });
  }
  return loader;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function MapView({ height = 260, center, markers, path, onSelect }: MapViewProps) {
  const pathRef = useRef(path);
  pathRef.current = path;
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([center.lat, center.lng], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setTimeout(() => map.current?.invalidateSize(), 50);
      draw(L);
    }).catch(() => {});
    return () => {
      dead = true;
      if (map.current) { map.current.remove(); map.current = null; layer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = markers.map((m) => `${m.id}:${m.kind}:${m.n ?? ''}`).join('|') + `@${center.lat},${center.lng}` + `#${(path ?? []).map((p) => `${p.lat},${p.lng}`).join(';')}`;
  useEffect(() => {
    const L = (window as any).L;
    if (L && map.current) draw(L);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function draw(L: any) {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: [number, number][] = [];
    // 軌跡（行った順に線でつなぐ）。ピンより下に描く
    const tr = pathRef.current;
    if (tr && tr.length > 1) {
      L.polyline(tr.map((p) => [p.lat, p.lng]), { color: C.crit, weight: 3, opacity: 0.85, dashArray: '8 6' }).addTo(layer.current);
      // 行った順に、各区間の真ん中へ矢印（▶）を置く。向きは、投影した画面上の角度（拡大しても変わらない）
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1];
        const b = tr[i];
        const pa = map.current.project([a.lat, a.lng], 15);
        const pb = map.current.project([b.lat, b.lng], 15);
        const deg = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
        L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
          interactive: false,
          icon: L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;transform:rotate(${deg}deg);color:${C.crit};font-size:20px;line-height:1;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">▶</div>`,
          }),
        }).addTo(layer.current);
      }
    }
    const add = (m: MapMarker) => {
      const ll: [number, number] = [m.lat, m.lng];
      pts.push(ll);
      let mk: any;
      if (m.kind === 'win') {
        mk = L.marker(ll, {
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: '',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            html: `<div style="width:34px;height:34px;border-radius:50%;background:${C.crit};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:18px">🎯</div>`,
          }),
        });
      } else if (m.kind === 'me') {
        mk = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1E88E5', fillOpacity: 1 });
      } else if (m.n != null) {
        mk = L.marker(ll, {
          icon: L.divIcon({
            className: '',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            html: `<div style="width:26px;height:26px;border-radius:50%;background:${C.indigo};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center">${m.n}</div>`,
          }),
        });
      } else if (m.kind === 'dim') {
        mk = L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#8E97B3', fillOpacity: 0.85 });
      } else {
        mk = L.circleMarker(ll, { radius: 6, color: '#fff', weight: 2, fillColor: C.indigo, fillOpacity: 1 });
      }
      if (m.label) mk.bindTooltip(esc(m.label), { permanent: m.kind === 'win', direction: 'top', offset: [0, m.kind === 'win' ? -16 : -4] });
      if (m.id && m.kind !== 'me') mk.on('click', () => cb.current?.(m.id));
      mk.addTo(layer.current);
    };
    // 先に目立たないものを描き、最後に主役を重ねる
    [...markers].sort((a, b) => rank(a.kind) - rank(b.kind)).forEach(add);
    if (pts.length > 1) map.current.fitBounds(pts, { padding: [28, 28], maxZoom: 17 });
    else if (pts.length === 1) map.current.setView(pts[0], 17);
    else map.current.setView([center.lat, center.lng], 15);
  }

  return (
    <View style={{ height, borderWidth: 2, borderColor: C.ink2, backgroundColor: '#E8E4D6', overflow: 'hidden' }}>
      <div ref={el} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

const rank = (k?: string) => (k === 'dim' ? 0 : k === 'me' ? 1 : k === 'win' ? 3 : 2);
