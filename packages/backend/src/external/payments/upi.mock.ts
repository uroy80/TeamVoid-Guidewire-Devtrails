import type { PaymentGateway, PayoutRequest, InitiateResult } from './types.js';

/**
 * Mock UPI Direct gateway — simulates a direct NPCI IMPS transfer with no
 * intermediary processor. This is the "cheapest" rail in India: NPCI's
 * merchant-payout pricing is effectively zero for routine P2P and inbound
 * merchant credits, so we model it as a 0-fee path.
 *
 * Response shape is the NPCI IMPS reference — UTR is the primary handle,
 * there's no separate transaction object, just a "credit confirmation".
 *
 *  - Fee: ₹0 (NPCI subsidised)
 *  - GST: ₹0
 *  - Failure rate: 7% (UPI has higher failure rate than card rails; NPCI
 *    public stats show ~7% for P2P, far lower for merchant payouts — we
 *    pick the higher number so retries are a visible part of the demo)
 *  - Latency: 120–350 ms (fastest of the three; no processor hop)
 *  - Settlement: 1.2–2.3 s (UPI is the fastest-settling rail)
 */

const FAILURE_REASONS = [
  'ZM: Beneficiary bank unavailable (NPCI error)',
  'U30: Invalid beneficiary VPA',
  'X1: Remitter daily UPI limit exhausted',
  'Z9: Beneficiary bank timeout — retry in a moment',
];

function randUtr(): string {
  // Real IMPS UTRs are 12 digits. They usually embed the sending bank's
  // numeric code but we just generate pseudorandom digits for the mock.
  let utr = '';
  for (let i = 0; i < 12; i++) utr += Math.floor(Math.random() * 10);
  return utr;
}

function randNpciRef(): string {
  // NPCI's own reference used in the response header — 16 alphanumeric.
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export class UpiGateway implements PaymentGateway {
  readonly name = 'UPI' as const;
  readonly displayName = 'UPI Direct (IMPS)';
  readonly brandColor = '#0E7C3A';
  readonly paymentMethod = 'UPI';

  async initiate(req: PayoutRequest): Promise<InitiateResult> {
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 230));

    const utr = randUtr();
    const npciRef = randNpciRef();
    const nowIso = new Date().toISOString();
    const success = Math.random() < 0.93;

    if (!success) {
      const reason = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
      return {
        status: 'REJECTED',
        transactionRef: `UPI-${npciRef}`,
        utrNumber: null,
        feeAmount: 0,
        taxAmount: 0,
        settlementDelayMs: 0,
        failureReason: reason,
        rawResponse: {
          RespCode: reason.split(':')[0].trim(),
          RespMessage: reason,
          ReqRefNo: req.referenceId,
          NPCIRefId: npciRef,
          Amount: req.amount.toFixed(2),
          BeneVPA: req.upiId,
          TxnTime: nowIso,
          Status: 'FAILED',
        },
      };
    }

    console.log(
      `[UpiMock] credit INR ${req.amount} → ${req.upiId} | utr=${utr}`,
    );

    return {
      status: 'ACCEPTED',
      transactionRef: `UPI-${npciRef}`,
      utrNumber: utr,
      feeAmount: 0,
      taxAmount: 0,
      settlementDelayMs: 1200 + Math.floor(Math.random() * 1100),
      rawResponse: {
        RespCode: '00',
        RespMessage: 'Transaction successful',
        ReqRefNo: req.referenceId,
        NPCIRefId: npciRef,
        UTR: utr,
        Amount: req.amount.toFixed(2),
        Currency: 'INR',
        BeneVPA: req.upiId,
        BeneName: 'GigShield Beneficiary',
        RemitterBank: 'GIGSHIELD_ESCROW',
        RemitterIFSC: 'GIGS0000001',
        TxnType: 'IMPS-P2A',
        TxnTime: nowIso,
        Status: 'SUCCESS',
        Narration: req.note ?? 'GigShield income protection payout',
      },
    };
  }
}

export const upiGateway = new UpiGateway();
