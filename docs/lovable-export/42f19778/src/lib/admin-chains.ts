/**
 * Digital-asset (USDT) parameters embedded into the existing card / treasury
 * business modules. UI-layer mock data only — no backend calls.
 */

export type ChainId = "trc20" | "erc20" | "bep20";

export type ChainRecord = {
  id: ChainId;
  label: string;
  network: string;
  chainId: string;
  contract: string;
  confirmations: number;
  gasToken: string;
  gasPrice: string;
  enabled: boolean;
};

export const CHAINS: ChainRecord[] = [
  {
    id: "trc20",
    label: "USDT-TRC20",
    network: "Tron",
    chainId: "0x2b6653dc",
    contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    confirmations: 19,
    gasToken: "TRX",
    gasPrice: "420 SUN",
    enabled: true,
  },
  {
    id: "erc20",
    label: "USDT-ERC20",
    network: "Ethereum",
    chainId: "1",
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    confirmations: 12,
    gasToken: "ETH",
    gasPrice: "18 Gwei",
    enabled: true,
  },
  {
    id: "bep20",
    label: "USDT-BEP20",
    network: "BNB Smart Chain",
    chainId: "56",
    contract: "0x55d398326f99059fF775485246999027B3197955",
    confirmations: 15,
    gasToken: "BNB",
    gasPrice: "3 Gwei",
    enabled: false,
  },
];

export const CHAIN_OPTIONS = CHAINS.map((c) => ({ value: c.id, label: c.label }));

export function chainLabel(id: string) {
  return CHAINS.find((c) => c.id === id)?.label ?? id.toUpperCase();
}

/** Platform-level hard ceilings shown next to every rate input. */
export const FEE_CAPS = {
  cardIssueFee: { max: 30, unit: "USD", labelZh: "开卡费", labelEn: "Card issuing fee" },
  cardMonthlyFee: { max: 5, unit: "USD", labelZh: "卡片月费", labelEn: "Card monthly fee" },
  usdtDepositRate: { max: 3, unit: "%", labelZh: "USDT 充值手续费", labelEn: "USDT deposit fee" },
  cardSpendRate: { max: 3.5, unit: "%", labelZh: "卡消费手续费", labelEn: "Card spending fee" },
  assetWithdrawRate: { max: 2.5, unit: "%", labelZh: "数字资产提现手续费", labelEn: "Asset withdrawal fee" },
  cashWithdrawRate: { max: 4, unit: "%", labelZh: "取现手续费", labelEn: "ATM / cash-out fee" },
  thirdPartyPayRate: { max: 3, unit: "%", labelZh: "第三方应用支付手续费", labelEn: "Third-party pay fee" },
  referralRate: { max: 40, unit: "%", labelZh: "推荐分润费率", labelEn: "Referral commission" },
  tenantMultiplier: { max: 2, unit: "x", labelZh: "租户费率倍率", labelEn: "Tenant fee multiplier" },
} as const;

export type FeeCapKey = keyof typeof FEE_CAPS;

/** Issuing banks — each bank settles in its own fiat currency. */
export const ISSUING_BANKS = [
  { id: "sponsor-sg", name: "Sponsor Bank SG", currency: "SGD", bin: "455102", forms: "Virtual / Physical" },
  { id: "sponsor-hk", name: "Sponsor Bank HK", currency: "HKD", bin: "531993", forms: "Virtual" },
  { id: "sponsor-us", name: "Sponsor Bank US", currency: "USD", bin: "426339", forms: "Virtual / Physical" },
  { id: "sponsor-eu", name: "Sponsor Bank EU", currency: "EUR", bin: "537820", forms: "Physical" },
];

export const TX_TYPE_OPTIONS = [
  { value: "deposit", label: "充值 Deposit (USDT)" },
  { value: "withdraw", label: "提现 Withdrawal" },
  { value: "cash-out", label: "取现 Cash-out" },
  { value: "spend", label: "卡消费 Card spend" },
  { value: "third-party", label: "第三方支付 Third-party pay" },
  { value: "referral", label: "推荐分润 Referral" },
];

export const RANGE_OPTIONS = [
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
  { value: "custom", label: "自定义 Custom" },
];

export const MOCK_TENANTS = [
  { id: "tn-neo", name: "NeoPay 白标", code: "TN-NEOPAY" },
  { id: "tn-lumi", name: "Lumi Finance", code: "TN-LUMI" },
  { id: "tn-aster", name: "Aster OEM", code: "TN-ASTER" },
];

export const TENANT_FILTER_OPTIONS = MOCK_TENANTS.map((t) => ({ value: t.id, label: t.name }));

/* ------------------------------ mock datasets ----------------------------- */

export type CardRow = {
  id: string;
  pan: string;
  form: "虚拟U卡 Virtual" | "实体卡 Physical";
  holder: string;
  tenant: string;
  bank: string;
  currency: string;
  balance: string;
  status: "ACTIVE" | "PENDING" | "FROZEN" | "CLOSED";
  chains: ChainId[];
  updated: string;
};

export const MOCK_CARDS: CardRow[] = [
  { id: "CARD-100241", pan: "**** **** **** 4417", form: "虚拟U卡 Virtual", holder: "L** Wei", tenant: "NeoPay 白标", bank: "Sponsor Bank SG", currency: "SGD", balance: "1,284.50", status: "ACTIVE", chains: ["trc20", "erc20"], updated: "2026-08-05 09:41" },
  { id: "CARD-100238", pan: "**** **** **** 9082", form: "实体卡 Physical", holder: "C*** Ming", tenant: "Lumi Finance", bank: "Sponsor Bank US", currency: "USD", balance: "612.00", status: "ACTIVE", chains: ["trc20"], updated: "2026-08-05 08:12" },
  { id: "CARD-100235", pan: "**** **** **** 3310", form: "虚拟U卡 Virtual", holder: "W*** Ling", tenant: "NeoPay 白标", bank: "Sponsor Bank HK", currency: "HKD", balance: "0.00", status: "PENDING", chains: ["trc20", "bep20"], updated: "2026-08-04 21:05" },
  { id: "CARD-100231", pan: "**** **** **** 7754", form: "实体卡 Physical", holder: "Z*** Hao", tenant: "Aster OEM", bank: "Sponsor Bank EU", currency: "EUR", balance: "3,940.75", status: "FROZEN", chains: ["erc20"], updated: "2026-08-04 17:33" },
  { id: "CARD-100226", pan: "**** **** **** 1129", form: "虚拟U卡 Virtual", holder: "H** Yan", tenant: "Lumi Finance", bank: "Sponsor Bank SG", currency: "SGD", balance: "88.20", status: "CLOSED", chains: ["trc20"], updated: "2026-08-03 11:20" },
];

export type DepositRow = {
  time: string;
  id: string;
  chain: ChainId;
  hash: string;
  from: string;
  card: string;
  tenant: string;
  usdt: string;
  rate: string;
  fee: string;
  fiat: string;
  currency: string;
  status: "COMPLETED" | "PROCESSING" | "FAILED";
};

export const MOCK_DEPOSITS: DepositRow[] = [
  { time: "2026-08-05 09:38", id: "DP-88214", chain: "trc20", hash: "b7f4a2c1d9e8375a6c04b12ef5a9d73c1f6e28b40a5d93c7e18f2a6b4d0c9718", from: "TQ5n...9xKd", card: "CARD-100241", tenant: "NeoPay 白标", usdt: "500.000000", rate: "1.3420", fee: "5.00", fiat: "664.10", currency: "SGD", status: "COMPLETED" },
  { time: "2026-08-05 08:02", id: "DP-88209", chain: "erc20", hash: "0x9a1c47f2be05d38617ca4e0b9d27f5138ea6c40b7d915e83f2a6c1b40d78e552", from: "0x41b9...c7A2", card: "CARD-100238", tenant: "Lumi Finance", usdt: "1,200.000000", rate: "1.0000", fee: "14.40", fiat: "1,185.60", currency: "USD", status: "COMPLETED" },
  { time: "2026-08-04 22:47", id: "DP-88201", chain: "trc20", hash: "3ce81f04ba7d295c6e0f14a8d73b52916ce4a0d85f27b3169ea4c02d7b18f6a9", from: "TB8k...2mQe", card: "CARD-100235", tenant: "NeoPay 白标", usdt: "200.000000", rate: "7.8100", fee: "2.00", fiat: "1,546.38", currency: "HKD", status: "PROCESSING" },
  { time: "2026-08-04 16:15", id: "DP-88190", chain: "bep20", hash: "0x27fa4c0b9e13d857a2c60f4b8d19e735c1a04f6b27d938e5c0a1f4b7d6e29013", from: "0x9dEf...41Bc", card: "CARD-100231", tenant: "Aster OEM", usdt: "3,000.000000", rate: "0.9180", fee: "45.00", fiat: "2,713.19", currency: "EUR", status: "FAILED" },
];

export type WithdrawRow = {
  time: string;
  id: string;
  kind: "数字资产提币 Asset" | "银行卡取现 Cash-out";
  chain: ChainId | "-";
  hash: string;
  card: string;
  tenant: string;
  amount: string;
  currency: string;
  fee: string;
  net: string;
  status: "COMPLETED" | "PROCESSING" | "FAILED";
};

export const MOCK_WITHDRAWALS: WithdrawRow[] = [
  { time: "2026-08-05 09:10", id: "WD-51120", kind: "数字资产提币 Asset", chain: "trc20", hash: "d41ba97c2e0853b16a4d0c8e792f5b31a06d4c9e8f2713b5a0c67e19d84f2a3b", card: "CARD-100241", tenant: "NeoPay 白标", amount: "300.000000 USDT", currency: "USDT", fee: "3.00", net: "297.000000", status: "COMPLETED" },
  { time: "2026-08-05 07:55", id: "WD-51118", kind: "银行卡取现 Cash-out", chain: "-", hash: "—", card: "CARD-100238", tenant: "Lumi Finance", amount: "200.00", currency: "USD", fee: "4.00", net: "196.00", status: "COMPLETED" },
  { time: "2026-08-04 19:30", id: "WD-51109", kind: "银行卡取现 Cash-out", chain: "-", hash: "—", card: "CARD-100231", tenant: "Aster OEM", amount: "500.00", currency: "EUR", fee: "12.50", net: "487.50", status: "FAILED" },
  { time: "2026-08-04 12:04", id: "WD-51101", kind: "数字资产提币 Asset", chain: "erc20", hash: "0x5b3ac10e94d27f6810bc5a3e0d97f4128ca60b5d83e17f2c94a0b6d13e58f7c24", card: "CARD-100238", tenant: "Lumi Finance", amount: "850.000000 USDT", currency: "USDT", fee: "17.00", net: "833.000000", status: "PROCESSING" },
];

export type SpendRow = {
  time: string;
  id: string;
  channel: "卡消费 Card" | "第三方支付 Third-party";
  card: string;
  tenant: string;
  merchant: string;
  amount: string;
  currency: string;
  fee: string;
  status: "COMPLETED" | "PROCESSING" | "FAILED";
};

export const MOCK_SPEND: SpendRow[] = [
  { time: "2026-08-05 09:47", id: "TX-70431", channel: "卡消费 Card", card: "CARD-100241", tenant: "NeoPay 白标", merchant: "Apple Store SG", amount: "129.00", currency: "SGD", fee: "1.94", status: "COMPLETED" },
  { time: "2026-08-05 09:21", id: "TX-70428", channel: "第三方支付 Third-party", card: "CARD-100241", tenant: "NeoPay 白标", merchant: "PayPal Wallet", amount: "60.00", currency: "SGD", fee: "1.20", status: "COMPLETED" },
  { time: "2026-08-05 08:33", id: "TX-70419", channel: "卡消费 Card", card: "CARD-100238", tenant: "Lumi Finance", merchant: "Amazon US", amount: "48.75", currency: "USD", fee: "0.73", status: "COMPLETED" },
  { time: "2026-08-04 23:12", id: "TX-70402", channel: "第三方支付 Third-party", card: "CARD-100231", tenant: "Aster OEM", merchant: "Alipay HK", amount: "310.00", currency: "EUR", fee: "6.20", status: "FAILED" },
];

export type ReferralRow = {
  time: string;
  id: string;
  upline: string;
  downline: string;
  card: string;
  tenant: string;
  source: string;
  base: string;
  rate: string;
  cap: string;
  amount: string;
  currency: string;
  breach: boolean;
};

export const MOCK_REFERRALS: ReferralRow[] = [
  { time: "2026-08-05 09:38", id: "RC-31207", upline: "AG-0012 · Chen", downline: "U-88420 · L** Wei", card: "CARD-100241", tenant: "NeoPay 白标", source: "USDT 充值手续费", base: "5.00", rate: "18.0%", cap: "40.0%", amount: "0.90", currency: "SGD", breach: false },
  { time: "2026-08-05 08:02", id: "RC-31204", upline: "AG-0031 · Lim", downline: "U-88377 · C*** Ming", card: "CARD-100238", tenant: "Lumi Finance", source: "卡消费手续费", base: "0.73", rate: "25.0%", cap: "40.0%", amount: "0.18", currency: "USD", breach: false },
  { time: "2026-08-04 22:47", id: "RC-31199", upline: "AG-0012 · Chen", downline: "U-88512 · W*** Ling", card: "CARD-100235", tenant: "NeoPay 白标", source: "开卡费", base: "12.00", rate: "45.0%", cap: "40.0%", amount: "5.40", currency: "HKD", breach: true },
];

export type HotWalletRow = {
  id: string;
  chain: ChainId;
  address: string;
  usdt: string;
  frozen: string;
  gas: string;
  status: "ACTIVE" | "PAUSED" | "UNAVAILABLE";
  updated: string;
};

export const MOCK_HOT_WALLETS: HotWalletRow[] = [
  { id: "HW-TRC-01", chain: "trc20", address: "TXk9Lq4b2mVc8sD1nR7pZ0aY6uHj3eKf5W", usdt: "412,880.204100", frozen: "12,000.000000", gas: "1,820 TRX", status: "ACTIVE", updated: "2026-08-05 09:50" },
  { id: "HW-ERC-01", chain: "erc20", address: "0x7bC41a09Ed5F26b8309Ac41d7E0b95F2c684aD31", usdt: "196,440.117300", frozen: "0.000000", gas: "0.842 ETH", status: "ACTIVE", updated: "2026-08-05 09:48" },
  { id: "HW-BEP-01", chain: "bep20", address: "0x51Ea9D0c74B26f183Ac09e5D41b7F80c62aE9143", usdt: "38,201.660000", frozen: "5,400.000000", gas: "0.164 BNB", status: "PAUSED", updated: "2026-08-04 18:22" },
];

export type ChainBalanceRow = {
  chain: ChainId;
  available: string;
  frozen: string;
  inTransit: string;
  wallets: number;
  status: "ACTIVE" | "PAUSED";
};

export const MOCK_USDT_BALANCES: ChainBalanceRow[] = [
  { chain: "trc20", available: "412,880.204100", frozen: "12,000.000000", inTransit: "3,410.500000", wallets: 1, status: "ACTIVE" },
  { chain: "erc20", available: "196,440.117300", frozen: "0.000000", inTransit: "890.000000", wallets: 1, status: "ACTIVE" },
  { chain: "bep20", available: "38,201.660000", frozen: "5,400.000000", inTransit: "0.000000", wallets: 1, status: "PAUSED" },
];

export function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
      return "success" as const;
    case "PENDING":
    case "PROCESSING":
      return "info" as const;
    case "FAILED":
    case "FROZEN":
      return "danger" as const;
    case "PAUSED":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}
/* ------------------- card product templates (mock preview) ---------------- */

/**
 * Tenant-level referral ceiling (mock). Product templates may not configure a
 * referral rate above this value — the tenant boundary constrains the product.
 * Source of truth in production: tenant detail → Capabilities.
 */
export const TENANT_REFERRAL_CAP = 25;

/** Tenant-level fee multiplier ceiling (mock) shown on product fee inputs. */
export const TENANT_FEE_MULTIPLIER_CAP = 1.2;

export type CardProductTemplate = {
  id: string;
  name: string;
  bank: string;
  currency: string;
  /** Template default fees — a single card may only override within these caps. */
  fees: {
    usdtDepositRate: number;
    cardSpendRate: number;
    assetWithdrawRate: number;
    cashWithdrawRate: number;
    thirdPartyPayRate: number;
    referralRate: number;
  };
};

export const CARD_PRODUCT_TEMPLATES: CardProductTemplate[] = [
  {
    id: "tpl-virtual-sg",
    name: "虚拟 U 卡 · Sponsor Bank SG",
    bank: "Sponsor Bank SG",
    currency: "SGD",
    fees: { usdtDepositRate: 1.0, cardSpendRate: 1.5, assetWithdrawRate: 1.0, cashWithdrawRate: 2.0, thirdPartyPayRate: 2.0, referralRate: 20 },
  },
  {
    id: "tpl-virtual-us",
    name: "虚拟 U 卡 · Sponsor Bank US",
    bank: "Sponsor Bank US",
    currency: "USD",
    fees: { usdtDepositRate: 1.2, cardSpendRate: 1.2, assetWithdrawRate: 0.8, cashWithdrawRate: 2.5, thirdPartyPayRate: 1.8, referralRate: 15 },
  },
  {
    id: "tpl-physical-eu",
    name: "实体卡 · Sponsor Bank EU",
    bank: "Sponsor Bank EU",
    currency: "EUR",
    fees: { usdtDepositRate: 1.5, cardSpendRate: 2.0, assetWithdrawRate: 1.2, cashWithdrawRate: 3.0, thirdPartyPayRate: 2.4, referralRate: 18 },
  },
];

export function templateForCard(cardId: string): CardProductTemplate {
  const card = MOCK_CARDS.find((c) => c.id === cardId);
  const byBank = CARD_PRODUCT_TEMPLATES.find((t) => t.bank === card?.bank);
  return byBank ?? CARD_PRODUCT_TEMPLATES[0]!;
}

/** Card-number filter options — lets every flow table filter by issued card. */
export const CARD_FILTER_OPTIONS = MOCK_CARDS.map((c) => ({
  value: c.id,
  label: `${c.id} · ${c.form}`,
}));

/** Card form filter options — shared by every issuing-derived flow table. */
export const CARD_FORM_OPTIONS = [
  { value: "virtual", label: "虚拟U卡 Virtual" },
  { value: "physical", label: "实体卡 Physical" },
];
