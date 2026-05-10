import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/messages.js';
import interactionsRoutes from './routes/interactions.js';
import swaggerSpec from './swagger.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});
app.use('/uploads', express.static('uploads'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'innovcom-api' });
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/interactions', interactionsRoutes);

app.use((req, res, next) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} non trouvée` });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

export default app;
