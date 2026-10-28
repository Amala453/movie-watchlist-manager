import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import movieRoutes from './routes/movies.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'Movie Watchlist API is running', data: null }));
app.use('/api/movies', movieRoutes);
app.use((req, res) => res.status(404).json({ success: false, message: 'API route not found', data: null }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error. Check the server logs.', data: null });
});
const PORT = process.env.PORT || 5000;
try {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in backend/.env');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
} catch (error) { console.error('Startup failed:', error.message); process.exit(1); }
