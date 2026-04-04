// Mock API — loads CSV rider data, provides lookup + rule-based insurance engine

const RiderAPI = {
  _cache: {},

  // Load and parse a CSV file
  async _loadCSV(platform) {
    if (this._cache[platform]) return this._cache[platform];
    try {
      const res = await fetch(`api/${platform}_riders.csv`);
      const text = await res.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',');
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = vals[i]?.trim());
        obj.deliveries = parseInt(obj.deliveries) || 0;
        obj.earnings_inr = parseInt(obj.earnings_inr) || 0;
        obj.hours_worked = parseFloat(obj.hours_worked) || 0;
        obj.disruption_hours_lost = parseFloat(obj.disruption_hours_lost) || 0;
        obj.platform_rating = parseFloat(obj.platform_rating) || 0;
        return obj;
      });
      this._cache[platform] = rows;
      return rows;
    } catch (e) {
      console.warn(`Failed to load ${platform} CSV:`, e);
      return [];
    }
  },

  // Lookup rider by mobile number across a platform
  async findRider(platform, mobile) {
    const rows = await this._loadCSV(platform);
    return rows.filter(r => r.mobile === mobile);
  },

  // Get rider summary stats from their history
  computeRiderProfile(records) {
    if (!records.length) return null;
    const r = records[0];
    const totalDays = records.length;
    const workDays = records.filter(d => d.deliveries > 0).length;
    const totalEarnings = records.reduce((s, d) => s + d.earnings_inr, 0);
    const totalDeliveries = records.reduce((s, d) => s + d.deliveries, 0);
    const totalHoursLost = records.reduce((s, d) => s + d.disruption_hours_lost, 0);
    const totalHoursWorked = records.reduce((s, d) => s + d.hours_worked, 0);
    const disruptionDays = records.filter(d => d.disruption_type !== 'none').length;
    const avgDailyEarning = workDays > 0 ? Math.round(totalEarnings / workDays) : 0;
    const avgDeliveriesPerDay = workDays > 0 ? Math.round(totalDeliveries / workDays) : 0;
    const latestRating = records[records.length - 1].platform_rating;

    // Disruption breakdown
    const disruptionBreakdown = {};
    records.filter(d => d.disruption_type !== 'none').forEach(d => {
      disruptionBreakdown[d.disruption_type] = (disruptionBreakdown[d.disruption_type] || 0) + 1;
    });

    return {
      rider_id: r.rider_id,
      name: r.name,
      mobile: r.mobile,
      aadhaar: r.aadhaar || '',
      city: r.city,
      zone: r.zone,
      store_id: r.store_id,
      totalDays,
      workDays,
      totalEarnings,
      totalDeliveries,
      avgDailyEarning,
      avgDeliveriesPerDay,
      totalHoursLost,
      totalHoursWorked,
      disruptionDays,
      disruptionRate: Math.round((disruptionDays / totalDays) * 100),
      disruptionBreakdown,
      latestRating,
      monthsActive: 6
    };
  }
};
