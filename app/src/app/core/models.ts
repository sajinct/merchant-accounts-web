// Row shapes returned by the Supabase schema (see supabase/migrations).
// Replace with generated types (`npm run db:types` in the repo root) once the project is linked.

export type Role = 'admin' | 'accountant' | 'viewer';

export interface Profile {
  user_id: string;
  username: string | null;
  full_name: string | null;
  role: Role;
  is_active: boolean;
}

export interface CompanySettings {
  name: string;
  place: string;
  phone: string | null;
  gstin: string | null;
}

export interface AccountHead {
  code: number;
  name: string;
}

export interface Customer {
  code: number;
  salutation: string | null;
  name: string;
  addr1: string | null;
  addr2: string | null;
  addr3: string | null;
  addr4: string | null;
  phone: string | null;
  aadhaar: string | null;
  pan: string | null;
  id_type: string | null;
  id_no: string | null;
  photo_path: string | null;
  joined_on: string | null;
  left_on: string | null;
}

/** Fee for one financial year; fy_start 2026 means 2026-27. */
export interface SubscriptionYear {
  fy_start: number;
  fee: number;
}

export interface SubscriptionPayment {
  id: number;
  member_code: number;
  fy_start: number;
  paid_on: string;
  amount: number;
  voucher_id: number;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

/** One financial year for one member (member_subscription_years). */
export interface MemberSubscriptionYear {
  fy_start: number;
  fee: number;
  paid: number;
  balance: number;
  last_paid_on: string | null;
}

/** One member in the dues report (rpt_subscription_status). */
export interface SubscriptionStatusRow {
  member_code: number;
  member_name: string;
  phone: string | null;
  due_this_year: boolean;
  year_fee: number;
  year_paid: number;
  year_balance: number;
  arrears: number;
  total_due: number;
  last_paid_on: string | null;
}

/** 1 = receipt, 2 = payment. */
export type VoucherType = 1 | 2;

export interface Voucher {
  id: number;
  voucher_type: VoucherType;
  voucher_no: number;
  voucher_date: string;
  head_code: number;
  description: string;
  amount: number;
  cancelled_at: string | null;
}

export interface DaybookRow {
  seq: number;
  row_kind: 'opening' | 'entry';
  tran_date: string | null;
  voucher_ref: string | null;
  head_code: number | null;
  head_name: string | null;
  narration: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerRow {
  seq: number;
  head_code: number;
  head_name: string;
  row_kind: 'opening' | 'entry';
  tran_date: string | null;
  voucher_ref: string | null;
  narration: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceRow {
  head_code: number;
  head_name: string;
  debit: number;
  credit: number;
}

export interface DayClosingRow {
  tran_date: string;
  closing_balance: number;
}
