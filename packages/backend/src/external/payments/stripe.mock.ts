import type { PaymentGateway, PayoutRequest, InitiateResult } from './types.js';

/**
 * Mock Stripe Connect transfer gateway.
 *
 * Response shape mirrors Stripe's real `transfer` + `payout` objects
 * (docs: https://docs.stripe.com/api/transfers). Stripe uses Unix
 * timestamps, paise-for-INR (smallest currency unit), and `id` prefixes
 * like `tr_` / `po_` — all replicated here.
 *
 * Pricing in this mock:
 *  - Fee: 0.5% + ₹2 flat (matches Stripe India's standard Connect payout rate)
 *  - GST: 18% on the fee (India-specific, stripped from the Stripe response
 *         shape — stripe doesn't bill GST on their invoice, we compute it
 *         for the receipt so the worker sees the real net).
 *  - Failure rate: 3% (Stripe's public SLA is higher than Razorpay's)
 *  - Latency: 250–600 ms
 *  - Settlement: 2.5–4.5 s
 */

const FAILURE_REASONS = [
  'account_closed: destination account no longer accepts funds',
  'debit_not_authorized: customer bank blocked the transfer',
  'insufficient_funds: stripe balance cannot cover this payout',
  'bank_account_restricted: beneficiary KYC pending',
];

function randTransferId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 24; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return `tr_${code}`;
}

function randBalanceTxn(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 24; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return `txn_${code}`;
}

export class StripeGateway implements PaymentGateway {
  readonly name = 'STRIPE' as const;
  readonly displayName = 'Stripe Connect';
  readonly brandColor = '#635BFF';
  readonly paymentMethod = 'BANK_TRANSFER';

  async initiate(req: PayoutRequest): Promise<InitiateResult> {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));

    const fee = Math.round((req.amount * 0.005 + 2) * 100) / 100;
    const tax = Math.round(fee * 0.18 * 100) / 100;
    const transactionRef = randTransferId();
    const balanceTxn = randBalanceTxn();
    const createdAt = Math.floor(Date.now() / 1000);
    const success = Math.random() < 0.97;

    if (!success) {
      const reason = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
      return {
        status: 'REJECTED',
        transactionRef,
        utrNumber: null,
        feeAmount: 0,
        taxAmount: 0,
        settlementDelayMs: 0,
        failureReason: reason,
        rawResponse: {
          id: transactionRef,
          object: 'transfer',
          amount: Math.round(req.amount * 100),
          currency: 'inr',
          created: createdAt,
          livemode: false,
          metadata: { claim_id: req.referenceId },
          description: req.note ?? 'GigShield income protection payout',
          reversed: true,
          failure_code: reason.split(':')[0],
          failure_message: reason,
        },
      };
    }

    console.log(
      `[StripeMock] transfer INR ${req.amount} → ${req.upiId} | id=${transactionRef}`,
    );

    return {
      status: 'ACCEPTED',
      transactionRef,
      utrNumber: null, // Stripe doesn't expose UTR on their Transfer object
      feeAmount: fee,
      taxAmount: tax,
      settlementDelayMs: 2500 + Math.floor(Math.random() * 2000),
      rawResponse: {
        id: transactionRef,
        object: 'transfer',
        amount: Math.round(req.amount * 100),
        amount_reversed: 0,
        balance_transaction: balanceTxn,
        created: createdAt,
        currency: 'inr',
        description: req.note ?? 'GigShield income protection payout',
        destination: `acct_${req.upiId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
        destination_payment: `py_${req.referenceId.replace(/-/g, '').slice(0, 16)}`,
        livemode: false,
        metadata: {
          claim_id: req.referenceId,
          platform: 'gigshield',
        },
        reversals: {
          object: 'list',
          data: [],
          has_more: false,
          total_count: 0,
          url: `/v1/transfers/${transactionRef}/reversals`,
        },
        reversed: false,
        source_transaction: null,
        source_type: 'card',
        transfer_group: null,
      },
    };
  }
}

export const stripeGateway = new StripeGateway();
