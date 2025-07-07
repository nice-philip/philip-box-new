const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const config = require('./config');
const db = require('./database');

const app = express();

// Middleware
app.use(cors({
  origin: config.ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
fs.ensureDirSync(config.UPLOAD_DIR);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user.id;
    const userDir = path.join(config.UPLOAD_DIR, userId.toString());
    fs.ensureDirSync(userDir);
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    cb(null, true); // Accept all files
  }
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await db.createUser(name, email, hashedPassword);

    const token = jwt.sign({ id: userId, email }, config.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: userId, name, email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email }, config.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User routes
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      storage_used: user.storage_used,
      storage_limit: config.STORAGE_LIMIT,
      created_at: user.created_at
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// File routes
app.post('/api/files/upload', authenticateToken, upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    const { folderId } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of files) {
      const fileData = {
        userId: req.user.id,
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        folderId: folderId || null
      };

      const fileId = await db.createFile(fileData);
      uploadedFiles.push({
        id: fileId,
        ...fileData
      });
    }

    res.json({ files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.query;
    const files = await db.getUserFiles(req.user.id, folderId);
    const folders = await db.getUserFolders(req.user.id, folderId);

    res.json({ files, folders });
  } catch (error) {
    console.error('Files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await db.getFileById(req.params.id);
    if (!file || file.user_id !== req.user.id) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    console.error('File detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
  try {
    const file = await db.getFileById(req.params.id);
    if (!file || file.user_id !== req.user.id) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.resolve(file.file_path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, file.original_name);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await db.getFileById(req.params.id);
    if (!file || file.user_id !== req.user.id) {
      return res.status(404).json({ error: 'File not found' });
    }

    await db.deleteFile(req.params.id);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Folder routes
app.post('/api/folders', authenticateToken, async (req, res) => {
  try {
    const { name, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const parentPath = parentId ? '/' + parentId : '';
    const folderPath = parentPath + '/' + name;

    const folderId = await db.createFolder(req.user.id, name, parentId, folderPath);

    res.json({ id: folderId, name, parentId, path: folderPath });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search route
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Simple search implementation - in a real app, you'd use full-text search
    const files = await db.getUserFiles(req.user.id);
    const filteredFiles = files.filter(file => 
      file.original_name.toLowerCase().includes(q.toLowerCase())
    );

    res.json({ files: filteredFiles });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Dropbox Clone server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to use the application`);
});

module.exports = app; 