import { inject, Injectable } from '@angular/core';
import { AccountHead, Customer, Voucher } from './models';
import { must, SupabaseService } from './supabase.service';
import { VoucherTypeCode } from './voucher-types';

/** A member, supplier or employee named on a voucher. */
export type Party = Pick<Customer, 'code' | 'name'>;

export interface VoucherReferenceData {
  accounts: AccountHead[];
  parties: Party[];
  allowCashInJournal: boolean;
}

export interface PostVoucherRequest {
  type: VoucherTypeCode;
  date: string;
  referenceNo: string | null;
  partyCode: number | null;
  narration: string;
  /** Only used by simplified receipts and payments. */
  cashAccount: number | null;
  lines: Record<string, unknown>[];
  simplified: boolean;
  /** The same id on a retry returns the first voucher instead of posting twice. */
  requestId: string;
}

/**
 * The single path between the voucher screens and the accounting engine. The screens
 * prepare a transaction; `post_voucher` validates the accounts, works out the debits
 * and credits, allocates the number and writes header and details in one transaction.
 */
@Injectable({ providedIn: 'root' })
export class VoucherService {
  private readonly sb = inject(SupabaseService).client;

  async referenceData(): Promise<VoucherReferenceData> {
    const [accounts, parties, settings] = await Promise.all([
      must(
        this.sb
          .from('account_heads')
          .select('code, name, account_type, is_cash_bank')
          .not('account_type', 'is', null)
          .eq('is_active', true)
          .eq('is_group', false)
          .order('name'),
      ),
      // Two columns per member, ordered in the database, for the party autocomplete.
      must(this.sb.from('customers').select('code, name').order('name_sort')),
      must(
        this.sb
          .from('company_settings')
          .select('journal_allows_cash')
          .maybeSingle<{ journal_allows_cash: boolean }>(),
      ),
    ]);
    return {
      accounts: accounts as AccountHead[],
      parties: parties as Party[],
      allowCashInJournal: !!settings?.journal_allows_cash,
    };
  }

  /** The number the next voucher of this type will take, for display before saving. */
  async nextNumber(type: VoucherTypeCode): Promise<number | null> {
    const next = await must(this.sb.rpc('next_voucher_no', { p_type: type }));
    return next === null ? null : Number(next);
  }

  async post(request: PostVoucherRequest): Promise<Voucher> {
    return must(
      this.sb
        .rpc('post_voucher', {
          p_type: request.type,
          p_date: request.date,
          p_reference_no: request.referenceNo,
          p_party_code: request.partyCode,
          p_narration: request.narration,
          p_cash_account_code: request.simplified ? request.cashAccount : null,
          p_lines: request.lines,
          p_simplified: request.simplified,
          p_request_id: request.requestId,
        })
        .single<Voucher>(),
    );
  }

  /**
   * Opening balances are not a voucher: they open the books rather than record a
   * transaction, so they carry no voucher number and may touch cash and bank
   * accounts that a plain journal voucher cannot. Admins only, in the database too.
   */
  async postOpening(
    date: string,
    narration: string,
    lines: Record<string, unknown>[],
    requestId: string,
  ): Promise<number> {
    return Number(
      await must(
        this.sb.rpc('create_journal', {
          p_date: date,
          p_narration: narration,
          p_lines: lines,
          p_request_id: requestId,
          p_opening: true,
        }),
      ),
    );
  }

  async cancel(id: number, reason: string): Promise<void> {
    await must(this.sb.rpc('cancel_voucher', { p_id: id, p_reason: reason }));
  }
}
