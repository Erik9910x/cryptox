// ===== ACCOUNT: Balance, history, persistence =====
const Account = {
  INITIAL_BALANCE: 10000,
  balance: 10000,
  positions: [],
  history: [],
  pendingOrders: [],
  transactionLog: [],

  init() {
    const saved = Utils.load('account');
    if (saved) {
      this.balance = saved.balance;
      this.positions = saved.positions || [];
      this.history = saved.history || [];
      this.pendingOrders = saved.pendingOrders || [];
      this.transactionLog = saved.transactionLog || [];
    } else {
      this.reset();
    }
  },

  save() {
    Utils.save('account', {
      balance: this.balance,
      positions: this.positions,
      history: this.history,
      pendingOrders: this.pendingOrders,
      transactionLog: this.transactionLog,
    });
  },

  reset() {
    this.balance = this.INITIAL_BALANCE;
    this.positions = [];
    this.history = [];
    this.pendingOrders = [];
    this.transactionLog = [];
    this.save();
  },

  // Get total margin used
  getMarginUsed() {
    return this.positions.reduce((sum, p) => sum + p.margin, 0);
  },

  // Get available balance (balance - margin used)
  getAvailable() {
    return this.balance - this.getMarginUsed();
  },

  // Get unrealized P&L
  getUnrealizedPnL() {
    return this.positions.reduce((sum, p) => {
      const currentPrice = CoinData.state[p.symbol]?.price || p.entryPrice;
      return sum + this.calcPnL(p, currentPrice);
    }, 0);
  },

  // Get total equity
  getEquity() {
    return this.balance + this.getUnrealizedPnL();
  },

  // Calculate P&L for a position at a given price
  calcPnL(position, currentPrice) {
    const priceDiff = position.side === 'long'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    return (priceDiff / position.entryPrice) * position.margin * position.leverage;
  },

  // Calculate liquidation price (Binance-style)
  // Maintenance margin rate ~0.4% for BTC, ~1% for alts at high leverage
  calcLiqPrice(entryPrice, leverage, side) {
    // MMR (Maintenance Margin Rate) — simplified: 0.4% base
    const mmr = 0.004;
    // Liquidation = entry * (1 - (1/leverage - MMR)) for long
    const liqPct = (1 / leverage) - mmr;
    if (side === 'long') {
      return entryPrice * (1 - liqPct);
    } else {
      return entryPrice * (1 + liqPct);
    }
  },

  // Add position
  addPosition(position) {
    this.positions.push(position);
    this.transactionLog.push({ type: 'open', position, time: Date.now() });
    this.save();
  },

  // Close position
  closePosition(id, exitPrice) {
    const idx = this.positions.findIndex(p => p.id === id);
    if (idx === -1) return null;

    const pos = this.positions[idx];
    const pnl = this.calcPnL(pos, exitPrice);
    const fee = pos.size * 0.001; // 0.1% fee on notional

    // Return margin + P&L - fee to balance
    this.balance += pnl - fee;

    const record = {
      ...pos,
      exitPrice,
      pnl: pnl - fee,
      fee,
      closedAt: Date.now(),
    };
    this.history.unshift(record);
    this.positions.splice(idx, 1);
    this.transactionLog.push({ type: 'close', record, time: Date.now() });
    this.save();
    return record;
  },

  // Check and close liquidated positions
  checkLiquidations() {
    const liquidated = [];
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const pos = this.positions[i];
      const currentPrice = CoinData.state[pos.symbol]?.price;
      if (!currentPrice) continue;

      let liquidated_ = false;
      if (pos.side === 'long' && currentPrice <= pos.liqPrice) liquidated_ = true;
      if (pos.side === 'short' && currentPrice >= pos.liqPrice) liquidated_ = true;

      if (liquidated_) {
        const record = this.closePosition(pos.id, currentPrice);
        if (record) {
          record.liquidated = true;
          liquidated.push(record);
        }
      }

      // Check TP
      if (pos.tp) {
        if (pos.side === 'long' && currentPrice >= pos.tp) {
          const record = this.closePosition(pos.id, pos.tp);
          if (record) { record.tpHit = true; liquidated.push(record); }
        }
        if (pos.side === 'short' && currentPrice <= pos.tp) {
          const record = this.closePosition(pos.id, pos.tp);
          if (record) { record.tpHit = true; liquidated.push(record); }
        }
      }

      // Check SL
      if (pos.sl) {
        if (pos.side === 'long' && currentPrice <= pos.sl) {
          const record = this.closePosition(pos.id, pos.sl);
          if (record) { record.slHit = true; liquidated.push(record); }
        }
        if (pos.side === 'short' && currentPrice >= pos.sl) {
          const record = this.closePosition(pos.id, pos.sl);
          if (record) { record.slHit = true; liquidated.push(record); }
        }
      }
    }
    return liquidated;
  },

  // Check pending limit orders
  checkPendingOrders() {
    const executed = [];
    for (let i = this.pendingOrders.length - 1; i >= 0; i--) {
      const order = this.pendingOrders[i];
      const coin = CoinData.state[order.symbol];
      if (!coin) continue;

      let shouldExecute = false;
      if (order.side === 'buy' && coin.price <= order.limitPrice) shouldExecute = true;
      if (order.side === 'sell' && coin.price >= order.limitPrice) shouldExecute = true;

      if (shouldExecute) {
        this.pendingOrders.splice(i, 1);
        const result = Trading.executeOrder({
          symbol: order.symbol,
          side: order.side,
          type: 'market',
          amount: order.amount,
          leverage: order.leverage,
          tp: order.tp,
          sl: order.sl,
        });
        result.fromLimit = order;
        executed.push(result);
      }
    }
    if (executed.length > 0) this.save();
    return executed;
  },

  addPendingOrder(order) {
    this.pendingOrders.push(order);
    this.save();
  },

  cancelPendingOrder(id) {
    const idx = this.pendingOrders.findIndex(o => o.id === id);
    if (idx !== -1) {
      this.pendingOrders.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  },
};
