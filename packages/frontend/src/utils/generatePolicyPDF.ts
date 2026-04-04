import { jsPDF } from 'jspdf';

export interface PolicyPDFData {
  policyNumber: string;
  workerName: string;
  workerMobile: string;
  workerPlatform: string;
  riskScore: number;
  riskLabel: string;
  tierLabel: string;
  premium: number;
  coveragePct: number;
  dailyPayout: number;
  maxDays: number;
  formulaPremium: string;
  formulaPayout: string;
  riskFactor: number;
  startDate: string;
  endDate: string;
  transactionRef: string;
  upi: string;
  paymentDate: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generatePolicyPDF(data: PolicyPDFData) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const H = 297;
  const M = 16;
  const CW = W - M * 2;
  let y = 0;

  let logoImg: HTMLImageElement | null = null;
  try { logoImg = await loadImage('/logos/gigshield.png'); } catch { /* text fallback */ }

  // ── Ensure space, add page if needed ──
  const ensureSpace = (needed: number) => {
    if (y + needed > H - 30) {
      drawFooter();
      pdf.addPage();
      y = 15;
    }
  };

  // ════════════════════════════════════════
  // HEADER — 42mm navy band
  // ════════════════════════════════════════
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, W, 42, 'F');
  pdf.setFillColor(59, 130, 246);
  pdf.rect(0, 40, W, 2, 'F');

  if (logoImg) pdf.addImage(logoImg, 'PNG', M, 7, 12, 12);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GigShield', M + (logoImg ? 15 : 0), 16);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(148, 163, 184);
  pdf.text('AI-Powered Parametric Insurance', M + (logoImg ? 15 : 0), 21);

  // Right side
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text('POLICY CERTIFICATE', W - M, 10, { align: 'right' });
  pdf.setFontSize(13);
  pdf.setTextColor(59, 130, 246);
  pdf.text(data.policyNumber, W - M, 18, { align: 'right' });
  pdf.setFontSize(6);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Issued: ${data.paymentDate}`, W - M, 23, { align: 'right' });

  // Active badge
  pdf.setFillColor(16, 185, 129);
  pdf.roundedRect(W - M - 18, 28, 18, 6, 3, 3, 'F');
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text('ACTIVE', W - M - 9, 32, { align: 'center' });

  y = 48;

  // ── Helpers ──
  const sectionTitle = (title: string) => {
    ensureSpace(20);
    pdf.setFillColor(59, 130, 246);
    pdf.rect(M, y, 2, 4, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, M + 4, y + 3.5);
    y += 7;
  };

  const fw = (CW - 3) / 2;
  const qw = (CW - 6) / 3;

  const field = (x: number, w: number, label: string, value: string, clr?: [number, number, number]) => {
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, y, w, 14, 1.5, 1.5, 'F');
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text(label.toUpperCase(), x + 4, y + 5);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...(clr || [15, 23, 42]));
    // Truncate if too long
    let v = value;
    while (pdf.getTextWidth(v) > w - 8 && v.length > 3) v = v.slice(0, -1);
    pdf.text(v, x + 4, y + 11);
  };

  const divider = () => {
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(M, y, W - M, y);
    y += 4;
  };

  const drawFooter = () => {
    const fy = H - 16;
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, fy, W, 16, 'F');
    if (logoImg) pdf.addImage(logoImg, 'PNG', M, fy + 3, 6, 6);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('GigShield', M + (logoImg ? 8 : 0), fy + 7);
    pdf.setFontSize(5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text('Powered by Guidewire | support@gigshield.in', M + (logoImg ? 8 : 0), fy + 11);
    pdf.text('Electronically generated. No signature required.', W - M, fy + 7, { align: 'right' });
    pdf.text(`Policy: ${data.policyNumber}`, W - M, fy + 11, { align: 'right' });
  };

  // ════ POLICYHOLDER ════
  sectionTitle('Policyholder Details');
  field(M, fw, 'Full Name', data.workerName);
  field(M + fw + 3, fw, 'Mobile', data.workerMobile);
  y += 17;
  const pCap = data.workerPlatform.charAt(0).toUpperCase() + data.workerPlatform.slice(1);
  field(M, fw, 'Platform', pCap);
  const riskClr: [number, number, number] = data.riskScore <= 30 ? [16, 185, 129] : data.riskScore <= 60 ? [234, 179, 8] : [239, 68, 68];
  field(M + fw + 3, fw, 'Risk Score', `${data.riskScore}/100 (${data.riskLabel})`, riskClr);
  y += 20;

  // ════ COVERAGE PLAN ════
  ensureSpace(35);
  sectionTitle('Coverage Plan');
  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(191, 219, 254);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(M, y, CW, 26, 2, 2, 'FD');

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(59, 130, 246);
  pdf.text(`${data.tierLabel} Protection Plan`, M + 6, y + 10);

  const mx = [M + 6, M + 48, M + 90, M + 132];
  const mv = [`Rs.${data.premium}`, `${data.coveragePct}%`, `Rs.${data.dailyPayout}`, `${data.maxDays} days`];
  const ml = ['WEEKLY PREMIUM', 'COVERAGE', 'DAILY PAYOUT', 'MAX DAYS'];
  mv.forEach((v, i) => {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(v, mx[i], y + 18);
    pdf.setFontSize(5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(ml[i], mx[i], y + 22);
  });
  y += 32;

  // ════ POLICY PERIOD ════
  ensureSpace(22);
  sectionTitle('Policy Period');
  field(M, qw, 'Start', data.startDate);
  field(M + qw + 3, qw, 'End', data.endDate);
  field(M + (qw + 3) * 2, qw, 'Renew', 'Auto — 7 days', [16, 185, 129]);
  y += 20;

  // ════ PARAMETRIC TRIGGERS ════
  ensureSpace(28);
  sectionTitle('Parametric Triggers');
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.text('Claims auto-triggered when conditions detected in your delivery zone.', M, y);
  y += 4;

  const trigs = [
    ['HEAT', 'Temp > 45°C'],
    ['RAIN', 'Rain > 65mm/hr'],
    ['FLOOD', 'Flood alert'],
    ['AQI', 'AQI > 400'],
    ['BANDH', 'Curfew/Strike'],
  ];
  const tw = (CW - 8) / 5;
  trigs.forEach((t, i) => {
    const tx = M + i * (tw + 2);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(tx, y, tw, 12, 1.5, 1.5, 'F');
    // Badge
    pdf.setFillColor(59, 130, 246);
    pdf.roundedRect(tx + 2, y + 2, 10, 4, 1, 1, 'F');
    pdf.setFontSize(4);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(t[0], tx + 7, y + 4.8, { align: 'center' });
    // Threshold
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(t[1], tx + 2, y + 10);
  });
  y += 18;

  divider();

  // ════ PAYMENT ════
  ensureSpace(22);
  sectionTitle('Payment & Transaction');
  field(M, fw, 'Transaction ID', data.transactionRef);
  field(M + fw + 3, fw, 'UPI', data.upi);
  y += 17;
  field(M, fw, 'Amount Paid', `Rs. ${data.premium}`, [16, 185, 129]);
  field(M + fw + 3, fw, 'Date', data.paymentDate);
  y += 20;

  // ════ FORMULA ════
  ensureSpace(18);
  sectionTitle('Actuarial Breakdown');
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(M, y, CW, 12, 1.5, 1.5, 'F');
  pdf.setFontSize(6.5);
  pdf.setFont('courier', 'normal');
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Premium: ${data.formulaPremium}`, M + 4, y + 5);
  pdf.text(`Payout:  ${data.formulaPayout}`, M + 4, y + 10);
  y += 16;

  // ════ EXCLUSIONS ════
  ensureSpace(22);
  sectionTitle('Exclusions');
  pdf.setFontSize(5.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  const excl = [
    'This policy does NOT cover: health expenses, road accidents, vehicle damage, life insurance, theft, personal liability, or pre-existing conditions.',
    'Coverage is limited to parametric trigger events listed above. Claims are auto-verified via real-time environmental data. No manual filing required.',
  ];
  excl.forEach((line) => {
    const lines = pdf.splitTextToSize(line, CW);
    pdf.text(lines, M, y);
    y += lines.length * 3 + 1;
  });
  y += 2;

  // ════ WATERMARK ════
  try {
    pdf.saveGraphicsState();
    pdf.setGState(new (pdf as any).GState({ opacity: 0.04 }));
    pdf.setFontSize(60);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(16, 185, 129);
    pdf.text('ACTIVE', W / 2, H / 2, { align: 'center', angle: 35 });
    pdf.restoreGraphicsState();
  } catch { /* opacity not supported in all builds */ }

  // ════ FOOTER ════
  drawFooter();

  pdf.save(`GigShield-Policy-${data.policyNumber}.pdf`);
}
