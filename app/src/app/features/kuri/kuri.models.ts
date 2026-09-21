// Row shapes returned by Kuri module RPCs and queries.

export interface KuriSchemeListRow {
  id: number;
  name: string;
  installment_amount: number;
  num_members: number;
  num_installments: number;
  total_value: number;
  start_date: string | null;
  status: 'draft' | 'active' | 'completed';
  enrolled_count: number;
  lots_drawn: number;
  total_collected: number;
  created_at: string;
}

export interface KuriSchemeDetail {
  id: number;
  name: string;
  installment_amount: number;
  num_members: number;
  num_installments: number;
  max_deduction_pct: number;
  total_value: number;
  start_date: string | null;
  status: 'draft' | 'active' | 'completed';
  notes: string | null;
  enrolled_count: number;
  lots_drawn: number;
  lots_paid_out: number;
  total_collected: number;
  total_paid_out: number;
  created_at: string;
}

export interface KuriPayoutSlot {
  installment_no: number;
  lot_number: number;
  payout_amount: number;
}

export interface KuriMember {
  id: number;
  scheme_id: number;
  customer_code: number;
  ticket_no: number;
  notes: string | null;
  created_at: string;
  customer: { code: number; name: string; phone: string | null } | null;
}

export interface KuriLot {
  id: number;
  scheme_id: number;
  installment_no: number;
  winner_member_id: number;
  payout_amount: number;
  payout_date: string | null;
  payout_status: 'pending' | 'paid';
  drawn_at: string;
  member: {
    ticket_no: number;
    customer: { code: number; name: string; phone: string | null } | null;
  } | null;
}

export interface KuriCollectionRow {
  member_id: number;
  ticket_no: number;
  customer_code: number;
  customer_name: string;
  phone: string | null;
  amount_due: number;
  amount_paid: number;
  balance: number;
  last_paid_on: string | null;
  has_won_lot: boolean;
  won_installment: number | null;
}

/** One installment row in a member's ledger (totals from partial payments). */
export interface KuriMemberLedgerRow {
  installment_no: number;
  amount_due: number;
  amount_paid: number;
  balance: number;
  last_paid_on: string | null;
}

/** Individual payment record (supports partial payments). */
export interface KuriPaymentRow {
  id: number;
  installment_no: number;
  amount: number;
  paid_on: string;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface KuriDefaulterRow {
  member_id: number;
  ticket_no: number;
  customer_code: number;
  customer_name: string;
  phone: string | null;
  amount_due: number;
  amount_paid: number;
  balance: number;
}
