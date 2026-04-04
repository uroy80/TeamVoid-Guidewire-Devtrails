export interface DisburseResult {
  success: boolean;
  transactionRef: string;
  error?: string;
}

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RZP-${code}`;
}

/**
 * Mock Razorpay payout. Simulates a 95% success rate.
 */
export async function disburse(
  amount: number,
  upiId: string
): Promise<DisburseResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300));

  const transactionRef = generateRef();
  const success = Math.random() < 0.95;

  if (!success) {
    return {
      success: false,
      transactionRef,
      error: 'Payment gateway timeout: bank not reachable',
    };
  }

  console.log(
    `[RazorpayMock] Disbursed INR ${amount} to ${upiId} | ref: ${transactionRef}`
  );

  return { success, transactionRef };
}
