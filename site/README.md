# jtrans 公式サイト（jtrans.aoiserver.com）

このフォルダは Cloudflare Workers「jtrans-hp」のソースです。

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
- ページの中身は `src/render.mjs`。

## 手元で試す

```
cd site
npm ci
npm run build      # ../jtrans-release-data.json があればそれを使う
npm run dev        # http://localhost:8787
```
