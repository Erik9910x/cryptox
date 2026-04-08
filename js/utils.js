// ===== UTILS =====
const Utils = {
  // Format number as currency
  fmt(n, decimals = 2) {
    if (n == null || isNaN(n)) return '0.00';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return n.toFixed(decimals);
  },

  fmtPrice(n) {
    if (n == null || isNaN(n)) return '$0.00';
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.01) return '$' + n.toFixed(4);
    return '$' + n.toFixed(6);
  },

  fmtPct(n) {
    if (n == null || isNaN(n)) return '+0.00%';
    const sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  },

  fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  // Local storage helpers
  save(key, data) {
    try { localStorage.setItem('cryptox_' + key, JSON.stringify(data)); } catch (e) {}
  },

  load(key, fallback = null) {
    try {
      const d = localStorage.getItem('cryptox_' + key);
      return d ? JSON.parse(d) : fallback;
    } catch (e) { return fallback; }
  },

  remove(key) {
    try { localStorage.removeItem('cryptox_' + key); } catch (e) {}
  },

  // Random in range
  rand(min, max) { return Math.random() * (max - min) + min; },

  // Clamp
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  // Generate unique ID
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  // Debounce
  debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
};
