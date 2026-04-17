/**
 * Common contract every mock payment gateway must implement.
 *
 * A real integration with Razorpay Payouts, Stripe Connect, or NPCI IMPS
 * would expose the same surface — amount in, gateway-issued reference out,
 * plus a structured response blob we persist for audit. Modeling the mocks
 * this way means the day we swap one of them for a live provider, only the
 * implementation changes, not the caller.
 */

export type GatewayName = 'RAZORPAY' | 'STRIPE' | 'UPI';

export interface PayoutRequest {
  /** Gross INR amount the worker is owed (before gateway fee + GST). */
  amount: number;
  /** Beneficiary UPI VPA, e.g. `9876543210@paytm`. */
  upiId: string;
  /** Optional human-readable memo — shown on bank statement / receipt. */
  note?: string;
  /** Correlation ID — usually the claim_id, passed back in the response. */
  referenceId: string;
}

export type InitiateStatus = 'ACCEPTED' | 'REJECTED';

export interface InitiateResult {
  /**
   * `ACCEPTED` — gateway took the request; money will settle shortly.
   * `REJECTED` — the gateway itself refused (invalid VPA, insufficient balance,
   *              beneficiary blocked). Not retryable without fixing upstream.
   */
  status: InitiateStatus;

  /** Gateway-issued transaction ID, e.g. `pout_NlfxZyX1234abc` for Razorpay. */
  transactionRef: string;

  /** NPCI UTR — 12 digits for IMPS/UPI transfers. Null for card-rail gateways. */
  utrNumber: string | null;

  /** Gateway fee charged (in INR). */
  feeAmount: number;

  /** GST (18%) applied on the fee, also in INR. */
  taxAmount: number;

  /**
   * Simulated bank-side settlement delay. Caller schedules a `settled_at`
   * update after this many ms — that's what makes the timeline feel real.
   */
  settlementDelayMs: number;

  /** Full response body for audit. Never parse it — just store and display. */
  rawResponse: Record<string, unknown>;

  /** Populated only when status = REJECTED. */
  failureReason?: string;
}

export interface PaymentGateway {
  readonly name: GatewayName;
  /** Display name for receipts ("Razorpay", "Stripe Payments", "UPI Direct"). */
  readonly displayName: string;
  /** Brand color for receipt UI — matches the real provider's palette. */
  readonly brandColor: string;
  /** Payment method label persisted on the payout row ("UPI", "BANK", etc.). */
  readonly paymentMethod: string;
  /** Kick off the transfer. Mocked — no network, but shape = real response. */
  initiate(req: PayoutRequest): Promise<InitiateResult>;
}
