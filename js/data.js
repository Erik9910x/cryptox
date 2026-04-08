// ===== DATA: Coin definitions & Price simulation engine =====
const CoinData = {
  coins: [
    { symbol: 'BTC', name: 'Bitcoin', basePrice: 72591, volatility: 0.0008, color: '#f7931a' },
    { symbol: 'ETH', name: 'Ethereum', basePrice: 2261, volatility: 0.0012, color: '#627eea' },
    { symbol: 'BNB', name: 'BNB', basePrice: 614, volatility: 0.0015, color: '#f3ba2f' },
    { symbol: 'SOL', name: 'Solana', basePrice: 84.56, volatility: 0.0025, color: '#9945ff' },
    { symbol: 'XRP', name: 'XRP', basePrice: 1.39, volatility: 0.002, color: '#23292f' },
    { symbol: 'ADA', name: 'Cardano', basePrice: 0.259, volatility: 0.0022, color: '#0033ad' },
    { symbol: 'DOGE', name: 'Dogecoin', basePrice: 0.0949, volatility: 0.003, color: '#c2a633' },
    { symbol: 'DOT', name: 'Polkadot', basePrice: 1.31, volatility: 0.002, color: '#e6007a' },
    { symbol: 'AVAX', name: 'Avalanche', basePrice: 9.41, volatility: 0.0022, color: '#e84142' },
    { symbol: 'MATIC', name: 'Polygon', basePrice: 0.21, volatility: 0.002, color: '#8247e5' },
    { symbol: 'LINK', name: 'Chainlink', basePrice: 9.23, volatility: 0.002, color: '#2a5ada' },
    { symbol: 'UNI', name: 'Uniswap', basePrice: 3.23, volatility: 0.0022, color: '#ff007a' },
    { symbol: 'ATOM', name: 'Cosmos', basePrice: 1.78, volatility: 0.002, color: '#2e3148' },
    { symbol: 'LTC', name: 'Litecoin', basePrice: 55.24, volatility: 0.0018, color: '#bfbbbb' },
    { symbol: 'FIL', name: 'Filecoin', basePrice: 0.913, volatility: 0.0025, color: '#0090ff' },
    { symbol: 'APT', name: 'Aptos', basePrice: 0.862, volatility: 0.0028, color: '#22d1a9' },
    { symbol: 'ARB', name: 'Arbitrum', basePrice: 0.102, volatility: 0.0025, color: '#28a0f0' },
    { symbol: 'OP', name: 'Optimism', basePrice: 0.118, volatility: 0.0025, color: '#ff0420' },
    { symbol: 'PEPE', name: 'Pepe', basePrice: 0.00000365, volatility: 0.005, color: '#4a9e3b' },
    { symbol: 'SUI', name: 'Sui', basePrice: 0.95, volatility: 0.003, color: '#6fbcf0' },
  ],

  // Live state per coin
  state: {},

  // Timeframe definitions
  timeframes: [
    { key: '1m',  interval: 60 * 1000 },
    { key: '5m',  interval: 5 * 60 * 1000 },
    { key: '15m', interval: 15 * 60 * 1000 },
    { key: '1h',  interval: 60 * 60 * 1000 },
    { key: '4h',  interval: 4 * 60 * 60 * 1000 },
    { key: '1d',  interval: 24 * 60 * 60 * 1000 },
  ],

  init() {
    const now = Date.now();
    this.coins.forEach(c => {
      const price = c.basePrice * (1 + Utils.rand(-0.05, 0.05));
      this.state[c.symbol] = {
        ...c,
        price,
        prevPrice: price,
        open24h: price,
        high24h: price,
        low24h: price,
        volume24h: Utils.rand(1e8, 5e10),
        change24h: 0,
        candles: {},
        sparkline: [],
        lastTick: now,
      };
      this.generateInitialCandles(c.symbol);
      // Init sparkline from recent 1m candles
      const m1 = this.state[c.symbol].candles['1m'];
      if (m1) {
        this.state[c.symbol].sparkline = m1.slice(-20).map(c => c.close);
      }
    });
  },

  generateInitialCandles(symbol) {
    const s = this.state[symbol];
    const now = Date.now();

    this.timeframes.forEach(tf => {
      const candles = [];
      let p = s.basePrice;
      const count = 200;

      for (let i = count - 1; i >= 0; i--) {
        // Align candle time to real boundaries
        const candleTime = Math.floor((now - i * tf.interval) / 1000);
        const alignedTime = Math.floor(candleTime / (tf.interval / 1000)) * (tf.interval / 1000);

        const vol = s.volatility * 2.5;
        const o = p;
        // Generate realistic OHLC within the candle
        const numMoves = Math.max(3, Math.floor(tf.interval / 1000));
        let high = o, low = o, close = o;
        for (let m = 0; m < numMoves; m++) {
          const move = (Math.random() - 0.5) * 2 * vol * o;
          close = o + move;
          high = Math.max(high, close);
          low = Math.min(low, close);
        }
        // Ensure high >= open/close and low <= open/close
        high = Math.max(high, o, close) * (1 + Math.random() * vol * 0.3);
        low = Math.min(low, o, close) * (1 - Math.random() * vol * 0.3);

        candles.push({
          time: alignedTime,
          open: o,
          high: high,
          low: low,
          close: close,
          volume: Utils.rand(1e5, 1e8),
        });
        p = close;
      }
      s.candles[tf.key] = candles;

      // Set current price to last 1m candle close
      if (tf.key === '1m') {
        s.price = candles[candles.length - 1].close;
        s.prevPrice = s.price;
      }
    });
  },

  // Main tick — called every 300ms
  tick() {
    const now = Date.now();
    this.coins.forEach(c => {
      const s = this.state[c.symbol];
      s.prevPrice = s.price;

      // Single micro-tick per call — realistic pacing
      // Brownian motion with mean reversion
      const meanReversion = (s.basePrice - s.price) / s.basePrice * 0.001;
      const noise = (Math.random() - 0.5) * 2 * s.volatility;
      // Momentum: 10% chance of a small directional burst
      const momentum = Math.random() < 0.1 ? (Math.random() - 0.5) * s.volatility * 2 : 0;
      const change = meanReversion + noise + momentum;
      s.price = s.price * (1 + change);

      // Floor price
      if (s.price <= 0) s.price = s.basePrice * 0.01;

      // Update 24h stats
      s.high24h = Math.max(s.high24h, s.price);
      s.low24h = Math.min(s.low24h, s.price);
      s.change24h = ((s.price - s.open24h) / s.open24h) * 100;
      s.volume24h += Utils.rand(1e4, 5e5);
      s.lastTick = now;

      // Sparkline
      s.sparkline.push(s.price);
      if (s.sparkline.length > 20) s.sparkline.shift();

      // Update all timeframe candles
      this.timeframes.forEach(tf => {
        this.updateCandle(s, tf.key, tf.interval);
      });
    });
  },

  updateCandle(state, tfKey, intervalMs) {
    const candles = state.candles[tfKey];
    if (!candles || candles.length === 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const candleIntervalSec = Math.floor(intervalMs / 1000);
    const lastCandle = candles[candles.length - 1];
    const currentCandleStart = Math.floor(nowSec / candleIntervalSec) * candleIntervalSec;

    if (currentCandleStart > lastCandle.time) {
      // New candle period — push new candle
      candles.push({
        time: currentCandleStart,
        open: state.price,
        high: state.price,
        low: state.price,
        close: state.price,
        volume: Utils.rand(1e4, 1e6),
      });
      // Keep max 500 candles
      if (candles.length > 500) candles.shift();
    } else {
      // Update current candle
      lastCandle.close = state.price;
      lastCandle.high = Math.max(lastCandle.high, state.price);
      lastCandle.low = Math.min(lastCandle.low, state.price);
      lastCandle.volume += Utils.rand(500, 5e4);
    }
  },

  getCoin(symbol) { return this.state[symbol]; },

  getAllCoins() { return Object.values(this.state); },

  getCandles(symbol, timeframe) {
    const s = this.state[symbol];
    return s ? s.candles[timeframe] || [] : [];
  },

  // Get simulated order book
  getOrderBook(symbol) {
    const s = this.state[symbol];
    if (!s) return { asks: [], bids: [], spread: 0 };
    const price = s.price;
    const spreadPct = 0.0003 + s.volatility * 0.3;
    const spread = price * spreadPct;
    const asks = [];
    const bids = [];
    for (let i = 0; i < 10; i++) {
      const askPrice = price + spread / 2 + (price * s.volatility * 0.15 * (i + 1) * (0.7 + Math.random() * 0.6));
      const bidPrice = price - spread / 2 - (price * s.volatility * 0.15 * (i + 1) * (0.7 + Math.random() * 0.6));
      asks.push({ price: askPrice, amount: Utils.rand(0.05, 8) });
      bids.push({ price: bidPrice, amount: Utils.rand(0.05, 8) });
    }
    return { asks, bids, spread };
  }
};
