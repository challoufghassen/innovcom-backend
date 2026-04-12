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

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est requis');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET est requis');
  }

  await waitForDatabase();
  await seedIfEmpty();

  app.listen(PORT, () => {
    console.log(`InnovCom API running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});
