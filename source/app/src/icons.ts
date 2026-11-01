import type { ImageSourcePropType } from 'react-native';

// アイコン画像（assets/ramen-icons。ChatGPTで生成した原本を切り出して 128px に縮小したもの）
export const TAB_ICON: Record<string, ImageSourcePropType> = {
  home: require('../assets/ramen-icons/08_tab_01_home.png'),
  post: require('../assets/ramen-icons/08_tab_02_post.png'),
  palette: require('../assets/ramen-icons/08_tab_03_items.png'),
  search: require('../assets/ramen-icons/08_tab_04_search.png'),
  map: require('../assets/ramen-icons/08_tab_05_map.png'),
  roulette: require('../assets/ramen-icons/08_tab_06_roulette.png'),
  oshi: require('../assets/ramen-icons/08_tab_07_oshi.png'),
  my: require('../assets/ramen-icons/08_tab_08_mypage.png'),
  help: require('../assets/ramen-icons/08_tab_09_help.png'),
  report: require('../assets/ramen-icons/08_tab_10_bugreport.png'),
};

/** 階級バッジ（RANKS の並び順: 見習い→特別監察官） */
export const RANK_ICON: ImageSourcePropType[] = [
  require('../assets/ramen-icons/07_rank_01_0_minarai.png'),
  require('../assets/ramen-icons/07_rank_02_1_sankyu.png'),
  require('../assets/ramen-icons/07_rank_03_2_nikyu.png'),
  require('../assets/ramen-icons/07_rank_04_3_ikkyu.png'),
  require('../assets/ramen-icons/07_rank_05_4_shunin.png'),
  require('../assets/ramen-icons/07_rank_06_5_tokubetsu.png'),
];

/** 選択肢の名前 → アイコン（トッピング・麺・替え玉） */
const CHIP_ICON: Record<string, ImageSourcePropType> = {
  "チャーシュー": require('../assets/ramen-icons/05_topping_01_chashu.png'),
  "味玉": require('../assets/ramen-icons/05_topping_02_ajitama.png'),
  "メンマ": require('../assets/ramen-icons/05_topping_03_menma.png'),
  "ネギ": require('../assets/ramen-icons/05_topping_04_negi.png'),
  "海苔": require('../assets/ramen-icons/05_topping_05_nori.png'),
  "もやし": require('../assets/ramen-icons/05_topping_06_moyashi.png'),
  "ほうれん草": require('../assets/ramen-icons/05_topping_07_horenso.png'),
  "背脂": require('../assets/ramen-icons/05_topping_08_seabura.png'),
  "にんにく": require('../assets/ramen-icons/05_topping_09_ninniku.png'),
  "辛味噌": require('../assets/ramen-icons/05_topping_10_karamiso.png'),
  "なると": require('../assets/ramen-icons/05_topping_11_naruto.png'),
  "きくらげ": require('../assets/ramen-icons/05_topping_12_kikurage.png'),
  "細": require('../assets/ramen-icons/06_noodle_01_thin.png'),
  "中": require('../assets/ramen-icons/06_noodle_02_medium.png'),
  "太": require('../assets/ramen-icons/06_noodle_03_thick.png'),
  "極太": require('../assets/ramen-icons/06_noodle_04_xthick.png'),
  "替え玉あり": require('../assets/ramen-icons/06_noodle_05_kaedama.png'),
  "ちぢれ": require('../assets/ramen-icons/06_noodle_06_chijire.png'),
  "ストレート": require('../assets/ramen-icons/06_noodle_07_straight.png'),
  "平打ち": require('../assets/ramen-icons/06_noodle_08_hiraudchi.png'),
  "固め": require('../assets/ramen-icons/06_noodle_09_firm.png'),
  "柔らかめ": require('../assets/ramen-icons/06_noodle_10_soft.png'),
};

/** 選択肢にアイコンがあれば返す（"細" など短い名前は、麺の項目でだけ使う） */
export function chipIcon(fieldKey: string, label: string): ImageSourcePropType | undefined {
  if (['細', '中', '太', '極太'].includes(label) && fieldKey !== 'thick') return undefined;
  return CHIP_ICON[label];
}
