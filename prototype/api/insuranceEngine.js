// Rule-Based Insurance Engine
// Premium = Base × Risk Factor × Coverage Multiplier
// Payout  = Hours Lost × Hourly Rate × Coverage %

const InsuranceEngine = {

  // ── Derived metrics from rider history ──

  // Hourly rate = total earnings / total hours worked
  computeHourlyRate(profile) {
    if (!profile || !profile.totalHoursWorked || profile.totalHoursWorked === 0) return 100; // ₹100/hr fallback
    return Math.round(profile.totalEarnings / profile.totalHoursWorked);
  },

  // Average hours worked per day
  computeAvgHoursPerDay(profile) {
    if (!profile || !profile.workDays || profile.workDays === 0) return 8;
    return Math.round((profile.totalHoursWorked / profile.workDays) * 10) / 10;
  },

  // Daily income = hourly rate × avg hours/day
  estimateDailyIncome(profile) {
    return this.computeHourlyRate(profile) * this.computeAvgHoursPerDay(profile);
  },

  // ── Risk Score (0–100) ──

  computeRiskScore(profile, zoneRisk) {
    let score = zoneRisk * 0.4; // 40% from zone

    if (profile) {
      // Disruption frequency: higher = riskier
      score += (profile.disruptionRate / 100) * 30;

      // Platform rating: lower = riskier
      const ratingPenalty = Math.max(0, (4.5 - profile.latestRating) * 10);
      score += ratingPenalty;

      // Work consistency: fewer work days = riskier
      const consistency = profile.workDays / profile.totalDays;
      score += (1 - consistency) * 20;
    } else {
      score += 25; // unknown rider penalty
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  },

  // ── Risk Factor (from risk score) ──
  // Maps 0–100 score to a 0.5–2.5 multiplier
  computeRiskFactor(riskScore) {
    return 0.5 + (riskScore / 100) * 2.0;
  },

  // ── Coverage tiers ──
  tiers: {
    basic:    { coveragePct: 0.50, basePremium: 20, maxDays: 3 },
    standard: { coveragePct: 0.75, basePremium: 35, maxDays: 5 },
    premium:  { coveragePct: 1.00, basePremium: 50, maxDays: 7 }
  },

  // ── PREMIUM = Base × Risk Factor × Coverage Multiplier ──
  computePremium(tier, riskScore, profile) {
    const t = this.tiers[tier];
    const base = t.basePremium;
    const riskFactor = this.computeRiskFactor(riskScore);
    const coverageMultiplier = 0.6 + (t.coveragePct * 0.8); // 1.0 → 1.1 → 1.4

    let premium = Math.round(base * riskFactor * coverageMultiplier);

    // Loyalty discount: rating ≥ 4.7 gets 10% off
    if (profile && profile.latestRating >= 4.7) {
      premium = Math.round(premium * 0.9);
    }

    // Clamp ₹29–199
    return Math.max(29, Math.min(199, premium));
  },

  // ── PAYOUT = Hours Lost × Hourly Rate × Coverage % ──
  computePayout(hoursLost, hourlyRate, coveragePct) {
    return Math.round(hoursLost * hourlyRate * coveragePct);
  },

  // Estimate daily payout (for plan display): assume full day lost (avg hours)
  computeDailyPayout(profile, tier) {
    const hourlyRate = this.computeHourlyRate(profile);
    const avgHours = this.computeAvgHoursPerDay(profile);
    const coveragePct = this.tiers[tier].coveragePct;
    return this.computePayout(avgHours, hourlyRate, coveragePct);
  },

  // ── Generate all 3 plans for a rider ──
  generatePlans(profile, zoneRisk) {
    const hourlyRate = this.computeHourlyRate(profile);
    const avgHours = this.computeAvgHoursPerDay(profile);
    const dailyIncome = Math.round(hourlyRate * avgHours);
    const riskScore = this.computeRiskScore(profile, zoneRisk);
    const riskFactor = this.computeRiskFactor(riskScore);

    return ['basic', 'standard', 'premium'].map(tier => {
      const t = this.tiers[tier];
      const premium = this.computePremium(tier, riskScore, profile);
      const dailyPayout = this.computeDailyPayout(profile, tier);

      return {
        tier,
        premium,
        dailyPayout,
        maxDays: t.maxDays,
        coveragePct: Math.round(t.coveragePct * 100),
        hourlyRate,
        avgHours,
        dailyIncome,
        riskScore,
        riskFactor: Math.round(riskFactor * 100) / 100,
        formula: {
          premium: `₹${t.basePremium} × ${Math.round(riskFactor*100)/100} × ${Math.round((0.6+t.coveragePct*0.8)*100)/100}`,
          payout: `${avgHours}hrs × ₹${hourlyRate}/hr × ${Math.round(t.coveragePct*100)}%`
        }
      };
    });
  }
};
