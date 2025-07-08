require('dotenv').config();

module.exports = {
  // Server Configuration
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // MongoDB Configuration
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://kmat0:ap6a96XKSREgbz1J@cluster0.emtvkam.mongodb.net/philip-box?retryWrites=true&w=majority&appName=Cluster0',
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || '3c19f983d29c2b1e2715bf0d44388add228ee0a9b6ef63b6738b9b960f2f92e9388dd5882cb039063153fb364cc1fc608af73d677d60817204e1ffecc84da84a',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Firebase Configuration (disabled for now)
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'philip-box',
  FIREBASE_PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_CLIENT_ID: process.env.FIREBASE_CLIENT_ID,
  FIREBASE_CLIENT_X509_CERT_URL: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || 'philip-box.firebasestorage.app',
  FIREBASE_PRIVATE_KEY: null, // Firebase disabled
  
  // File Upload Configuration
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  ALLOWED_FILE_TYPES: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*', 'application/zip'],
  
  // Storage Configuration
  DEFAULT_STORAGE_LIMIT: 2 * 1024 * 1024 * 1024, // 2GB
  
  // Security Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001',
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100 // requests per window
}; 