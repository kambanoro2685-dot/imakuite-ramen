# Supabase / GitHub Pages 設定手順

ImaKuite!Inspector! は、バックエンドを **Supabase**（認証 + Postgres）、公開を **GitHub Pages** で行います。
PHP + MySQL（`server/`）は旧案として残してありますが、使いません。

- アプリ（Web版）: https://kambanoro2685-dot.github.io/imakuite-inspector/app/
- Supabase プロジェクト: `https://ehtjtapkmwmsciuexdko.supabase.co`

## 1. データベースを作る（SQL を貼って実行）

Supabase ダッシュボード → **SQL Editor** で、次の順に実行します。1回だけです。
同名のテーブルが既にあるとエラーで止まり、何も壊しません。

1. `supabase/migrations/0001_init.sql` — テーブル・RLS（行レベルセキュリティ）・関数
2. `supabase/migrations/0002_seed_shops.sql` — サンプル店舗 8 件（開発用）
3. `supabase/migrations/0003_bug_report.sql` — 不具合報告（アプリの「不具合報告」タブの保存先）
4. `supabase/migrations/0004_rank_gated_points.sql` — 階級ごとの詳細項目の加点（階級が足りない項目は加点しない）

届いた報告は、**Table Editor → `bug_report`** で読めます（`status` を `triaged` / `closed` に変えて管理できます）。報告者の連絡先は集めていないため返信はできません。

実行後、**Table Editor** に `inspector` `shop` `visit` などが並び、各テーブルに「RLS enabled」が付いていれば成功です。

## 2. 認証を有効にする

**Authentication** で次の設定をします。

| 設定 | 値 |
|---|---|
| Sign In / Providers → **Confirm email** | **OFF**（合成メールで登録するため。下の説明を参照） |
| **Passkeys**（ベータ）→ Enable passkey authentication | ON |
| ↳ Relying Party Display Name | `ImaKuite!Inspector!` |
| ↳ Relying Party ID | `kambanoro2685-dot.github.io` |
| ↳ Relying Party Origins | `https://kambanoro2685-dot.github.io` |

仕組み: Supabase は**匿名ユーザーにパスキーを付けられない**ため（403 `Anonymous user not allowed`）、登録時に使い捨ての合成メール（`<ランダム>@users.imakuite.invalid`）とランダムなパスワードで通常アカウントを作り、その上にパスキーを登録します。
メールは実在せず、パスワードは誰も知りません（保存もしません）。以後のログインはパスキーだけです。氏名・実際のメール・電話は保存しません。
匿名サインイン（Allow anonymous sign-ins）は不要です。オフにして構いません。

### 注意

- **Relying Party ID は後から変えられません。** 変えると全員のパスキーが使えなくなります。独自ドメインへ移す予定があるなら、公開前にそのドメインを設定してください。
- `localhost` でのパスキー検証はできません（RP ID が GitHub Pages のドメインのため）。パスキーの確認は公開後の URL で行います。パスキー以外の機能は `npx expo start --web` でも動きます。
- 新規登録は誰でも作れます（メール確認がないため）。ボット対策として、**Authentication → Rate Limits** と **Attack Protection（CAPTCHA）** の設定を推奨します。
- パスキーは Supabase Auth のベータ機能です。仕様が変わる可能性があります。
- **旧案にあった「24語の復旧キー」はありません。** パスキーは iCloud キーチェーン / Google パスワードマネージャーで同期されますが、同期されない端末でパスキーを失うとアカウントに戻れません。必要になれば、任意のメール紐づけ（`auth.updateUser`）などを後から足せます。

## 3. 動作確認

1. 公開 URL を開き（以前に試して途中で止まった端末は、ブラウザの保存データを消してから）、「アカウントを登録する（パスキー・推奨）」を押す。
2. 端末の指紋・顔認証・PIN で確認 → 調査官ID（`IKI-XXXX-XXXX`）が発行される。
3. 「入店を記録する」→ 店を選んで投稿 → ヘッダーのポイントがサーバ計算の値に変わる。
4. マイページ →「ログアウト」→「パスキーでログイン」で戻れる。

Supabase の **Table Editor** で `visit` / `point_ledger` に行が増えていることも確認できます。

## 4. 安全面の設計

- ブラウザに配る鍵は **publishable key** だけです（公開前提の鍵）。`secret` / `service_role` キーは、コードにもリポジトリにも置いていません。置かないでください。
- データの保護は RLS で行います。クライアントは、ポイント台帳・階級・信頼度・提出状態を**直接書けません**（列権限とポリシーで禁止。関数経由のみ）。
- 他人の評価は件数・平均の集計としてしか返らず、3件未満は `null` です。
- 天気・気温・気圧は端末が Open-Meteo から取得した**申告値**です（サーバ側の検証はありません）。
- テスト: `cd supabase && npm install && npm test`（Postgres をローカルで起動して 61 項目を検証）。

## 5. 未実装（次の作業）

写真アップロード（Supabase Storage）／評価一覧のランク別表示／指摘・検証／サーバ側ルーレット／ポイントの仮→確定（pg_cron）／減点・信頼度の自動更新／店舗マスタの OSM 取り込み／ネイティブ版のパスキー。
