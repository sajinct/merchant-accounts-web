import { inject, Injectable } from '@angular/core';
import { must, SupabaseService } from '../../core/supabase.service';
import {
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

@Injectable({ providedIn: 'root' })
export class KuriService {
  private readonly sb = inject(SupabaseService).client;

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
  }): Promise<unknown> {
    return must(this.sb.rpc('create_kuri_scheme', params));
  }

  activateScheme(schemeId: number): Promise<unknown> {
    return must(this.sb.rpc('activate_kuri_scheme', { p_scheme_id: schemeId }));
  }

  addMember(
    schemeId: number,
    customerCode: number,
    ticketNo: number,
    notes?: string,
  ): Promise<unknown> {
    return must(
      this.sb.rpc('add_kuri_member', {
        p_scheme_id: schemeId,
        p_customer_code: customerCode,
        p_ticket_no: ticketNo,
        p_notes: notes,
      }),
    );
  }

  removeMember(memberId: number): Promise<unknown> {
    return must(this.sb.rpc('remove_kuri_member', { p_member_id: memberId }));
  }

  getMembers(schemeId: number): Promise<KuriMember[]> {
    return must(
      this.sb
        .from('kuri_members')
        .select('*, customer:customers(code, name, phone)')
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
        .select('*, member:kuri_members(ticket_no, customer:customers(code, name, phone))')
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
  }): Promise<unknown> {
    return must(this.sb.rpc('record_kuri_payment', params));
  }

  recordBulkPayment(
    schemeId: number,
    installmentNo: number,
    paidOn: string,
    notes?: string,
  ): Promise<number> {
    return must(
      this.sb.rpc('record_kuri_bulk_payment', {
        p_scheme_id: schemeId,
        p_installment_no: installmentNo,
        p_paid_on: paidOn,
        p_notes: notes,
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

  markPayout(lotId: number, payoutDate?: string): Promise<unknown> {
    return must(
      this.sb.rpc('mark_kuri_payout', {
        p_lot_id: lotId,
        p_payout_date: payoutDate,
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
