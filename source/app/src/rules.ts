/**
 * 入力できない品目（ラーメンの丼の中身・トッピング・付け合わせだけを記録するため）。
 * 定食の具材・ご飯・チャーハン・餃子は入力できない。
 * 全角・半角、カタカナ・ひらがなの違いは同じとみなす（例: チャーハン = ちゃーはん）。
 * サーバ（supabase/migrations/0017）にも同じ決まりがある。
 */
const WORDS = [
  '定食', 'ご飯', 'ごはん', 'ライス', '白飯', '炒飯', 'チャーハン', '焼飯', '焼き飯',
  '餃子', 'ぎょうざ', 'ギョウザ', 'ギョーザ',
];

const toHira = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 入力できない語が含まれていれば、その語を返す（なければ null） */
export function findBanned(text: string): string | null {
  const t = toHira(text);
  return WORDS.find((w) => t.includes(toHira(w))) ?? null;
}

export const BANNED_NOTICE = '⚠ 入力できるのは、ラーメンの丼の中身・トッピング・付け合わせだけです。定食の具材、ご飯（ライス）、チャーハン、餃子は入力できません。';
