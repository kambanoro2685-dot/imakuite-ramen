// Supabase の接続先。公開鍵(publishable key)はブラウザに配る前提のもので、データは RLS（行レベルセキュリティ）で守る。
// 秘密鍵(secret / service_role)は絶対にここへ入れない。
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://krufiqmyztvwamtkbrvy.supabase.co';
export const SUPABASE_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_02akArRtn231jcrfM3ag1Q_3iB81la7';

// 旧版の試作店（数値ID 1〜8）と shop.id の対応。保存済みデータを移行するためだけに使う
export const shopUuid = (venueId: number) => `00000000-0000-4000-8000-${String(venueId).padStart(12, '0')}`;

// 画面下に表示して、古いキャッシュのページを見ていないか判別するための番号
export const BUILD = '2026-11-01-r26';
