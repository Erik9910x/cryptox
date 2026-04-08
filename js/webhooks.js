// ===== WEBHOOKS: Discord webhook management & sending =====
const WebhookManager = {
  url: '',              // single global webhook URL
  enabled: false,
  lastSent: 0,          // last auto-send timestamp
  sendInterval: 60000,  // min ms between auto-sends

  init() {
    const saved = Utils.load('webhooks');
    if (saved) {
      this.url = saved.url || '';
      this.enabled = saved.enabled || false;
      this.sendInterval = saved.sendInterval || 60000;
    }
  },

  save() {
    Utils.save('webhooks', {
      url: this.url,
      enabled: this.enabled,
      sendInterval: this.sendInterval,
    });
  },

  setUrl(url) {
    this.url = url;
    this.enabled = true;
    this.save();
  },

  removeUrl() {
    this.url = '';
    this.enabled = false;
    this.save();
  },

  toggle() {
    this.enabled = !this.enabled;
    this.save();
  },

  // Format duration from ms to human readable
  formatDuration(ms) {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return days + 'd ' + (hours % 24) + 'h ' + (mins % 60) + 'm';
    if (hours > 0) return hours + 'h ' + (mins % 60) + 'm';
    if (mins > 0) return mins + 'm ' + (secs % 60) + 's';
    return secs + 's';
  },

  // Build embed for all open positions
  buildPositionEmbed() {
    const positions = Account.positions;
    if (positions.length === 0) return null;

    const equity = Account.getEquity();
    const marginUsed = Account.getMarginUsed();

    const fields = [];

    // Group positions by symbol
    positions.forEach((pos, i) => {
      const coin = CoinData.state[pos.symbol];
      const withPnl = Trading.getPositionWithPnL(pos);
      const pnlSign = withPnl.pnl >= 0 ? '+' : '';
      const duration = this.formatDuration(Date.now() - pos.openedAt);
      const marginRatio = withPnl.marginRatio.toFixed(1);

      if (positions.length > 1) {
        fields.push({ name: '\u200b', value: `**━━━━━ ${pos.symbol}/USDT ━━━━━**`, inline: false });
      }

      // Market data
      if (coin) {
        fields.push(
          { name: 'Price', value: '$' + Utils.fmtPrice(coin.price), inline: true },
          { name: '24h Change', value: Utils.fmtPct(coin.change24h), inline: true },
          { name: '\u200b', value: '\u200b', inline: true }
        );
      }

      fields.push(
        { name: 'Direction', value: pos.side === 'long' ? 'LONG' : 'SHORT', inline: true },
        { name: 'Leverage', value: pos.leverage + 'x', inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Entry', value: '$' + Utils.fmtPrice(pos.entryPrice), inline: true },
        { name: 'Mark', value: '$' + Utils.fmtPrice(withPnl.currentPrice), inline: true },
        { name: 'Deviation', value: (((withPnl.currentPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(3) + '%', inline: true },
        { name: 'Margin', value: '$' + Utils.fmt(pos.margin), inline: true },
        { name: 'Size', value: '$' + Utils.fmt(pos.size), inline: true },
        { name: 'Margin Ratio', value: marginRatio + '%', inline: true },
        { name: 'P&L', value: pnlSign + '$' + Utils.fmt(withPnl.pnl) + ' (' + pnlSign + withPnl.pnlPct.toFixed(2) + '%)', inline: true },
        { name: 'Liq. Price', value: '$' + Utils.fmtPrice(pos.liqPrice), inline: true },
        { name: 'TP / SL', value: (pos.tp ? '$' + Utils.fmtPrice(pos.tp) : '—') + ' / ' + (pos.sl ? '$' + Utils.fmtPrice(pos.sl) : '—'), inline: true }
      );
    });

    // Total PnL across all positions
    const totalPnl = positions.reduce((sum, pos) => {
      return sum + Trading.getPositionWithPnL(pos).pnl;
    }, 0);
    const embedColor = totalPnl >= 0 ? 0x0ecb81 : 0xf6465d;

    const marginPct = equity > 0 ? ((marginUsed / equity) * 100).toFixed(1) : '0.0';

    fields.push(
      { name: '\u200b', value: '**━━━━━ Account Summary ━━━━━**', inline: false },
      { name: 'Total Equity', value: '$' + Utils.fmt(equity), inline: true },
      { name: 'Margin Used', value: '$' + Utils.fmt(marginUsed) + ' (' + marginPct + '%)', inline: true },
      { name: 'Available', value: '$' + Utils.fmt(Account.getAvailable()), inline: true }
    );

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    return {
      embeds: [{
        title: `CRYPTOX POSITION REPORT`,
        color: embedColor,
        fields: fields,
        footer: { text: `CryptoX | ${positions.length} open position(s) | ${timestamp}` },
        timestamp: new Date().toISOString(),
      }]
    };
  },

  // Build test embed
  buildTestEmbed() {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    return {
      embeds: [{
        title: 'CRYPTOX CONNECTION TEST',
        color: 0xf0b90b,
        fields: [
          { name: 'Status', value: 'Operational', inline: true },
          { name: 'Positions', value: Account.positions.length + ' open', inline: true },
          { name: 'Equity', value: '$' + Utils.fmt(Account.getEquity()), inline: true },
          { name: 'Message', value: 'Webhook connection verified successfully. All position reports will be delivered to this channel.', inline: false },
        ],
        footer: { text: `CryptoX | Connection Test | ${timestamp}` },
        timestamp: new Date().toISOString(),
      }]
    };
  },

  // Send to Discord webhook
  async send(payload) {
    if (!this.url) return { success: false, error: 'No webhook URL' };
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text}` };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // Test the webhook
  async testWebhook() {
    if (!this.url) return { success: false, error: 'No webhook URL configured' };
    const payload = this.buildTestEmbed();
    return this.send(payload);
  },

  // Auto-send all open positions (throttled)
  async autoSendAll() {
    if (!this.url || !this.enabled) return;
    if (Account.positions.length === 0) return;

    const now = Date.now();
    if ((now - this.lastSent) < this.sendInterval) return;

    const payload = this.buildPositionEmbed();
    if (!payload) return;

    const result = await this.send(payload);
    if (result.success) {
      this.lastSent = now;
    }
  },

  // Build embed for closed/liquidated/TP/SL position
  buildClosedPositionEmbed(record) {
    const isProfit = record.pnl >= 0;
    const pnlSign = isProfit ? '+' : '';
    const embedColor = isProfit ? 0x0ecb81 : 0xf6465d;

    let closeReason = 'Manual Close';
    let emoji = '\u{1F4C8}';
    if (record.liquidated) { closeReason = 'LIQUIDATED'; emoji = '\u{1F4A5}'; }
    else if (record.tpHit) { closeReason = 'Take Profit Hit'; emoji = '\u{1F3AF}'; }
    else if (record.slHit) { closeReason = 'Stop Loss Hit'; emoji = '\u{1F6D1}'; }
    else if (isProfit) { emoji = '\u{1F4C8}'; }
    else { emoji = '\u{1F4C9}'; }

    const duration = this.formatDuration(record.closedAt - record.openedAt);
    const priceChange = ((record.exitPrice - record.entryPrice) / record.entryPrice * 100).toFixed(3);
    const roiPct = record.margin > 0 ? ((record.pnl / record.margin) * 100).toFixed(2) : '0.00';

    const equity = Account.getEquity();
    const marginUsed = Account.getMarginUsed();
    const marginPct = equity > 0 ? ((marginUsed / equity) * 100).toFixed(1) : '0.0';

    const fields = [
      { name: '\u200b', value: '**━━━━━ Trade Summary ━━━━━**', inline: false },
      { name: 'Direction', value: record.side === 'long' ? 'LONG (Buy)' : 'SHORT (Sell)', inline: true },
      { name: 'Leverage', value: record.leverage + 'x', inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Entry Price', value: '$' + Utils.fmtPrice(record.entryPrice), inline: true },
      { name: 'Exit Price', value: '$' + Utils.fmtPrice(record.exitPrice), inline: true },
      { name: 'Price Change', value: priceChange + '%', inline: true },
      { name: 'Margin', value: '$' + Utils.fmt(record.margin), inline: true },
      { name: 'Position Size', value: '$' + Utils.fmt(record.size), inline: true },
      { name: 'Fee', value: '$' + Utils.fmt(record.fee), inline: true },
      { name: 'P&L', value: pnlSign + '$' + Utils.fmt(record.pnl) + ' (' + pnlSign + roiPct + '%)', inline: true },
    ];

    if (record.tp) {
      fields.push({ name: 'Take Profit', value: '$' + Utils.fmtPrice(record.tp), inline: true });
    }
    if (record.sl) {
      fields.push({ name: 'Stop Loss', value: '$' + Utils.fmtPrice(record.sl), inline: true });
    }

    fields.push(
      { name: '\u200b', value: '**━━━━━ Account After Close ━━━━━**', inline: false },
      { name: 'Total Equity', value: '$' + Utils.fmt(equity), inline: true },
      { name: 'Margin Used', value: '$' + Utils.fmt(marginUsed) + ' (' + marginPct + '%)', inline: true },
      { name: 'Available Balance', value: '$' + Utils.fmt(Account.getAvailable()), inline: true }
    );

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    return {
      embeds: [{
        title: `${emoji} ${record.symbol}/USDT CLOSED \u2014 ${closeReason}`,
        color: embedColor,
        fields: fields,
        footer: { text: `CryptoX | Trade closed ${timestamp}` },
        timestamp: new Date().toISOString(),
      }]
    };
  },

  // Send close/liquidation notification (immediate, no throttle)
  async sendCloseNotification(record) {
    if (!this.url || !this.enabled) return null;
    const payload = this.buildClosedPositionEmbed(record);
    return this.send(payload);
  },
};
