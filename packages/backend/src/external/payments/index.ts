import type { PaymentGateway, GatewayName } from './types.js';
import { razorpayGateway } from './razorpay.mock.js';
import { stripeGateway } from './stripe.mock.js';
import { upiGateway } from './upi.mock.js';

export * from './types.js';

const GATEWAYS: Record<GatewayName, PaymentGateway> = {
  RAZORPAY: razorpayGateway,
  STRIPE: stripeGateway,
  UPI: upiGateway,
};

/**
 * Pick a gateway for a given beneficiary.
 *
 * Routing logic — mirrors a real payment ops setup where you'd route based
 * on the destination rail:
 *   - `@upi` or `@npci`        → UPI Direct (zero-fee, fastest)
 *   - `@paytm` / `@ptsbi`      → Razorpay (they have a Paytm bank partnership)
 *   - `@okhdfc` / `@okicici`   → Razorpay (preferred rail for bank-linked VPAs)
 *   - anything else            → Stripe (fallback, works on any account)
 *
 * The caller can force a specific gateway via `override` — we use that on
 * the admin "Send Payout" modal where an operator can pick manually, and
 * in tests where we need determinism.
 */
export function selectGateway(upiId: string, override?: GatewayName): PaymentGateway {
  if (override && GATEWAYS[override]) return GATEWAYS[override];

  const vpa = upiId.toLowerCase();

  if (vpa.endsWith('@upi') || vpa.endsWith('@npci')) return GATEWAYS.UPI;
  if (
    vpa.endsWith('@paytm') ||
    vpa.endsWith('@ptsbi') ||
    vpa.endsWith('@okhdfc') ||
    vpa.endsWith('@okicici') ||
    vpa.endsWith('@okaxis') ||
    vpa.endsWith('@oksbi') ||
    vpa.endsWith('@ybl') ||
    vpa.endsWith('@ibl')
  ) {
    return GATEWAYS.RAZORPAY;
  }
  return GATEWAYS.STRIPE;
}

export function getGateway(name: GatewayName): PaymentGateway {
  const g = GATEWAYS[name];
  if (!g) throw new Error(`Unknown payment gateway: ${name}`);
  return g;
}

export function listGateways(): PaymentGateway[] {
  return Object.values(GATEWAYS);
}
