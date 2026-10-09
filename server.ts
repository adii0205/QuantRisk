import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'QuantRisk Quantitative Market Data & Execution Proxy',
      timestamp: new Date().toISOString(),
    });
  });

  // Market Data Proxy: Stooq / Public EOD Sources
  app.get('/api/market-data', async (req, res) => {
    const symbol = String(req.query.symbol || 'SPY').trim().toUpperCase();
    const source = String(req.query.source || 'stooq').toLowerCase();

    try {
      if (source === 'stooq') {
        // Stooq symbols for US tickers usually require .US suffix, e.g., SPY.US
        const stooqTicker = symbol.includes('.') ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`;
        const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqTicker)}&i=d`;

        const response = await fetch(stooqUrl, {
          headers: {
            'User-Agent': 'QuantRisk-Research-Client/1.0',
            'Accept': 'text/csv,text/plain',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) {
          throw new Error(`Stooq HTTP error: ${response.status}`);
        }

        const csvText = await response.text();
        // Check if Stooq returned actual data or an error notice
        if (!csvText || csvText.includes('Exceeded the daily hits limit') || csvText.split('\n').length < 5) {
          throw new Error('Stooq returned invalid or empty series');
        }

        return res.json({
          success: true,
          symbol,
          source: 'stooq',
          format: 'csv',
          data: csvText,
        });
      }

      // Default fallback / general proxy
      return res.status(400).json({
        success: false,
        error: `Unsupported source: ${source}. Use 'stooq'`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        success: false,
        symbol,
        error: `Failed to fetch live upstream data: ${message}`,
      });
    }
  });

  // Serve static assets in production or mount Vite middleware in development
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Dynamic import vite in dev mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuantRisk] Server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[QuantRisk] Fatal server startup error:', err);
  process.exit(1);
});
