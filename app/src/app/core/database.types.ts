export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_heads: {
        Row: {
          account_type: string | null
          code: number
          created_at: string
          group_type: string | null
          is_active: boolean
          is_auto: boolean
          is_cash_bank: boolean
          is_group: boolean
          kind: string | null
          ms_code: number
          name: string
          ss_code: number
        }
        Insert: {
          account_type?: string | null
          code: number
          created_at?: string
          group_type?: string | null
          is_active?: boolean
          is_auto?: boolean
          is_cash_bank?: boolean
          is_group?: boolean
          kind?: string | null
          ms_code?: number
          name: string
          ss_code?: number
        }
        Update: {
          account_type?: string | null
          code?: number
          created_at?: string
          group_type?: string | null
          is_active?: boolean
          is_auto?: boolean
          is_cash_bank?: boolean
          is_group?: boolean
          kind?: string | null
          ms_code?: number
          name?: string
          ss_code?: number
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          gstin: string | null
          id: boolean
          journal_allows_cash: boolean
          name: string
          phone: string | null
          place: string
          subscription_head_code: number | null
          updated_at: string
        }
        Insert: {
          gstin?: string | null
          id?: boolean
          journal_allows_cash?: boolean
          name?: string
          phone?: string | null
          place?: string
          subscription_head_code?: number | null
          updated_at?: string
        }
        Update: {
          gstin?: string | null
          id?: boolean
          journal_allows_cash?: boolean
          name?: string
          phone?: string | null
          place?: string
          subscription_head_code?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_subscription_head_code_fkey"
            columns: ["subscription_head_code"]
            isOneToOne: false
            referencedRelation: "account_heads"
            referencedColumns: ["code"]
          },
        ]
      }
      customers: {
        Row: {
          aadhaar: string | null
          addr1: string | null
          addr2: string | null
          addr3: string | null
          addr4: string | null
          code: number
          created_at: string
          id_no: string | null
          id_type: string | null
          joined_on: string | null
          joining_fee: number | null
          left_on: string | null
          name: string
          name_sort: string | null
          pan: string | null
          phone: string | null
          photo_path: string | null
          salutation: string | null
          updated_at: string
        }
        Insert: {
          aadhaar?: string | null
          addr1?: string | null
          addr2?: string | null
          addr3?: string | null
          addr4?: string | null
          code: number
          created_at?: string
          id_no?: string | null
          id_type?: string | null
          joined_on?: string | null
          joining_fee?: number | null
          left_on?: string | null
          name: string
          name_sort?: string | null
          pan?: string | null
          phone?: string | null
          photo_path?: string | null
          salutation?: string | null
          updated_at?: string
        }
        Update: {
          aadhaar?: string | null
          addr1?: string | null
          addr2?: string | null
          addr3?: string | null
          addr4?: string | null
          code?: number
          created_at?: string
          id_no?: string | null
          id_type?: string | null
          joined_on?: string | null
          joining_fee?: number | null
          left_on?: string | null
          name?: string
          name_sort?: string | null
          pan?: string | null
          phone?: string | null
          photo_path?: string | null
          salutation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daybook: {
        Row: {
          created_at: string
          credit: number
          debit: number
          head_code: number
          id: number
          is_auto: boolean
          journal_id: number
          line_no: number
          narration: string | null
          reference_id: number | null
          tran_date: string
          voucher_ref: string | null
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          head_code: number
          id?: never
          is_auto?: boolean
          journal_id: number
          line_no?: number
          narration?: string | null
          reference_id?: number | null
          tran_date: string
          voucher_ref?: string | null
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          head_code?: number
          id?: never
          is_auto?: boolean
          journal_id?: number
          line_no?: number
          narration?: string | null
          reference_id?: number | null
          tran_date?: string
          voucher_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daybook_head_code_fkey"
            columns: ["head_code"]
            isOneToOne: false
            referencedRelation: "account_heads"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "daybook_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_year_reopen_log: {
        Row: {
          created_at: string
          created_by: string
          id: number
          reason: string
          reversal_journal_id: number | null
          start_year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: never
          reason: string
          reversal_journal_id?: number | null
          start_year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: never
          reason?: string
          reversal_journal_id?: number | null
          start_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_year_reopen_log_reversal_journal_id_fkey"
            columns: ["reversal_journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_year_reopen_log_start_year_fkey"
            columns: ["start_year"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["start_year"]
          },
        ]
      }
      financial_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_journal_id: number | null
          ends_on: string | null
          equity_account_code: number | null
          start_year: number
          starts_on: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_journal_id?: number | null
          ends_on?: string | null
          equity_account_code?: number | null
          start_year: number
          starts_on?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_journal_id?: number | null
          ends_on?: string | null
          equity_account_code?: number | null
          start_year?: number
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_closing_journal_id_fkey"
            columns: ["closing_journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_years_equity_account_code_fkey"
            columns: ["equity_account_code"]
            isOneToOne: false
            referencedRelation: "account_heads"
            referencedColumns: ["code"]
          },
        ]
      }
      joining_fee_payments: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: number
          member_code: number
          notes: string | null
          paid_on: string
          request_id: string
          voucher_id: number | null
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          member_code: number
          notes?: string | null
          paid_on: string
          request_id?: string
          voucher_id?: number | null
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          member_code?: number
          notes?: string | null
          paid_on?: string
          request_id?: string
          voucher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "joining_fee_payments_member_code_fkey"
            columns: ["member_code"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "joining_fee_payments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      joining_fees: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          fee: number
          head_code: number | null
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          fee: number
          head_code?: number | null
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          fee?: number
          head_code?: number | null
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "joining_fees_head_code_fkey"
            columns: ["head_code"]
            isOneToOne: false
            referencedRelation: "account_heads"
            referencedColumns: ["code"]
          },
        ]
      }
      journals: {
        Row: {
          created_at: string
          created_by: string
          entry_date: string
          id: number
          kind: string
          narration: string
          request_data: Json
          request_id: string
          reversal_of: number | null
          voucher_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          entry_date: string
          id?: never
          kind: string
          narration: string
          request_data: Json
          request_id: string
          reversal_of?: number | null
          voucher_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_date?: string
          id?: never
          kind?: string
          narration?: string
          request_data?: Json
          request_id?: string
          reversal_of?: number | null
          voucher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journals_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: true
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuri_lots: {
        Row: {
          drawn_at: string
          drawn_by: string | null
          id: number
          installment_no: number
          payout_amount: number
          payout_date: string | null
          payout_status: string
          scheme_id: number
          winner_member_id: number
        }
        Insert: {
          drawn_at?: string
          drawn_by?: string | null
          id?: never
          installment_no: number
          payout_amount: number
          payout_date?: string | null
          payout_status?: string
          scheme_id: number
          winner_member_id: number
        }
        Update: {
          drawn_at?: string
          drawn_by?: string | null
          id?: never
          installment_no?: number
          payout_amount?: number
          payout_date?: string | null
          payout_status?: string
          scheme_id?: number
          winner_member_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "kuri_lots_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "kuri_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kuri_lots_winner_member_id_fkey"
            columns: ["winner_member_id"]
            isOneToOne: false
            referencedRelation: "kuri_members"
            referencedColumns: ["id"]
          },
        ]
      }
      kuri_members: {
        Row: {
          created_at: string
          created_by: string | null
          customer_code: number
          id: number
          notes: string | null
          scheme_id: number
          ticket_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_code: number
          id?: never
          notes?: string | null
          scheme_id: number
          ticket_no: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_code?: number
          id?: never
          notes?: string | null
          scheme_id?: number
          ticket_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "kuri_members_customer_code_fkey"
            columns: ["customer_code"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "kuri_members_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "kuri_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      kuri_payments: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: number
          installment_no: number
          member_id: number
          notes: string | null
          paid_on: string
          request_id: string
          scheme_id: number
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          installment_no: number
          member_id: number
          notes?: string | null
          paid_on: string
          request_id?: string
          scheme_id: number
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          installment_no?: number
          member_id?: number
          notes?: string | null
          paid_on?: string
          request_id?: string
          scheme_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "kuri_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "kuri_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kuri_payments_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "kuri_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      kuri_schemes: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          installment_amount: number
          max_deduction_pct: number
          name: string
          notes: string | null
          num_installments: number
          num_members: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          installment_amount: number
          max_deduction_pct?: number
          name: string
          notes?: string | null
          num_installments?: number
          num_members?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          installment_amount?: number
          max_deduction_pct?: number
          name?: string
          notes?: string | null
          num_installments?: number
          num_members?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          is_active: boolean
          role: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          is_active?: boolean
          role?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          is_active?: boolean
          role?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          fy_start: number
          id: number
          member_code: number
          notes: string | null
          paid_on: string
          request_id: string
          voucher_id: number | null
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          fy_start: number
          id?: never
          member_code: number
          notes?: string | null
          paid_on: string
          request_id?: string
          voucher_id?: number | null
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          fy_start?: number
          id?: never
          member_code?: number
          notes?: string | null
          paid_on?: string
          request_id?: string
          voucher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_fy_start_fkey"
            columns: ["fy_start"]
            isOneToOne: false
            referencedRelation: "subscription_years"
            referencedColumns: ["fy_start"]
          },
          {
            foreignKeyName: "subscription_payments_member_code_fkey"
            columns: ["member_code"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscription_payments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_years: {
        Row: {
          created_at: string
          fee: number
          fy_start: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee: number
          fy_start: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee?: number
          fy_start?: number
          updated_at?: string
        }
        Relationships: []
      }
      voucher_counters: {
        Row: {
          last_no: number
          voucher_type: number
        }
        Insert: {
          last_no?: number
          voucher_type: number
        }
        Update: {
          last_no?: number
          voucher_type?: number
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          branch: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          fy_start: number
          id: number
          is_cancelled: boolean | null
          modified_at: string | null
          modified_by: string | null
          narration: string
          party_code: number | null
          reference_no: string | null
          status: string
          total_amount: number
          voucher_date: string
          voucher_no: number
          voucher_type: number
        }
        Insert: {
          branch?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          fy_start: number
          id?: never
          is_cancelled?: boolean | null
          modified_at?: string | null
          modified_by?: string | null
          narration?: string
          party_code?: number | null
          reference_no?: string | null
          status?: string
          total_amount: number
          voucher_date: string
          voucher_no: number
          voucher_type: number
        }
        Update: {
          branch?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          fy_start?: number
          id?: never
          is_cancelled?: boolean | null
          modified_at?: string | null
          modified_by?: string | null
          narration?: string
          party_code?: number | null
          reference_no?: string | null
          status?: string
          total_amount?: number
          voucher_date?: string
          voucher_no?: number
          voucher_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_fy_start_fkey"
            columns: ["fy_start"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["start_year"]
          },
          {
            foreignKeyName: "vouchers_party_code_fkey"
            columns: ["party_code"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_kuri_scheme: {
        Args: { p_scheme_id: number }
        Returns: {
          created_at: string
          created_by: string | null
          id: number
          installment_amount: number
          max_deduction_pct: number
          name: string
          notes: string | null
          num_installments: number
          num_members: number
          start_date: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kuri_schemes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_kuri_member: {
        Args: {
          p_customer_code: number
          p_notes?: string
          p_scheme_id: number
          p_ticket_no: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          customer_code: number
          id: number
          notes: string | null
          scheme_id: number
          ticket_no: number
        }
        SetofOptions: {
          from: "*"
          to: "kuri_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      app_role: { Args: never; Returns: string }
      cancel_joining_fee_payment: {
        Args: { p_id: number; p_reason: string }
        Returns: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: number
          member_code: number
          notes: string | null
          paid_on: string
          request_id: string
          voucher_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "joining_fee_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_kuri_payment: {
        Args: { p_id: number; p_reason: string }
        Returns: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: number
          installment_no: number
          member_id: number
          notes: string | null
          paid_on: string
          request_id: string
          scheme_id: number
        }
        SetofOptions: {
          from: "*"
          to: "kuri_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_subscription_payment: {
        Args: { p_id: number; p_reason: string }
        Returns: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          fy_start: number
          id: number
          member_code: number
          notes: string | null
          paid_on: string
          request_id: string
          voucher_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "subscription_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_voucher: {
        Args: { p_id: number; p_reason: string }
        Returns: {
          branch: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          fy_start: number
          id: number
          is_cancelled: boolean | null
          modified_at: string | null
          modified_by: string | null
          narration: string
          party_code: number | null
          reference_no: string | null
          status: string
          total_amount: number
          voucher_date: string
          voucher_no: number
          voucher_type: number
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_financial_year: {
        Args: { p_equity_account_code: number; p_start_year: number }
        Returns: number
      }
      create_financial_year: {
        Args: { p_start_year: number }
        Returns: undefined
      }
      create_journal: {
        Args: {
          p_date: string
          p_lines: Json
          p_narration: string
          p_opening?: boolean
          p_request_id: string
        }
        Returns: number
      }
      create_kuri_scheme: {
        Args: {
          p_installment_amount: number
          p_max_deduction_pct?: number
          p_name: string
          p_notes?: string
          p_num_members?: number
          p_start_date?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: number
          installment_amount: number
          max_deduction_pct: number
          name: string
          notes: string | null
          num_installments: number
          num_members: number
          start_date: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kuri_schemes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_voucher:
        | {
            Args: {
              p_amount: number
              p_date: string
              p_description: string
              p_head_code: number
              p_type: number
            }
            Returns: {
              branch: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              fy_start: number
              id: number
              is_cancelled: boolean | null
              modified_at: string | null
              modified_by: string | null
              narration: string
              party_code: number | null
              reference_no: string | null
              status: string
              total_amount: number
              voucher_date: string
              voucher_no: number
              voucher_type: number
            }
            SetofOptions: {
              from: "*"
              to: "vouchers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_amount: number
              p_cash_account_code: number
              p_date: string
              p_description: string
              p_head_code: number
              p_request_id: string
              p_type: number
            }
            Returns: {
              branch: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              fy_start: number
              id: number
              is_cancelled: boolean | null
              modified_at: string | null
              modified_by: string | null
              narration: string
              party_code: number | null
              reference_no: string | null
              status: string
              total_amount: number
              voucher_date: string
              voucher_no: number
              voucher_type: number
            }
            SetofOptions: {
              from: "*"
              to: "vouchers"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      daybook_last_date: { Args: never; Returns: string }
      draw_kuri_lot: {
        Args: {
          p_installment_no: number
          p_scheme_id: number
          p_winner_member_id: number
        }
        Returns: {
          drawn_at: string
          drawn_by: string | null
          id: number
          installment_no: number
          payout_amount: number
          payout_date: string | null
          payout_status: string
          scheme_id: number
          winner_member_id: number
        }
        SetofOptions: {
          from: "*"
          to: "kuri_lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      financial_year_summary: {
        Args: { p_start_year: number }
        Returns: {
          expense: number
          income: number
          net_result: number
        }[]
      }
      fy_label: { Args: { p_fy_start: number }; Returns: string }
      fy_start_of: { Args: { p_date: string }; Returns: number }
      joining_fee_on: {
        Args: { p_on: string }
        Returns: {
          created_at: string
          created_by: string | null
          effective_from: string
          fee: number
          head_code: number | null
          note: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "joining_fees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kuri_collection_status: {
        Args: { p_installment_no: number; p_scheme_id: number }
        Returns: {
          amount_due: number
          amount_paid: number
          balance: number
          customer_code: number
          customer_name: string
          has_won_lot: boolean
          last_paid_on: string
          member_id: number
          phone: string
          ticket_no: number
          won_installment: number
        }[]
      }
      kuri_defaulters: {
        Args: { p_installment_no: number; p_scheme_id: number }
        Returns: {
          amount_due: number
          amount_paid: number
          balance: number
          customer_code: number
          customer_name: string
          member_id: number
          phone: string
          ticket_no: number
        }[]
      }
      kuri_member_ledger: {
        Args: { p_member_id: number; p_scheme_id: number }
        Returns: {
          amount_due: number
          amount_paid: number
          balance: number
          installment_no: number
          last_paid_on: string
        }[]
      }
      kuri_payment_history: {
        Args: { p_member_id: number; p_scheme_id: number }
        Returns: {
          amount: number
          cancel_reason: string
          cancelled_at: string
          created_at: string
          id: number
          installment_no: number
          notes: string
          paid_on: string
        }[]
      }
      kuri_payout_schedule: {
        Args: { p_scheme_id: number }
        Returns: {
          installment_no: number
          lot_number: number
          payout_amount: number
        }[]
      }
      kuri_scheme_detail: {
        Args: { p_scheme_id: number }
        Returns: {
          created_at: string
          enrolled_count: number
          id: number
          installment_amount: number
          lots_drawn: number
          lots_paid_out: number
          max_deduction_pct: number
          name: string
          notes: string
          num_installments: number
          num_members: number
          start_date: string
          status: string
          total_collected: number
          total_paid_out: number
          total_value: number
        }[]
      }
      kuri_scheme_list: {
        Args: never
        Returns: {
          created_at: string
          enrolled_count: number
          id: number
          installment_amount: number
          lots_drawn: number
          name: string
          num_installments: number
          num_members: number
          start_date: string
          status: string
          total_collected: number
          total_value: number
        }[]
      }
      kuri_sync_scheme_status: {
        Args: { p_scheme_id: number }
        Returns: undefined
      }
      mark_kuri_payout: {
        Args: { p_lot_id: number; p_payout_date?: string }
        Returns: {
          drawn_at: string
          drawn_by: string | null
          id: number
          installment_no: number
          payout_amount: number
          payout_date: string | null
          payout_status: string
          scheme_id: number
          winner_member_id: number
        }
        SetofOptions: {
          from: "*"
          to: "kuri_lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      member_joining_fee: { Args: { p_member_code: number }; Returns: number }
      member_subscription_years: {
        Args: { p_member_code: number }
        Returns: {
          balance: number
          fee: number
          fy_start: number
          last_paid_on: string
          paid: number
        }[]
      }
      next_voucher_no: { Args: { p_type: number }; Returns: number }
      post_daybook: { Args: { p_from: string; p_to: string }; Returns: number }
      post_voucher: {
        Args: {
          p_cash_account_code: number
          p_date: string
          p_lines: Json
          p_narration: string
          p_party_code: number
          p_reference_no: string
          p_request_id: string
          p_simplified: boolean
          p_type: number
        }
        Returns: {
          branch: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          fy_start: number
          id: number
          is_cancelled: boolean | null
          modified_at: string | null
          modified_by: string | null
          narration: string
          party_code: number | null
          reference_no: string | null
          status: string
          total_amount: number
          voucher_date: string
          voucher_no: number
          voucher_type: number
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_joining_fee_payment:
        | {
            Args: {
              p_amount: number
              p_member_code: number
              p_notes?: string
              p_paid_on: string
            }
            Returns: {
              amount: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              id: number
              member_code: number
              notes: string | null
              paid_on: string
              request_id: string
              voucher_id: number | null
            }
            SetofOptions: {
              from: "*"
              to: "joining_fee_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_amount: number
              p_member_code: number
              p_notes: string
              p_paid_on: string
              p_request_id: string
            }
            Returns: {
              amount: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              id: number
              member_code: number
              notes: string | null
              paid_on: string
              request_id: string
              voucher_id: number | null
            }
            SetofOptions: {
              from: "*"
              to: "joining_fee_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      record_kuri_bulk_payment: {
        Args: {
          p_installment_no: number
          p_notes?: string
          p_paid_on: string
          p_scheme_id: number
        }
        Returns: number
      }
      record_kuri_payment: {
        Args: {
          p_amount: number
          p_installment_no: number
          p_member_id: number
          p_notes?: string
          p_paid_on: string
          p_request_id?: string
          p_scheme_id: number
        }
        Returns: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: number
          installment_no: number
          member_id: number
          notes: string | null
          paid_on: string
          request_id: string
          scheme_id: number
        }
        SetofOptions: {
          from: "*"
          to: "kuri_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_subscription_payment:
        | {
            Args: {
              p_amount: number
              p_fy_start: number
              p_member_code: number
              p_notes?: string
              p_paid_on: string
            }
            Returns: {
              amount: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              fy_start: number
              id: number
              member_code: number
              notes: string | null
              paid_on: string
              request_id: string
              voucher_id: number | null
            }
            SetofOptions: {
              from: "*"
              to: "subscription_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_amount: number
              p_cash_account_code: number
              p_fy_start: number
              p_member_code: number
              p_notes: string
              p_paid_on: string
              p_request_id: string
            }
            Returns: {
              amount: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              fy_start: number
              id: number
              member_code: number
              notes: string | null
              paid_on: string
              request_id: string
              voucher_id: number | null
            }
            SetofOptions: {
              from: "*"
              to: "subscription_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_amount: number
              p_fy_start: number
              p_member_code: number
              p_notes: string
              p_paid_on: string
              p_request_id: string
            }
            Returns: {
              amount: number
              cancel_reason: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              fy_start: number
              id: number
              member_code: number
              notes: string | null
              paid_on: string
              request_id: string
              voucher_id: number | null
            }
            SetofOptions: {
              from: "*"
              to: "subscription_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      remove_kuri_member: { Args: { p_member_id: number }; Returns: undefined }
      reopen_financial_year: {
        Args: { p_reason: string; p_start_year: number }
        Returns: undefined
      }
      reverse_journal: {
        Args: { p_date: string; p_id: number; p_reason: string }
        Returns: number
      }
      rpt_day_closing: {
        Args: { p_from: string; p_negative_only?: boolean; p_to: string }
        Returns: {
          closing_balance: number
          tran_date: string
        }[]
      }
      rpt_daybook: {
        Args: { p_from: string; p_to: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          head_code: number
          head_name: string
          narration: string
          row_kind: string
          seq: number
          tran_date: string
          voucher_ref: string
        }[]
      }
      rpt_ledger: {
        Args: { p_from: string; p_head_code: number; p_to: string }
        Returns: {
          balance: number
          contra_code: number
          contra_name: string
          credit: number
          debit: number
          head_code: number
          head_name: string
          narration: string
          row_kind: string
          seq: number
          tran_date: string
          voucher_ref: string
        }[]
      }
      rpt_subscription_status: {
        Args: { p_fy: number }
        Returns: {
          arrears: number
          due_this_year: boolean
          last_paid_on: string
          member_code: number
          member_name: string
          phone: string
          total_due: number
          year_balance: number
          year_fee: number
          year_paid: number
        }[]
      }
      rpt_trial_balance: {
        Args: { p_as_on: string }
        Returns: {
          credit: number
          debit: number
          head_code: number
          head_name: string
        }[]
      }
      subscription_dues_summary: {
        Args: { p_fy: number }
        Returns: {
          members: number
          total: number
        }[]
      }
      subscription_ledger: {
        Args: { p_member_code?: number; p_up_to_fy: number }
        Returns: {
          balance: number
          fee: number
          fy_start: number
          last_paid_on: string
          member_code: number
          paid: number
        }[]
      }
      write_journal: {
        Args: {
          p_data: Json
          p_date: string
          p_kind: string
          p_lines: Json
          p_narration: string
          p_request: string
          p_reversal?: number
          p_voucher?: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
