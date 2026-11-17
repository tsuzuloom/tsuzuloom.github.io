// RevenueCat の購読状態を Supabase の entitlements に反映する関数
//
// 呼ばれ方は2つ:
//   1) RevenueCat の Webhook（更新・解約・返金・期限切れのたびに届く）
//      Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>
//   2) アプリ（購入・復元の直後や起動時）
//      Authorization: Bearer <ログイン中ユーザーの Supabase アクセストークン>
//      → そのユーザー本人の分だけ反映する
//
// どちらの場合も、通知の中身は信用せず、RevenueCat の API に「今の状態」を聞き直してから書き込む。
// source = 'owner'（運営者本人）の行は上書きしない。
//
// 必要なシークレット（Supabase の Edge Functions → Secrets で設定）:
//   REVENUECAT_SECRET_KEY    RevenueCat の Secret API key（v1, sk_ で始まるもの）
//   REVENUECAT_WEBHOOK_AUTH  RevenueCat の Webhook 設定に入れる合言葉（長いランダム文字列）
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は自動で入っている。
//
// デプロイ時は「JWT の検証」をオフにする（Webhook は Supabase のトークンを持っていないため）。
// その代わり、この関数の中で上の2通りの認証をしている。

import { createClient } from "npm:@supabase/supabase-js@2";

const ENTITLEMENT_ID = "premium";
const RC_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";
const HOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// 長さの違いも含めて、文字列を一定時間で比べる
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

type SyncResult = { user_id: string; premium?: boolean; expires_at?: string | null; skipped?: string };

async function syncUser(userId: string): Promise<SyncResult> {
  if (!UUID.test(userId)) return { user_id: userId, skipped: "not a Tsuzu Loom user id" };

  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${RC_KEY}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`RevenueCat API ${r.status}`);
  const body = await r.json();
  const ent = body?.subscriber?.entitlements?.[ENTITLEMENT_ID] ?? null;

  // 期限は「有効期限」と「支払い猶予期限」の遅いほう。null は期限なし（買い切り）
  let expiresAt: string | null = null;
  let active = false;
  if (ent) {
    const dates = [ent.expires_date, ent.grace_period_expires_date].filter((d: unknown) => typeof d === "string") as string[];
    if (ent.expires_date === null) {
      expiresAt = null;
      active = true;
    } else if (dates.length) {
      expiresAt = dates.sort((x, y) => Date.parse(y) - Date.parse(x))[0];
      active = Date.parse(expiresAt) > Date.now();
    }
  }

  const { data: existing, error: selErr } = await admin
    .from("entitlements").select("source").eq("user_id", userId).maybeSingle();
  if (selErr) throw selErr;
  if (existing?.source === "owner") return { user_id: userId, skipped: "owner" };

  // 一度も購入していない人の行は作らない
  if (!ent && !existing) return { user_id: userId, premium: false, skipped: "no purchase" };

  const { error: upErr } = await admin.from("entitlements").upsert({
    user_id: userId,
    premium: active,
    source: "appstore",
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (upErr) throw upErr;
  return { user_id: userId, premium: active, expires_at: expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!RC_KEY) return json({ error: "server not configured" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    // 1) RevenueCat の Webhook
    // RevenueCat 側には「合言葉」だけを入れても「Bearer 合言葉」と入れても通るようにする
    if (HOOK_AUTH && (safeEqual(token, HOOK_AUTH) || safeEqual(auth, HOOK_AUTH))) {
      const payload = await req.json().catch(() => null);
      const ev = payload?.event ?? {};
      const ids = new Set<string>();
      for (const v of [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases ?? []), ...(ev.transferred_from ?? []), ...(ev.transferred_to ?? [])]) {
        if (typeof v === "string" && UUID.test(v)) ids.add(v);
      }
      const results: SyncResult[] = [];
      for (const id of ids) results.push(await syncUser(id));
      return json({ ok: true, type: ev.type ?? null, results });
    }

    // 2) アプリから（ログイン中の本人だけ）
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return json({ error: "unauthorized" }, 401);
    const result = await syncUser(data.user.id);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return json({ error: "sync failed" }, 500);
  }
});
