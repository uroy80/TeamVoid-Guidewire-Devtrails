export type PayoutStatus =
  | 'INITIATED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRYING';

export type PayoutGatewayName = 'RAZORPAY' | 'STRIPE' | 'UPI';

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

  // Phase 5 — gateway lifecycle columns (all nullable for back-compat with
  // legacy rows written by the pre-state-machine processPayout()).
  gateway: PayoutGatewayName | null;
  utr_number: string | null;
  fee_amount: number | null;
  tax_amount: number | null;
  net_amount: number | null;
  gateway_response: Record<string, unknown> | null;
  failure_reason: string | null;
  initiated_at: Date | null;
  processing_at: Date | null;
  settled_at: Date | null;
  failed_at: Date | null;

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
