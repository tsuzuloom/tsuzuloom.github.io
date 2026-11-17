// アプリ内課金（iPhone アプリだけ）。RevenueCat を通して App Store で購入する。
// Web 版では何もしない（購入は iPhone アプリから。プレミアムはアカウントについて Web 版にも反映される）。
import { Capacitor } from '@capacitor/core';
import { Purchases, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';

// RevenueCat の「公開用」SDK キー（appl_ で始まる）。アプリに入れて配る前提の鍵で、秘密ではない。
export const RC_IOS_API_KEY = "appl_OHHcrKpoheQXSLfVQGjnAxxgVuo";
export const ENTITLEMENT_ID = "premium";

export const canPurchase = () => Capacitor.getPlatform() === 'ios' && !!RC_IOS_API_KEY;

let configuredFor = null;   // いま RevenueCat にログインしているユーザー ID
let pending = null;         // 同時に呼ばれても設定は1回だけにする

// ログイン中の Supabase ユーザーと RevenueCat の購入者をひもづける
export async function startPurchases(userId) {
  if (!canPurchase() || !userId) return false;
  if (configuredFor === userId) return true;
  if (pending) { await pending.catch(() => {}); if (configuredFor === userId) return true; }
  pending = (async () => {
    const { isConfigured } = await Purchases.isConfigured();
    if (!isConfigured) await Purchases.configure({ apiKey: RC_IOS_API_KEY, appUserID: userId });
    else await Purchases.logIn({ appUserID: userId });
    configuredFor = userId;
  })();
  try { await pending; } finally { pending = null; }
  return true;
}

// ログアウト時。購入記録はアカウントに残る（次に同じアカウントでログインすれば戻る）
export async function stopPurchases() {
  if (!canPurchase() || !configuredFor) return;
  configuredFor = null;
  try { await Purchases.logOut(); } catch (e) { /* 匿名ユーザーのときは失敗するが問題ない */ }
}

export const isPremiumInfo = (customerInfo) =>
  !!(customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active[ENTITLEMENT_ID]);

export async function storePremium() {
  if (!configuredFor) return null;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return isPremiumInfo(customerInfo);
}

// 販売中のプラン（年額・月額）。値段は App Store の表示（地域の通貨・税込み）をそのまま使う
export async function loadPlans() {
  if (!configuredFor) return [];
  const offerings = await Purchases.getOfferings();
  const cur = offerings && offerings.current;
  if (!cur) return [];
  const order = { ANNUAL: 0, MONTHLY: 1 };
  return (cur.availablePackages || [])
    .filter(p => p.packageType === 'ANNUAL' || p.packageType === 'MONTHLY')
    .sort((a, b) => order[a.packageType] - order[b.packageType]);
}

// 結果: { ok:true } / { cancelled:true } / { error:"..." }
export async function buyPlan(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return isPremiumInfo(customerInfo) ? { ok: true } : { error: "購入は完了しましたが、プレミアムの確認ができませんでした。少し待ってから「購入を復元」を試してください。" };
  } catch (e) {
    if (e && (e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)) return { cancelled: true };
    if (e && e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { error: "お支払いの承認待ちです。承認されると、プレミアムが使えるようになります。" };
    return { error: "購入できませんでした。通信状態を確かめて、もう一度お試しください。" };
  }
}

// 結果: { ok:true, premium:boolean } / { error:"..." }
export async function restorePlans() {
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return { ok: true, premium: isPremiumInfo(customerInfo) };
  } catch (e) {
    return { error: "復元できませんでした。通信状態を確かめて、もう一度お試しください。" };
  }
}
