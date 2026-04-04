export type PayoutStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'RETRYING';

export type LedgerDirection = 'INFLOW' | 'OUTFLOW';
export type LedgerType = 'PREMIUM_PAYMENT' | 'PAYOUT_DISBURSEMENT';

export interface Payout {
  id: string;
  claim_id: string;
  worker_id: string;
  amount: number;
  payment_method: string;
  transaction_ref: string | null;
  status: PayoutStatus;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface FinancialLedger {
  id: string;
  worker_id: string;
  amount: number;
  direction: LedgerDirection;
  type: LedgerType;
  reference_id: string;
  transaction_ref: string | null;
  created_at: Date;
}
