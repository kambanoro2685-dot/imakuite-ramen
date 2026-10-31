# ImaKuite!Ramen! 進み具合（2026-10-31）

旧アプリ「ImaKuite!Inspector!」（`../imakuite/`・公開中）はそのまま残し、ラーメン専門版を別に作りました。

## できていること

- **アプリ**: `app/`（Expo / Web）。名前は「ImaKuite!Ramen!」、表紙は赤茶。ビルド `dist` まで作成済み（`BUILD 2026-10-31-r1`）。
- **ラーメン専用の項目**: スープの系統・濃さ・麺の太さ・麺の硬さ・替え玉・トッピング（階級で解放。ポイントはサーバが付与）。
- **好みのマッチング**: 登録時に「好きな系統・こってり度・麺の太さ」を選ぶと、店ごとに相性%を表示（さがす・ルーレット・ホーム）。口コミ3件以上の店は、口コミ（多いスープ・濃さの平均・麺の太さ）から計算。まだの店は店名から推定した系統だけ。
- **推し・ランキング・階級・規約・復旧コード**: 旧アプリの機能を引き継ぎ。
- **店データ**: 岡山市中心部のラーメン店 143 件（OpenStreetMap。系統は店名から推定）。
- **サーバ**: 新しい Supabase プロジェクト `imakuite-ramen`（ref `krufiqmyztvwamtkbrvy`）。DB（0001〜0013）適用済み、メール確認オフ、パスキー有効（RP ID `kambanoro2685-dot.github.io`）。旧アプリのアカウント・データとは完全に別。
- **テスト**: DBテスト 164 件合格。新サーバで、登録 → 投稿（ラーメン項目）→ 提出 → ポイント付与 → アカウント削除まで通ることを確認。

## まだのこと

1. **GitHub の新リポジトリと公開**（下記）。この環境の権限判定で、リポジトリ作成が拒否されました。
2. 公開後の、実機（パスキー登録・投稿）での確認。
3. 利用規約・プライバシーの弁護士確認（草案のまま）。

## 公開の手順（リポジトリを作ったあと）

1. GitHub で `kambanoro2685-dot/imakuite-ramen` を作る（公開、空でよい。Pages 用）。
2. `app/dist/` の中身をそのリポジトリの `docs/` か `gh-pages` に置き、Pages を有効にする（`app.json` の baseUrl は `/imakuite-ramen`）。
3. 公開URL: `https://kambanoro2685-dot.github.io/imakuite-ramen/`
4. パスキーの許可オリジンは `https://kambanoro2685-dot.github.io`（設定済み。ドメインが変わるなら Supabase の Authentication > Passkeys を直す）。

## 旧アプリとの違い（要点）

| | 旧 | ラーメン版 |
|---|---|---|
| 対象 | 飲食店全般 | ラーメン |
| 好み | 料理ジャンル | 系統・こってり度・麺の太さ |
| 店データ | 864 件 | ラーメン 143 件 |
| サーバ | ehtjtapkmwmsciuexdko | krufiqmyztvwamtkbrvy |
| 端末内の保存キー | imakuite_v1 | imakuite_ramen_v1 |
