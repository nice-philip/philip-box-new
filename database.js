const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config');

class Database {
  constructor() {
    this.db = new sqlite3.Database(config.DATABASE_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initTables();
      }
    });
  }

  initTables() {
    // Users table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        storage_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Files table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        folder_id INTEGER,
        is_shared BOOLEAN DEFAULT FALSE,
        share_token TEXT,
        share_expires DATETIME,
        is_favorite BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (folder_id) REFERENCES folders (id)
      )
    `);

    // Folders table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        parent_id INTEGER,
        path TEXT NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (parent_id) REFERENCES folders (id)
      )
    `);

    // Shares table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        share_token TEXT UNIQUE NOT NULL,
        permissions TEXT DEFAULT 'read',
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // File access logs
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        user_id INTEGER,
        ip_address TEXT,
        action TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);
  }

  // User methods
  createUser(name, email, hashedPassword) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // File methods
  createFile(fileData) {
    return new Promise((resolve, reject) => {
      const { userId, filename, originalName, filePath, fileSize, mimeType, folderId } = fileData;
      this.db.run(
        `INSERT INTO files (user_id, filename, original_name, file_path, file_size, mime_type, folder_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, filename, originalName, filePath, fileSize, mimeType, folderId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getUserFiles(userId, folderId = null) {
    return new Promise((resolve, reject) => {
      const query = folderId ? 
        'SELECT * FROM files WHERE user_id = ? AND folder_id = ? AND is_deleted = FALSE ORDER BY created_at DESC' :
        'SELECT * FROM files WHERE user_id = ? AND folder_id IS NULL AND is_deleted = FALSE ORDER BY created_at DESC';
      
      const params = folderId ? [userId, folderId] : [userId];
      
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getFileById(fileId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM files WHERE id = ? AND is_deleted = FALSE',
        [fileId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  deleteFile(fileId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE files SET is_deleted = TRUE WHERE id = ?',
        [fileId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Folder methods
  createFolder(userId, name, parentId = null, path) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO folders (user_id, name, parent_id, path) VALUES (?, ?, ?, ?)',
        [userId, name, parentId, path],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getUserFolders(userId, parentId = null) {
    return new Promise((resolve, reject) => {
      const query = parentId ? 
        'SELECT * FROM folders WHERE user_id = ? AND parent_id = ? AND is_deleted = FALSE ORDER BY name' :
        'SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL AND is_deleted = FALSE ORDER BY name';
      
      const params = parentId ? [userId, parentId] : [userId];
      
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = new Database(); 