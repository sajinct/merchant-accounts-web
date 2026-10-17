// Row shapes returned by Kuri module RPCs and queries.

export interface KuriCustomerSummary {
  code: number;
  name: string;
  addr1?: string | null;
  addr2?: string | null;
  addr3?: string | null;
  addr4?: string | null;
  phone: string | null;
}

export interface KuriSchemeListRow {
  id: number;
  name: string;
  installment_amount: number;
  num_members: number;
  num_installments: number;
  total_value: number;
  start_date: string | null;
  status: 'draft' | 'active' | 'completed';
  head_code?: number | null;
  head_name?: string | null;
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
  head_code?: number | null;
  head_name?: string | null;
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
  holder_name?: string | null;
  holder_address?: string | null;
  holder_phone?: string | null;
  notes: string | null;
  created_at: string;
  customer: KuriCustomerSummary | null;
}

export interface KuriLot {
  id: number;
  scheme_id: number;
  installment_no: number;
  winner_member_id: number;
  payout_amount: number;
  payout_date: string | null;
  payout_status: 'pending' | 'paid';
  voucher_id?: number | null;
  drawn_at: string;
  member: {
    ticket_no: number;
    holder_name?: string | null;
    holder_address?: string | null;
    holder_phone?: string | null;
    customer: KuriCustomerSummary | null;
  } | null;
}

export interface KuriCollectionRow {
  member_id: number;
  ticket_no: number;
  customer_code: number;
  customer_name: string;
  holder_name?: string | null;
  holder_address?: string | null;
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
  voucher_id?: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface KuriDefaulterRow {
  member_id: number;
  ticket_no: number;
  customer_code: number;
  customer_name: string;
  holder_name?: string | null;
  holder_address?: string | null;
  phone: string | null;
  amount_due: number;
  amount_paid: number;
  balance: number;
}

export function formatCustomerAddress(
  customer: Pick<KuriCustomerSummary, 'addr1' | 'addr2' | 'addr3' | 'addr4'> | null | undefined,
): string {
  if (!customer) return '';
  return [customer.addr1, customer.addr2, customer.addr3, customer.addr4]
    .map((line) => line?.trim())
    .filter(Boolean)
    .join(', ');
}

export function ticketHolderName(
  ticket:
    | {
        holder_name?: string | null;
        customer?: { name: string } | null;
        customer_name?: string | null;
      }
    | null
    | undefined,
): string {
  if (!ticket) return '';
  return ticket.holder_name?.trim() || ticket.customer?.name || ticket.customer_name || '';
}

export function ticketHolderAddress(
  ticket:
    | {
        holder_address?: string | null;
        customer?: KuriCustomerSummary | null;
      }
    | null
    | undefined,
): string {
  if (!ticket) return '';
  return ticket.holder_address?.trim() || formatCustomerAddress(ticket.customer);
}

export function ticketHolderPhone(
  ticket:
    | {
        holder_phone?: string | null;
        phone?: string | null;
        customer?: { phone: string | null } | null;
      }
    | null
    | undefined,
): string {
  if (!ticket) return '';
  return ticket.holder_phone?.trim() || ticket.phone?.trim() || ticket.customer?.phone || '';
}

export function hasCustomHolderName(
  ticket:
    | {
        holder_name?: string | null;
        customer?: { name: string } | null;
        customer_name?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!ticket) return false;
  const custom = ticket.holder_name?.trim();
  const base = (ticket.customer?.name ?? ticket.customer_name ?? '').trim();
  return Boolean(custom && custom !== base);
}
