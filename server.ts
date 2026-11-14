import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCachedAudit } from './server/audit.ts';
import { getCachedBoard } from './server/board.ts';
import { ConfigError } from './server/config.ts';
import { UserInputError } from './server/polymarket.ts';
import { getCachedVerdict } from './server/verdict.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  app.get('/api/audit', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl.trim()) {
      res.status(400).json({
        error: 'Paste a Polymarket market link, for example polymarket.com/event/… or /market/…',
      });
      return;
    }

    try {
      const report = await getCachedAudit(rawUrl);
      res.json(report);
    } catch (err) {
      if (err instanceof ConfigError) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (err instanceof UserInputError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error && err.message
          ? 'Could not reach Polymarket to complete this rating. Please try again in a moment.'
          : 'Unable to audit this market right now.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/verdict', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl.trim()) {
      res.status(400).json({ error: 'Missing market URL.' });
      return;
    }

    try {
      const verdict = await getCachedVerdict(rawUrl);
      res.json(verdict);
    } catch (err) {
      if (err instanceof ConfigError) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (err instanceof UserInputError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error && err.message.includes('Gemini API key')
          ? err.message
          : 'Could not generate the news analyst note right now.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/board', async (_req: Request, res: Response) => {
    try {
      const board = await getCachedBoard();
      res.json(board);
    } catch (err) {
      if (err instanceof ConfigError) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(502).json({ error: 'Could not load the ratings board right now.' });
    }
  });

  if (isProd) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OddsAudit server listening on http://localhost:${PORT}`);
  });
}

startServer();
