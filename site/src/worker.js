/**
 * All Japanese Translate / jtrans official site — runtime Worker (v7)
 *
 * v7 から全ページ・/api・sitemap は `npm run build` で dist/ に静的生成し、
 * Static Assets がそのまま配信する（Worker は起動しない）。
 * v6 では release-data(約5MB) の JSON.parse と索引作成を Worker が行っており、
 * Workers 無料プランの CPU 上限(10ms/リクエスト) を超えて exceededCpu で
 * 落ちていた（2026-10-30、東京 NRT で /api が 503・バッジが badge error）。
 *
 * この Worker に届くのは「dist/ に該当ファイルが無い」リクエストだけ。
 * 重い処理は一切しない。ここに release-data の取得や整形を戻さないこと。
 */

const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN",
});

export default {
  async fetch(request, env) {
    let page = null;
    try {
      // dist/404.html は html_handling により /404 で配信される。
      page = await env.ASSETS.fetch(new Request(new URL("/404", request.url), { method: "GET" }));
      if (!page.ok) page = null;
    } catch (_) {
      page = null;
    }
    const headers = new Headers(page ? page.headers : { "content-type": "text/plain; charset=UTF-8" });
    headers.set("cache-control", "public, max-age=60");
    headers.delete("etag");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    const body = request.method === "HEAD" ? null : (page ? page.body : "404 Not Found");
    return new Response(body, { status: 404, headers });
  },
};
