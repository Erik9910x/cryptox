// ===== APP: Main entry point =====
(function () {
  'use strict';

  // Initialize data
  CoinData.init();
  Account.init();
  WebhookManager.init();
  UI.init();

  // ===== PRICE SIMULATION LOOP =====
  let tickInterval = null;
  let chartTickCount = 0;

  function startPriceEngine() {
    function tick() {
      CoinData.tick();
      chartTickCount++;

      // Update UI based on current page
      if (UI.currentPage === 'markets') {
        UI.updateMarketPrices();
      }

      if (UI.currentPage === 'trade') {
        UI.updateTradePrices();
      }

      // Check liquidations every tick
      const liquidated = Account.checkLiquidations();
      liquidated.forEach(l => {
        const reason = l.liquidated ? 'Liquidated' : (l.tpHit ? 'TP Hit' : 'SL Hit');
        const pnlText = l.pnl >= 0 ? `+$${Utils.fmt(l.pnl)}` : `-$${Utils.fmt(Math.abs(l.pnl))}`;
        UI.showToast(`${reason}: ${l.symbol} ${l.side} ${pnlText}`, l.pnl >= 0 ? 'success' : 'error');
        UI.updateBalanceDisplay();
        // Send webhook notification for closed position
        WebhookManager.sendCloseNotification(l);
      });

      // Check pending limit orders
      const executed = Account.checkPendingOrders();
      executed.forEach(e => {
        if (e.success && e.type === 'position') {
          UI.showToast(`Limit order filled: ${e.position.side.toUpperCase()} ${e.position.symbol}`, 'success');
          UI.updateBalanceDisplay();
        }
      });

      // Update header balance
      UI.updateBalanceDisplay();

      // Schedule next tick — 300ms for snappy chart feel
      tickInterval = setTimeout(tick, 300);
    }

    tick();
  }

  startPriceEngine();

  // Update portfolio/history periodically if on those pages
  setInterval(() => {
    if (UI.currentPage === 'portfolio') {
      UI.renderPortfolio();
    }
  }, 3000);

  // Webhook auto-send on separate interval (non-blocking)
  setInterval(() => {
    WebhookManager.autoSendAll();
  }, 15000); // Check every 15s, internal throttle controls actual send rate

  // Handle visibility change — pause/resume
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(tickInterval);
    } else {
      startPriceEngine();
    }
  });

  // Prevent actual form submission
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
    }
  });

  console.log('CryptoX Demo Trading Platform initialized');
  console.log('20 coins loaded, $10,000 demo balance');
})();
