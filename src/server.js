console.log('=== S3 Bucket Service Starting ===');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

console.log('Loading dotenv...');
require('dotenv').config();
console.log('Dotenv loaded. NODE_ENV:', process.env.NODE_ENV);

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const uploadRoutes = require('./routes/upload');
const soundDataRoutes = require('./routes/soundData');
const photoDataRoutes = require('./routes/photoData');
const errorHandler = require('./middleware/errorHandler');

console.log('Modules loaded, creating Express app...');
const app = express();
const PORT = process.env.PORT || 3009;
console.log('PORT:', PORT);

// Connect to MongoDB only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  console.log('Calling connectDB...');
  connectDB();
  console.log('connectDB called (async)');
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 's3-bucket-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/sound-data', soundDataRoutes);
app.use('/api/photo-data', photoDataRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  console.log('Starting server on port', PORT);
  app.listen(PORT, () => {
    console.log(`=== S3 Bucket Service running on port ${PORT} ===`);
    logger.info(`S3 Bucket Service running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`MongoDB URI: ${process.env.MONGODB_URI}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

module.exports = app;