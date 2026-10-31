// 「昔のバインダー」: どんぶり色（赤茶）の表紙・金属のリング・クリーム色の罫線紙・色分けインデックス・朱色のスタンプ。
export const C = {
  // 机（画面の外側）と表紙
  desk: '#4B3A2E',
  cover: '#8A2A1E',
  coverEdge: '#5E1B13',
  // 紙
  ground: '#FAF5E4',
  surface: '#FFFCF2',
  surface2: '#F1EAD2',
  surface3: '#E2D8B8',
  line: '#D9CFB2',
  rule: '#CBD6E8', // 罫線（青）
  margin: '#E7A9A3', // 余白線（赤）
  // 文字（ブルーブラックのインク）
  ink: '#232638',
  ink2: '#474B63',
  ink3: '#777A8F',
  // 色
  indigo: '#9A3324',
  indigoSoft: '#F4DEDA',
  amber: '#B5701A',
  amberSoft: '#F5E7C6',
  good: '#35764A',
  goodSoft: '#DCEBD8',
  warn: '#98600A',
  crit: '#B3342B', // 朱のスタンプ
  // インデックス見出しの色
  tabs: ['#E8B4B0', '#F0CE8E', '#F3B48C', '#BFD8A4', '#A9CBE6', '#CDB5DD', '#D6C9A6', '#E7B0C9', '#B9D9D2', '#EBC3A0'],
};

export const mono = '"IBM Plex Mono", "Courier New", Menlo, monospace';

/** Web 用: data-font 属性でフォントを切り替える（App.tsx で CSS を注入）。ネイティブでは無視される。 */
export const font = (kind: 'head' | 'mono' | 'hand') => ({ dataSet: { font: kind } }) as any;

/** Web 用の box-shadow / 背景（ネイティブでは何もしない） */
export const web = (s: Record<string, unknown>) => s as any;
