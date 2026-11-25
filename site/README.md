# jtrans 公式サイト（jtrans.aoiserver.com）

このフォルダは Cloudflare Workers「jtrans-hp」のソースです。
デザインの方針と規格は Claude Docs「jtrans 公式サイト 企画書・設計書」にまとめています。

## 更新のしかた

1. リポジトリ直下の `jtrans-release-data.json` を更新して GitHub に上げる
2. Cloudflare Workers Builds が自動でビルド・デプロイする（2〜3分）
   - ビルドは `site/` で `npm ci && npm run build`、デプロイは `npx wrangler deploy`
   - ビルドは push されたコミットの `../jtrans-release-data.json` を使う
3. サイト・`/api/release-data.json`・バッジ（badge.aoiserver.com）が新しいデータになる

## しくみ（v7）

- `scripts/build.mjs` が release-data から全ページ（MOD・環境・ガイド・トップ）・
  サイトマップ・`/api/release-data.json`・`/api/badge-stats.json` を `dist/` に静的生成する。
- 実行時の Worker（`src/worker.js`）は存在しないURLに 404 を返すだけ。
  Workers 無料プランの CPU 上限（10ms/リクエスト）を超えないよう、
  release-data の取得や整形を Worker に戻さないこと。
- ページの中身は `src/render.mjs`（MOD・バージョン別・導入ガイド・404）と `src/index.html`（トップ）。

## ファイルの役割

| ファイル | 役割 |
| --- | --- |
| `src/assets/palette.css` | 色・書体・寸法の変数（設計書の表と同じ値） |
| `src/assets/site.css` | トップページ |
| `src/assets/seo-pages.css` | MOD・バージョン別・導入ガイド・404 |
| `src/assets/app.js` | トップの検索・絞り込み・一覧 |
| `src/assets/ui.js` | TOPボタン、タイトルの構築線の位置合わせなどの小さな補助 |
| `scripts/wordmark.py` | トップのタイトル文字（ロゴタイプ）を円と直線から生成し、`src/index.html` に書き込む。要 `pip install shapely` |
| `static/jtrans-mon.svg` | 紋（ロゴ）の元データ。色は #C50413 |
| `static/jtrans-grid.svg` | 各ページ見出しの背景（紋の構築線） |
| `static/og-image-2.png` | SNS共有用の画像（1200×630） |

画像を差し替えるときは、30日キャッシュされるのでファイル名を変えること。

## 手元で試す

```
cd site
npm ci
npm run build      # ../jtrans-release-data.json があればそれを使う
npm run dev        # http://localhost:8787
```
