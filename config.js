module.exports = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  DATABASE_PATH: './database.db',
  UPLOAD_DIR: './uploads',
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  ALLOWED_ORIGINS: ['http://localhost:3000', 'http://localhost:3001'],
  STORAGE_LIMIT: 2 * 1024 * 1024 * 1024, // 2GB per user
  SUPPORTED_FORMATS: {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    video: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
    document: ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
    archive: ['.zip', '.rar', '.7z', '.tar', '.gz']
  }
}; 