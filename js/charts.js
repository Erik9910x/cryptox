// ===== CHARTS: Lightweight Charts integration =====
const ChartManager = {
  chart: null,
  candleSeries: null,
  volumeSeries: null,
  currentSymbol: null,
  currentTimeframe: '1h',
  _resizeObserver: null,

  init(container) {
    this.destroy();

    this.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: '#0b0e11' },
        textColor: '#848e9c',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e2329' },
        horzLines: { color: '#1e2329' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#5e6673', width: 1, style: 2 },
        horzLine: { color: '#5e6673', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#2b3139',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#2b3139',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        fixLeftEdge: false,
      },
    });

    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderUpColor: '#0ecb81',
      borderDownColor: '#f6465d',
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => {
      if (this.chart && container.clientWidth > 0) {
        this.chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    this._resizeObserver.observe(container);
  },

  loadChart(symbol, timeframe) {
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe || this.currentTimeframe;

    const candles = CoinData.getCandles(symbol, this.currentTimeframe);
    if (!candles || candles.length === 0) return;

    const candleData = candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)',
    }));

    this.candleSeries.setData(candleData);
    this.volumeSeries.setData(volumeData);

    // Auto-scroll to the latest candle
    this.chart.timeScale().scrollToRealTime();
  },

  // Called every tick — streams the latest candle update
  updateLastCandle() {
    if (!this.currentSymbol) return;
    const candles = CoinData.getCandles(this.currentSymbol, this.currentTimeframe);
    if (!candles || candles.length === 0) return;

    const last = candles[candles.length - 1];

    // Update or add candle
    this.candleSeries.update({
      time: last.time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    });

    this.volumeSeries.update({
      time: last.time,
      value: last.volume,
      color: last.close >= last.open ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)',
    });
  },

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.candleSeries = null;
      this.volumeSeries = null;
    }
  }
};

// ===== SPARKLINE: simple canvas sparkline =====
function drawSparkline(canvas, data, color) {
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = 120;
  const h = canvas.height = 32;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const isUp = data[data.length - 1] >= data[0];

  ctx.beginPath();
  ctx.strokeStyle = isUp ? '#0ecb81' : '#f6465d';
  ctx.lineWidth = 1.5;

  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
