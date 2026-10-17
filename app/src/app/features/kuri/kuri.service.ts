import { inject, Injectable } from '@angular/core';
import { AccountHead } from '../../core/models';
import { must, SupabaseService } from '../../core/supabase.service';
import {
  KuriCustomerSummary,
  KuriSchemeListRow,
  KuriSchemeDetail,
  KuriPayoutSlot,
  KuriMember,
  KuriLot,
  KuriCollectionRow,
  KuriMemberLedgerRow,
  KuriDefaulterRow,
  KuriPaymentRow,
} from './kuri.models';

export interface AddKuriMemberOptions {
  notes?: string;
  holderName?: string | null;
  holderAddress?: string | null;
  holderPhone?: string | null;
}

@Injectable({ providedIn: 'root' })
export class KuriService {
  private readonly sb = inject(SupabaseService).client;

  getAccounts(): Promise<AccountHead[]> {
    return must(
      this.sb
        .from('account_heads')
        .select('code, name, account_type, is_cash_bank')
        .eq('is_active', true)
        .eq('is_group', false)
        .not('account_type', 'is', null)
        .order('code'),
    );
  }

  listSchemes(): Promise<KuriSchemeListRow[]> {
    return must(this.sb.rpc('kuri_scheme_list'));
  }

  getSchemeDetail(schemeId: number): Promise<KuriSchemeDetail[]> {
    return must(this.sb.rpc('kuri_scheme_detail', { p_scheme_id: schemeId }));
  }

  getPayoutSchedule(schemeId: number): Promise<KuriPayoutSlot[]> {
    return must(this.sb.rpc('kuri_payout_schedule', { p_scheme_id: schemeId }));
  }

  createScheme(params: {
    p_name: string;
    p_installment_amount: number;
    p_num_members?: number;
    p_max_deduction_pct?: number;
    p_start_date?: string | null;
    p_notes?: string | null;
    p_head_code: number;
  }): Promise<unknown> {
    return must(this.sb.rpc('create_kuri_scheme', params));
  }

  setSchemeAccount(schemeId: number, headCode: number): Promise<unknown> {
    return must(
      this.sb.rpc('set_kuri_scheme_account', {
        p_scheme_id: schemeId,
        p_head_code: headCode,
      }),
    );
  }

  activateScheme(schemeId: number): Promise<unknown> {
    return must(this.sb.rpc('activate_kuri_scheme', { p_scheme_id: schemeId }));
  }

  async getCustomer(code: number): Promise<KuriCustomerSummary | null> {
    const { data, error } = await this.sb
      .from('customers')
      .select('code, name, addr1, addr2, addr3, addr4, phone')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async searchCustomers(query = '', limit = 30): Promise<KuriCustomerSummary[]> {
    const q = query.trim();
    let request = this.sb
      .from('customers')
      .select('code, name, addr1, addr2, addr3, addr4, phone')
      .order('name_sort', { ascending: true, nullsFirst: false })
      .order('code')
      .limit(limit);
    if (q) {
      const safe = q.replace(/[,()*%\\]/g, ' ').trim();
      const filters = [`name.ilike.*${safe}*`, `phone.ilike.*${safe}*`];
      if (/^\d+$/.test(safe)) {
        filters.push(`code.eq.${safe}`);
      }
      request = request.or(filters.join(','));
    }
    const { data, error } = await request;
    if (error) throw error;
    return data ?? [];
  }

  addMember(
    schemeId: number,
    customerCode: number,
    ticketNo: number,
    options?: string | AddKuriMemberOptions,
  ): Promise<unknown> {
    const opts: AddKuriMemberOptions =
      typeof options === 'string' ? { notes: options } : (options ?? {});
    const payload: {
      p_scheme_id: number;
      p_customer_code: number;
      p_ticket_no: number;
      p_notes?: string;
      p_holder_name?: string;
      p_holder_address?: string;
      p_holder_phone?: string;
    } = {
      p_scheme_id: schemeId,
      p_customer_code: customerCode,
      p_ticket_no: ticketNo,
      p_notes: opts.notes,
    };
    if (opts.holderName?.trim()) payload.p_holder_name = opts.holderName.trim();
    if (opts.holderAddress?.trim()) payload.p_holder_address = opts.holderAddress.trim();
    if (opts.holderPhone?.trim()) payload.p_holder_phone = opts.holderPhone.trim();
    return must(this.sb.rpc('add_kuri_member', payload));
  }

  removeMember(memberId: number): Promise<unknown> {
    return must(this.sb.rpc('remove_kuri_member', { p_member_id: memberId }));
  }

  getMembers(schemeId: number): Promise<KuriMember[]> {
    return must(
      this.sb
        .from('kuri_members')
        .select('*, customer:customers(code, name, addr1, addr2, addr3, addr4, phone)')
        .eq('scheme_id', schemeId)
        .order('ticket_no'),
    );
  }

  getCollectionStatus(schemeId: number, installmentNo: number): Promise<KuriCollectionRow[]> {
    return must(
      this.sb.rpc('kuri_collection_status', {
        p_scheme_id: schemeId,
        p_installment_no: installmentNo,
      }),
    );
  }

  getMemberLedger(schemeId: number, memberId: number): Promise<KuriMemberLedgerRow[]> {
    return must(
      this.sb.rpc('kuri_member_ledger', {
        p_scheme_id: schemeId,
        p_member_id: memberId,
      }),
    );
  }

  drawLot(schemeId: number, installmentNo: number, winnerMemberId: number): Promise<unknown> {
    return must(
      this.sb.rpc('draw_kuri_lot', {
        p_scheme_id: schemeId,
        p_installment_no: installmentNo,
        p_winner_member_id: winnerMemberId,
      }),
    );
  }

  getLots(schemeId: number): Promise<KuriLot[]> {
    return must(
      this.sb
        .from('kuri_lots')
        .select(
          '*, member:kuri_members(ticket_no, holder_name, holder_address, holder_phone, customer:customers(code, name, addr1, addr2, addr3, addr4, phone))',
        )
        .eq('scheme_id', schemeId)
        .order('installment_no'),
    );
  }

  recordPayment(params: {
    p_scheme_id: number;
    p_member_id: number;
    p_installment_no: number;
    p_amount: number;
    p_paid_on: string;
    p_notes?: string;
    p_request_id?: string;
    p_cash_account_code?: number | null;
  }): Promise<unknown> {
    return must(this.sb.rpc('record_kuri_payment', params));
  }

  recordBulkPayment(
    schemeId: number,
    installmentNo: number,
    paidOn: string,
    notes?: string,
    cashAccountCode?: number | null,
  ): Promise<number> {
    return must(
      this.sb.rpc('record_kuri_bulk_payment', {
        p_scheme_id: schemeId,
        p_installment_no: installmentNo,
        p_paid_on: paidOn,
        p_notes: notes,
        p_cash_account_code: cashAccountCode ?? null,
      }),
    );
  }

  cancelPayment(id: number, reason: string): Promise<unknown> {
    return must(
      this.sb.rpc('cancel_kuri_payment', {
        p_id: id,
        p_reason: reason,
      }),
    );
  }

  markPayout(
    lotId: number,
    payoutDate?: string,
    cashAccountCode?: number | null,
    notes?: string,
  ): Promise<unknown> {
    return must(
      this.sb.rpc('mark_kuri_payout', {
        p_lot_id: lotId,
        p_payout_date: payoutDate,
        p_cash_account_code: cashAccountCode ?? null,
        p_notes: notes,
      }),
    );
  }

  getDefaulters(schemeId: number, installmentNo: number): Promise<KuriDefaulterRow[]> {
    return must(
      this.sb.rpc('kuri_defaulters', {
        p_scheme_id: schemeId,
        p_installment_no: installmentNo,
      }),
    );
  }

  getPaymentHistory(schemeId: number, memberId: number): Promise<KuriPaymentRow[]> {
    return must(
      this.sb.rpc('kuri_payment_history', {
        p_scheme_id: schemeId,
        p_member_id: memberId,
      }),
    );
  }
}
