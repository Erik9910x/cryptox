// ===== TRADING: Order execution, validation =====
const Trading = {
  FEE_RATE: 0.001, // 0.1%

  // Execute a trade
  // On Binance Futures, "amount" = margin (what you risk).
  // Position notional = margin * leverage.
  executeOrder({ symbol, side, type, amount, leverage, limitPrice, tp, sl }) {
    const coin = CoinData.state[symbol];
    if (!coin) return { success: false, error: 'Coin not found' };

    leverage = Utils.clamp(leverage || 1, 1, 125);
    amount = parseFloat(amount);
    if (!amount || amount <= 0) return { success: false, error: 'Invalid amount' };

    const available = Account.getAvailable();
    if (amount > available) return { success: false, error: 'Insufficient balance' };

    const entryPrice = type === 'limit' ? limitPrice : coin.price;
    if (!entryPrice || entryPrice <= 0) return { success: false, error: 'Invalid price' };

    // amount = margin (what the user puts up)
    const margin = amount;
    const notional = margin * leverage;
    const fee = notional * this.FEE_RATE;
    const liqPrice = Account.calcLiqPrice(entryPrice, leverage, side === 'buy' ? 'long' : 'short');

    // Validate TP/SL
    if (tp) {
      if (side === 'buy' && tp <= entryPrice) return { success: false, error: 'TP must be above entry for long' };
      if (side === 'sell' && tp >= entryPrice) return { success: false, error: 'TP must be below entry for short' };
    }
    if (sl) {
      if (side === 'buy' && sl >= entryPrice) return { success: false, error: 'SL must be below entry for long' };
      if (side === 'sell' && sl <= entryPrice) return { success: false, error: 'SL must be above entry for short' };
    }

    if (type === 'limit' && limitPrice) {
      // Add as pending order
      const order = {
        id: Utils.uid(),
        symbol,
        side,
        type: 'limit',
        amount,
        leverage,
        limitPrice,
        tp: tp || null,
        sl: sl || null,
        createdAt: Date.now(),
      };
      Account.addPendingOrder(order);
      return { success: true, type: 'pending', order };
    }

    // Market order: open position immediately
    const position = {
      id: Utils.uid(),
      symbol,
      side: side === 'buy' ? 'long' : 'short',
      entryPrice,
      margin,
      leverage,
      size: notional,
      liqPrice,
      tp: tp || null,
      sl: sl || null,
      fee,
      openedAt: Date.now(),
    };

    Account.addPosition(position);
    return { success: true, type: 'position', position, fee };
  },

  // Close a position
  closePosition(positionId) {
    const pos = Account.positions.find(p => p.id === positionId);
    if (!pos) return { success: false, error: 'Position not found' };

    const coin = CoinData.state[pos.symbol];
    const exitPrice = coin ? coin.price : pos.entryPrice;
    const record = Account.closePosition(positionId, exitPrice);

    if (!record) return { success: false, error: 'Failed to close' };
    return { success: true, record };
  },

  // Get position with current P&L
  getPositionWithPnL(position) {
    const coin = CoinData.state[position.symbol];
    const currentPrice = coin ? coin.price : position.entryPrice;
    const pnl = Account.calcPnL(position, currentPrice);
    const pnlPct = (pnl / position.margin) * 100;
    return {
      ...position,
      currentPrice,
      pnl,
      pnlPct,
      marginRatio: (1 - Math.abs(pnl) / position.margin) * 100,
    };
  },
};
