const mongoose = require('mongoose');
const config = require('./config');

// MongoDB 연결
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  storageUsed: {
    type: Number,
    default: 0
  },
  storageLimit: {
    type: Number,
    default: config.DEFAULT_STORAGE_LIMIT
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// File Schema
const fileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  firebaseUrl: {
    type: String,
    required: true
  },
  firebasePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  isShared: {
    type: Boolean,
    default: false
  },
  shareToken: {
    type: String,
    default: null
  },
  shareExpires: {
    type: Date,
    default: null
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Folder Schema
const folderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  path: {
    type: String,
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Share Schema
const shareSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shareToken: {
    type: String,
    required: true,
    unique: true
  },
  permissions: {
    type: String,
    enum: ['read', 'write', 'admin'],
    default: 'read'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  accessCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null
  },
  action: {
    type: String,
    required: true,
    enum: ['upload', 'download', 'delete', 'share', 'rename', 'move', 'create_folder', 'delete_folder', 'preview', 'login', 'logout']
  },
  details: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// 인덱스 생성
fileSchema.index({ userId: 1, isDeleted: 1 });
fileSchema.index({ folderId: 1, isDeleted: 1 });
fileSchema.index({ shareToken: 1 });
folderSchema.index({ userId: 1, parentId: 1, isDeleted: 1 });
shareSchema.index({ shareToken: 1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });

// 모델 생성
const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);
const Folder = mongoose.model('Folder', folderSchema);
const Share = mongoose.model('Share', shareSchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = {
  connectDB,
  User,
  File,
  Folder,
  Share,
  ActivityLog
}; 