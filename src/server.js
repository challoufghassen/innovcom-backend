import 'dotenv/config';
import app from './app.js';
import { initializeDatabase } from './db.js';
import { seedIfEmpty } from './seed.js';

const PORT = Number(process.env.PORT || 3000);

async function waitForDatabase(maxRetries = 20, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await initializeDatabase();
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      console.log(`Database not ready (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);
  
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`[Socket] User ${userId} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.id}`);
  });
});

export { io };

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est requis');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET est requis');
  }

  await waitForDatabase();
  await seedIfEmpty();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`InnovCom API running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});
