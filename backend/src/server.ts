import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import { authenticateToken } from './middleware/auth';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { productsRouter } from './routes/products.routes';
import { salesRouter } from './routes/sales.routes';
import { customersRouter } from './routes/customers.routes';
import { suppliersRouter } from './routes/suppliers.routes';
import { manufacturingRouter } from './routes/manufacturing.routes';
import { financeRouter } from './routes/finance.routes';
import { settingsRouter } from './routes/settings.routes';
import { recoveryRouter } from './routes/recovery.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'FurniERP',
    currency: 'ETB',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRouter);

// Protect all subsequent API routes
app.use(authenticateToken);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/manufacturing', manufacturingRouter);
app.use('/api/finance', financeRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/recovery', recoveryRouter);

// Central Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🏭 FurniERP Express API running on http://localhost:${PORT}`);
});

export default app;
