import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { healthRouter } from './routes/health';

export const app = express();

app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(healthRouter);

app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment Simulator</title>
    <style>
      body { font-family: sans-serif; margin: 0; color: #1f2937; background: #fff; }
      .banner {
        background: #b45309;
        color: #fff;
        padding: 1rem 1.5rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      main { padding: 1.5rem; }
    </style>
  </head>
  <body>
    <div class="banner">SIMULATOR - no real money</div>
    <main>
      <p>This service is a labelled payment simulator. It never moves real money.</p>
    </main>
  </body>
</html>`);
});
