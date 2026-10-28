import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { routes } from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

// Tách khỏi index.js để test gọi thẳng app bằng supertest mà không phải mở cổng.
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.use(routes);

  // Production: phục vụ bản build React
  const dist = path.resolve('dist');
  if (env.isProd && fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
