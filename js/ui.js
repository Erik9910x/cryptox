// ===== UI: DOM rendering, navigation, event handling =====
const UI = {
  currentPage: 'markets',
  tradeSymbol: 'BTC',
  orderSide: 'buy',
  orderType: 'market',
  sortBy: 'name',
  sortDir: 1,
  searchQuery: '',
  selectedPct: null,

  init() {
    this.bindNav();
    this.bindSearch();
    this.bindSort();
    this.bindTradeControls();
    this.bindOrderControls();
    this.bindWebhookControls();
    this.bindReset();
    this.renderMarkets();
  },

  // ===== NAVIGATION =====
  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.navigateTo(btn.dataset.page);
      });
    });
  },

  navigateTo(page, symbol) {
    this.currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    if (page === 'trade') {
      if (symbol) this.tradeSymbol = symbol;
      this.loadTrade();
    } else if (page === 'portfolio') {
      this.renderPortfolio();
    } else if (page === 'history') {
      this.renderHistory();
    } else if (page === 'webhooks') {
      this.renderWebhooks();
    } else if (page === 'markets') {
      this.renderMarkets();
    }
  },

  // ===== SEARCH =====
  bindSearch() {
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderMarkets();
    });
  },

  // ===== SORT =====
  bindSort() {
    document.querySelectorAll('.markets-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.sortBy === col) {
          this.sortDir *= -1;
        } else {
          this.sortBy = col;
          this.sortDir = 1;
        }
        this.renderMarkets();
      });
    });
  },

  // ===== RESET =====
  bindReset() {
    const modal = document.getElementById('reset-modal');
    document.getElementById('reset-btn').addEventListener('click', () => modal.classList.add('show'));
    document.getElementById('reset-cancel').addEventListener('click', () => modal.classList.remove('show'));
    document.getElementById('reset-confirm').addEventListener('click', () => {
      Account.reset();
      modal.classList.remove('show');
      this.updateBalanceDisplay();
      this.renderMarkets();
      if (this.currentPage === 'portfolio') this.renderPortfolio();
      if (this.currentPage === 'history') this.renderHistory();
      UI.showToast('Account reset to $10,000', 'info');
    });
  },

  // ===== MARKETS TABLE =====
  renderMarkets() {
    let coins = CoinData.getAllCoins();

    // Filter
    if (this.searchQuery) {
      coins = coins.filter(c =>
        c.symbol.toLowerCase().includes(this.searchQuery) ||
        c.name.toLowerCase().includes(this.searchQuery)
      );
    }

    // Sort
    coins.sort((a, b) => {
      let va, vb;
      switch (this.sortBy) {
        case 'name': va = a.name; vb = b.name; return va.localeCompare(vb) * this.sortDir;
        case 'price': va = a.price; vb = b.price; break;
        case 'change': va = a.change24h; vb = b.change24h; break;
        case 'volume': va = a.volume24h; vb = b.volume24h; break;
        default: va = a.name; vb = b.name; return va.localeCompare(vb) * this.sortDir;
      }
      return (va - vb) * this.sortDir;
    });

    const tbody = document.getElementById('markets-body');
    tbody.innerHTML = coins.map(c => {
      const changeClass = c.change24h >= 0 ? 'positive' : 'negative';
      const changeText = Utils.fmtPct(c.change24h);
      return `
        <tr data-symbol="${c.symbol}">
          <td>
            <div class="coin-cell">
              <div class="coin-icon coin-${c.symbol.toLowerCase()}">${c.symbol.charAt(0)}</div>
              <span class="coin-name">${c.name}</span>
              <span class="coin-symbol">${c.symbol}/USDT</span>
            </div>
          </td>
          <td class="price-cell" data-price="${c.symbol}">${Utils.fmtPrice(c.price)}</td>
          <td class="change-cell ${changeClass}">${changeText}</td>
          <td class="high-low-cell">${Utils.fmtPrice(c.high24h)} / ${Utils.fmtPrice(c.low24h)}</td>
          <td class="volume-cell">${Utils.fmt(c.volume24h)}</td>
          <td class="sparkline-cell"><canvas class="sparkline" data-sparkline="${c.symbol}"></canvas></td>
          <td><button class="btn btn-sm btn-primary trade-link" data-symbol="${c.symbol}">Trade</button></td>
        </tr>
      `;
    }).join('');

    // Draw sparklines
    tbody.querySelectorAll('.sparkline').forEach(canvas => {
      const sym = canvas.dataset.sparkline;
      const coin = CoinData.state[sym];
      if (coin) drawSparkline(canvas, coin.sparkline);
    });

    // Row click → trade
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.trade-link')) return;
        this.navigateTo('trade', row.dataset.symbol);
      });
    });

    // Trade button click
    tbody.querySelectorAll('.trade-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigateTo('trade', btn.dataset.symbol);
      });
    });

    // Update sort arrows
    document.querySelectorAll('.markets-table th[data-sort]').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.sort === this.sortBy) {
        arrow.textContent = this.sortDir === 1 ? '▲' : '▼';
      } else {
        arrow.textContent = '';
      }
    });
  },

  // Update market prices without full re-render
  updateMarketPrices() {
    CoinData.getAllCoins().forEach(c => {
      const priceEl = document.querySelector(`[data-price="${c.symbol}"]`);
      if (priceEl) {
        const old = priceEl.textContent;
        const newPrice = Utils.fmtPrice(c.price);
        if (old !== newPrice) {
          priceEl.textContent = newPrice;
          priceEl.classList.remove('price-up', 'price-down');
          priceEl.classList.add(c.price > c.prevPrice ? 'price-up' : 'price-down');
          setTimeout(() => priceEl.classList.remove('price-up', 'price-down'), 400);
        }
      }

      // Update change
      const row = priceEl?.closest('tr');
      if (row) {
        const changeEl = row.querySelector('.change-cell');
        if (changeEl) {
          changeEl.textContent = Utils.fmtPct(c.change24h);
          changeEl.className = 'change-cell ' + (c.change24h >= 0 ? 'positive' : 'negative');
        }
      }
    });
  },

  // ===== TRADE PAGE =====
  loadTrade() {
    const coin = CoinData.state[this.tradeSymbol];
    if (!coin) return;

    // Top bar
    const icon = document.getElementById('trade-coin-icon');
    icon.className = 'coin-icon coin-' + coin.symbol.toLowerCase() + ' fut-coin-icon-inline';
    icon.textContent = coin.symbol.charAt(0);
    document.getElementById('trade-coin-name').textContent = coin.name;
    document.getElementById('trade-coin-symbol').textContent = coin.symbol + 'USDT';
    document.getElementById('trade-price').textContent = Utils.fmtPrice(coin.price);
    const chgEl = document.getElementById('trade-change');
    chgEl.textContent = Utils.fmtPct(coin.change24h);
    chgEl.className = 'fut-price-change ' + (coin.change24h >= 0 ? 'positive' : 'negative');
    document.getElementById('trade-mark-price').textContent = Utils.fmtPrice(coin.price);
    document.getElementById('trade-index-price').textContent = Utils.fmtPrice(coin.price * (1 + Utils.rand(-0.0001, 0.0001)));
    document.getElementById('trade-high').textContent = Utils.fmtPrice(coin.high24h);
    document.getElementById('trade-low').textContent = Utils.fmtPrice(coin.low24h);
    document.getElementById('trade-vol').textContent = Utils.fmt(coin.volume24h);
    this.updateFundingCountdown();

    // Init chart
    const container = document.getElementById('chart-wrapper');
    ChartManager.init(container);
    ChartManager.loadChart(this.tradeSymbol, ChartManager.currentTimeframe);

    // Order book
    this.renderOrderBook();

    // Positions
    this.renderPositionsMini();

    // Available balance
    document.getElementById('available-balance').textContent = Utils.fmt(Account.getAvailable()) + ' USDT';
    this.updateOrderInfo();
  },

  _fundingTarget: null,
  updateFundingCountdown() {
    // Next funding at 00:00, 08:00, 16:00 UTC
    const now = new Date();
    const utcH = now.getUTCHours();
    const fundingHours = [0, 8, 16];
    let nextH = fundingHours.find(h => h > utcH);
    if (nextH === undefined) nextH = fundingHours[0] + 24;
    const diff = (nextH - utcH) * 3600 - now.getUTCMinutes() * 60 - now.getUTCSeconds();
    const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const ss = String(diff % 60).padStart(2, '0');
    document.getElementById('trade-countdown').textContent = hh + ':' + mm + ':' + ss;
    // Random funding rate
    document.getElementById('trade-funding').textContent = (Utils.rand(-0.01, 0.01)).toFixed(4) + '%';
  },

  updateTradePrices() {
    if (this.currentPage !== 'trade') return;
    const coin = CoinData.state[this.tradeSymbol];
    if (!coin) return;

    document.getElementById('trade-price').textContent = Utils.fmtPrice(coin.price);
    const chgEl = document.getElementById('trade-change');
    chgEl.textContent = Utils.fmtPct(coin.change24h);
    chgEl.className = 'fut-price-change ' + (coin.change24h >= 0 ? 'positive' : 'negative');
    document.getElementById('trade-mark-price').textContent = Utils.fmtPrice(coin.price);
    document.getElementById('trade-index-price').textContent = Utils.fmtPrice(coin.price * (1 + Utils.rand(-0.0001, 0.0001)));
    document.getElementById('trade-high').textContent = Utils.fmtPrice(coin.high24h);
    document.getElementById('trade-low').textContent = Utils.fmtPrice(coin.low24h);
    document.getElementById('trade-vol').textContent = Utils.fmt(coin.volume24h);

    ChartManager.updateLastCandle();
    this.renderOrderBook();
    this.renderPositionsMini();
    this.updateOrderInfo();
  },

  // ===== TRADE CONTROLS =====
  bindTradeControls() {
    // Timeframe buttons
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ChartManager.loadChart(this.tradeSymbol, btn.dataset.tf);
      });
    });

    // TP/SL toggle
    const tpslBtn = document.getElementById('tpsl-toggle');
    if (tpslBtn) {
      tpslBtn.addEventListener('click', () => {
        const tpGroup = document.getElementById('tp-group');
        const slGroup = document.getElementById('sl-group');
        const showing = tpGroup.style.display !== 'none';
        tpGroup.style.display = showing ? 'none' : '';
        slGroup.style.display = showing ? 'none' : '';
        tpslBtn.classList.toggle('active', !showing);
        tpslBtn.textContent = showing ? '+ TP/SL' : '− TP/SL';
      });
    }

    // Bottom tabs
    document.querySelectorAll('.fut-btab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fut-btab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // For now only positions tab exists
      });
    });
  },

  bindOrderControls() {
    // Buy/Sell tabs
    document.getElementById('tab-buy').addEventListener('click', () => {
      this.orderSide = 'buy';
      document.getElementById('tab-buy').className = 'order-tab active-buy';
      document.getElementById('tab-sell').className = 'order-tab';
      this.updateOrderInfo();
    });
    document.getElementById('tab-sell').addEventListener('click', () => {
      this.orderSide = 'sell';
      document.getElementById('tab-sell').className = 'order-tab active-sell';
      document.getElementById('tab-buy').className = 'order-tab';
      this.updateOrderInfo();
    });

    // Order type
    document.querySelectorAll('.order-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.orderType = btn.dataset.otype;
        document.getElementById('limit-price-group').style.display = this.orderType === 'limit' ? '' : 'none';
        this.updateOrderInfo();
      });
    });

    // Percentage buttons
    document.querySelectorAll('.pct-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseInt(btn.dataset.pct);
        document.querySelectorAll('.pct-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const available = Account.getAvailable();
        document.getElementById('order-amount').value = (available * pct / 100).toFixed(2);
        this.selectedPct = pct;
        this.updateOrderInfo();
      });
    });

    // Amount input
    document.getElementById('order-amount').addEventListener('input', () => {
      this.selectedPct = null;
      document.querySelectorAll('.pct-btn').forEach(b => b.classList.remove('active'));
      this.updateOrderInfo();
    });

    // Leverage slider
    document.getElementById('leverage-slider').addEventListener('input', (e) => {
      document.getElementById('leverage-val').textContent = e.target.value + 'x';
      this.updateOrderInfo();
    });

    // Leverage presets
    document.querySelectorAll('.lev-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const lev = parseInt(btn.dataset.lev);
        document.getElementById('leverage-slider').value = lev;
        document.getElementById('leverage-val').textContent = lev + 'x';
        this.updateOrderInfo();
      });
    });

    // Execute buy
    document.getElementById('btn-buy').addEventListener('click', () => this.executeTrade('buy'));
    // Execute sell
    document.getElementById('btn-sell').addEventListener('click', () => this.executeTrade('sell'));
  },

  updateOrderInfo() {
    const amount = parseFloat(document.getElementById('order-amount').value) || 0;
    const leverage = parseInt(document.getElementById('leverage-slider').value) || 1;
    const notional = amount * leverage;
    const fee = notional * Trading.FEE_RATE;
    const coin = CoinData.state[this.tradeSymbol];
    const size = coin ? (notional / coin.price) : 0;

    document.getElementById('order-fee').textContent = Utils.fmt(fee) + ' USDT';
    document.getElementById('order-size').textContent = size.toFixed(8) + ' ' + (coin?.symbol || '');

    // Liq price
    if (coin && amount > 0) {
      const side = this.orderSide === 'buy' ? 'long' : 'short';
      const entryPrice = this.orderType === 'limit'
        ? parseFloat(document.getElementById('limit-price').value) || coin.price
        : coin.price;
      const liq = Account.calcLiqPrice(entryPrice, leverage, side);
      document.getElementById('order-liq').textContent = Utils.fmtPrice(liq);
    } else {
      document.getElementById('order-liq').textContent = '—';
    }

    // Available
    document.getElementById('available-balance').textContent = Utils.fmt(Account.getAvailable()) + ' USDT';
  },

  executeTrade(side) {
    const amount = parseFloat(document.getElementById('order-amount').value);
    const leverage = parseInt(document.getElementById('leverage-slider').value);
    const limitPrice = this.orderType === 'limit'
      ? parseFloat(document.getElementById('limit-price').value)
      : null;
    const tp = parseFloat(document.getElementById('tp-price').value) || null;
    const sl = parseFloat(document.getElementById('sl-price').value) || null;

    if (!amount || amount <= 0) {
      UI.showToast('Enter a valid amount', 'error');
      return;
    }

    const result = Trading.executeOrder({
      symbol: this.tradeSymbol,
      side,
      type: this.orderType,
      amount,
      leverage,
      limitPrice,
      tp,
      sl,
    });

    if (result.success) {
      if (result.type === 'pending') {
        UI.showToast(`Limit order placed: ${side.toUpperCase()} ${this.tradeSymbol} at ${Utils.fmtPrice(limitPrice)}`, 'success');
      } else {
        UI.showToast(`${side === 'buy' ? 'Long' : 'Short'} ${this.tradeSymbol} opened: $${Utils.fmt(amount)} (${leverage}x)`, 'success');
      }
      document.getElementById('order-amount').value = '';
      document.querySelectorAll('.pct-btn').forEach(b => b.classList.remove('active'));
      this.updateBalanceDisplay();
      this.updateOrderInfo();
      this.renderPositionsMini();
      if (this.currentPage === 'portfolio') this.renderPortfolio();
    } else {
      UI.showToast(result.error, 'error');
    }
  },

  // ===== ORDER BOOK =====
  renderOrderBook() {
    const ob = CoinData.getOrderBook(this.tradeSymbol);

    // Asks (reversed so lowest ask is at bottom, closest to mid)
    const maxAsk = Math.max(...ob.asks.map(x => x.amount));
    let askTotal = 0;
    const asksHtml = ob.asks.slice().reverse().map(a => {
      askTotal += a.amount;
      const pct = (a.amount / maxAsk) * 100;
      return `<div class="fut-ob-row">
        <span class="price">${Utils.fmtPrice(a.price)}</span>
        <span>${a.amount.toFixed(4)}</span>
        <span>${askTotal.toFixed(2)}</span>
        <div class="fut-ob-bar" style="width:${pct}%"></div>
      </div>`;
    }).join('');

    // Bids
    const maxBid = Math.max(...ob.bids.map(x => x.amount));
    let bidTotal = 0;
    const bidsHtml = ob.bids.map(b => {
      bidTotal += b.amount;
      const pct = (b.amount / maxBid) * 100;
      return `<div class="fut-ob-row">
        <span class="price">${Utils.fmtPrice(b.price)}</span>
        <span>${b.amount.toFixed(4)}</span>
        <span>${bidTotal.toFixed(2)}</span>
        <div class="fut-ob-bar" style="width:${pct}%"></div>
      </div>`;
    }).join('');

    document.getElementById('order-book-asks').innerHTML = asksHtml;
    document.getElementById('order-book-bids').innerHTML = bidsHtml;

    // Mid price
    const coin = CoinData.state[this.tradeSymbol];
    if (coin) {
      document.getElementById('ob-mid-price').textContent = Utils.fmtPrice(coin.price);
      document.getElementById('ob-mid-price').className = 'fut-ob-mid-price ' + (coin.change24h >= 0 ? 'positive-color' : 'negative-color');
    }
  },

  // ===== POSITIONS MINI (on trade page) =====
  renderPositionsMini() {
    const container = document.getElementById('positions-mini-list');
    const positions = Account.positions;
    const empty = document.getElementById('fut-pos-empty');

    // Update count
    const posCount = document.getElementById('pos-count');
    if (posCount) posCount.textContent = positions.length;

    if (positions.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    container.innerHTML = positions.map(p => {
      const withPnl = Trading.getPositionWithPnL(p);
      const pnlClass = withPnl.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
      return `<tr>
        <td><span class="tag ${p.side === 'long' ? 'tag-long' : 'tag-short'}">${p.symbol} ${p.side === 'long' ? 'Long' : 'Short'}</span></td>
        <td>${Utils.fmt(p.size)}</td>
        <td>${Utils.fmtPrice(p.entryPrice)}</td>
        <td>${Utils.fmtPrice(withPnl.currentPrice)}</td>
        <td>${Utils.fmtPrice(p.liqPrice)}</td>
        <td>${Utils.fmt(p.margin)}</td>
        <td class="${pnlClass}">${Utils.fmt(withPnl.pnl)} (${Utils.fmtPct(withPnl.pnlPct)})</td>
        <td><button class="close-pos-btn" data-pos-id="${p.id}">Close</button></td>
      </tr>`;
    }).join('');

    container.querySelectorAll('.close-pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = Trading.closePosition(btn.dataset.posId);
        if (result.success) {
          const r = result.record;
          const pnlText = r.pnl >= 0 ? `+$${Utils.fmt(r.pnl)}` : `-$${Utils.fmt(Math.abs(r.pnl))}`;
          UI.showToast(`Position closed: ${r.symbol} ${pnlText}`, r.pnl >= 0 ? 'success' : 'error');
          this.updateBalanceDisplay();
          this.renderPositionsMini();
          if (this.currentPage === 'portfolio') this.renderPortfolio();
          // Send webhook notification
          WebhookManager.sendCloseNotification(r);
        }
      });
    });
  },

  // ===== PORTFOLIO =====
  renderPortfolio() {
    document.getElementById('total-equity').textContent = '$' + Utils.fmt(Account.getEquity());
    document.getElementById('avail-balance').textContent = '$' + Utils.fmt(Account.getAvailable());

    const unrealized = Account.getUnrealizedPnL();
    const unrealEl = document.getElementById('unrealized-pnl');
    unrealEl.textContent = (unrealized >= 0 ? '+$' : '-$') + Utils.fmt(Math.abs(unrealized));
    unrealEl.style.color = unrealized >= 0 ? 'var(--green)' : 'var(--red)';

    document.getElementById('margin-used').textContent = '$' + Utils.fmt(Account.getMarginUsed());

    const tbody = document.getElementById('portfolio-positions');
    const empty = document.getElementById('portfolio-empty');

    if (Account.positions.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = Account.positions.map(p => {
      const withPnl = Trading.getPositionWithPnL(p);
      const pnlClass = withPnl.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
      return `<tr>
        <td><div class="coin-cell"><div class="coin-icon coin-${p.symbol.toLowerCase()}" style="width:22px;height:22px;font-size:10px">${p.symbol.charAt(0)}</div>${p.symbol}/USDT</div></td>
        <td><span class="tag ${p.side === 'long' ? 'tag-long' : 'tag-short'}">${p.side.toUpperCase()}</span></td>
        <td style="font-family:var(--mono)">${Utils.fmtPrice(p.entryPrice)}</td>
        <td style="font-family:var(--mono)">${Utils.fmtPrice(withPnl.currentPrice)}</td>
        <td>${p.leverage}x</td>
        <td style="font-family:var(--mono)">$${Utils.fmt(p.margin)}</td>
        <td style="font-family:var(--mono)">${Utils.fmtPrice(p.liqPrice)}</td>
        <td class="${pnlClass}" style="font-family:var(--mono)">$${Utils.fmt(withPnl.pnl)} (${Utils.fmtPct(withPnl.pnlPct)})</td>
        <td><button class="btn btn-sm btn-secondary close-pos-btn" data-pos-id="${p.id}">Close</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.close-pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = Trading.closePosition(btn.dataset.posId);
        if (result.success) {
          const r = result.record;
          const pnlText = r.pnl >= 0 ? `+$${Utils.fmt(r.pnl)}` : `-$${Utils.fmt(Math.abs(r.pnl))}`;
          UI.showToast(`Position closed: ${r.symbol} ${pnlText}`, r.pnl >= 0 ? 'success' : 'error');
          this.updateBalanceDisplay();
          this.renderPortfolio();
          // Send webhook notification
          WebhookManager.sendCloseNotification(r);
        }
      });
    });
  },

  // ===== HISTORY =====
  renderHistory() {
    const tbody = document.getElementById('history-body');
    const empty = document.getElementById('history-empty');

    if (Account.history.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = Account.history.map(h => {
      const pnlClass = h.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
      let label = h.liquidated ? 'LIQUIDATED' : (h.tpHit ? 'TP HIT' : (h.slHit ? 'SL HIT' : 'Closed'));
      return `<tr>
        <td style="font-size:12px;color:var(--text-secondary)">${Utils.fmtTime(h.closedAt)}</td>
        <td>${h.symbol}/USDT</td>
        <td><span class="tag ${h.side === 'long' ? 'tag-long' : 'tag-short'}">${h.side.toUpperCase()}</span></td>
        <td><span class="tag tag-market">${label}</span></td>
        <td style="font-family:var(--mono)">${Utils.fmtPrice(h.entryPrice)}</td>
        <td style="font-family:var(--mono)">${Utils.fmtPrice(h.exitPrice)}</td>
        <td style="font-family:var(--mono)">$${Utils.fmt(h.size)}</td>
        <td>${h.leverage}x</td>
        <td style="font-family:var(--mono);color:var(--text-secondary)">$${Utils.fmt(h.fee)}</td>
        <td class="${pnlClass}" style="font-family:var(--mono)">$${Utils.fmt(h.pnl)}</td>
      </tr>`;
    }).join('');
  },

  // ===== BALANCE DISPLAY =====
  updateBalanceDisplay() {
    const equity = Account.getEquity();
    document.getElementById('header-balance').textContent = '$' + Utils.fmt(equity);
  },

  // ===== TOAST =====
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all .3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ===== WEBHOOKS =====
  renderWebhooks() {
    document.getElementById('wh-url-input').value = WebhookManager.url;
    document.getElementById('wh-interval').value = WebhookManager.sendInterval;
    this.updateWhStatus();
  },

  updateWhStatus() {
    const dot = document.querySelector('.wh-simple-status .wh-status-dot');
    const text = document.getElementById('wh-status-text');
    const toggleBtn = document.getElementById('wh-toggle-btn');

    if (!WebhookManager.url) {
      dot.className = 'wh-status-dot wh-status-none';
      text.textContent = 'Not configured';
    } else if (WebhookManager.enabled) {
      dot.className = 'wh-status-dot wh-status-active';
      text.textContent = 'Active — sending to Discord';
      toggleBtn.textContent = 'Enabled';
      toggleBtn.style.background = 'var(--green)';
      toggleBtn.style.color = '#fff';
    } else {
      dot.className = 'wh-status-dot wh-status-paused';
      text.textContent = 'Paused';
      toggleBtn.textContent = 'Disabled';
      toggleBtn.style.background = 'var(--bg-tertiary)';
      toggleBtn.style.color = 'var(--text-secondary)';
    }

    document.getElementById('wh-delete-btn').style.display = WebhookManager.url ? '' : 'none';
  },

  bindWebhookControls() {
    // Save
    document.getElementById('wh-save-btn').addEventListener('click', () => {
      const url = document.getElementById('wh-url-input').value.trim();
      if (!url) {
        UI.showToast('Enter a webhook URL', 'error');
        return;
      }
      if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        UI.showToast('Invalid Discord webhook URL', 'error');
        return;
      }
      WebhookManager.setUrl(url);
      UI.showToast('Webhook saved & enabled', 'success');
      this.updateWhStatus();
    });

    // Test
    document.getElementById('wh-test-btn').addEventListener('click', async () => {
      if (!WebhookManager.url) {
        UI.showToast('Save a webhook URL first', 'error');
        return;
      }

      const btn = document.getElementById('wh-test-btn');
      btn.textContent = 'Sending...';
      btn.disabled = true;

      const result = await WebhookManager.testWebhook();

      btn.textContent = 'Test Connection';
      btn.disabled = false;

      const resultEl = document.getElementById('wh-test-result');
      resultEl.style.display = '';
      if (result.success) {
        resultEl.className = 'webhook-test-result wh-test-success';
        resultEl.textContent = 'Connection successful — test message delivered to Discord.';
      } else {
        resultEl.className = 'webhook-test-result wh-test-error';
        resultEl.textContent = 'Failed: ' + result.error;
      }
    });

    // Toggle
    document.getElementById('wh-toggle-btn').addEventListener('click', () => {
      if (!WebhookManager.url) return;
      WebhookManager.toggle();
      UI.showToast(WebhookManager.enabled ? 'Webhook enabled' : 'Webhook paused', 'info');
      this.updateWhStatus();
    });

    // Delete
    document.getElementById('wh-delete-btn').addEventListener('click', () => {
      WebhookManager.removeUrl();
      document.getElementById('wh-url-input').value = '';
      document.getElementById('wh-test-result').style.display = 'none';
      UI.showToast('Webhook removed', 'info');
      this.updateWhStatus();
    });

    // Interval change
    document.getElementById('wh-interval').addEventListener('change', (e) => {
      WebhookManager.sendInterval = parseInt(e.target.value);
      WebhookManager.save();
    });
  },
};
