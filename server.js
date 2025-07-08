const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// 설정 및 모델 불러오기
const config = require('./config');
const { connectDB, User, File, Folder, Share, ActivityLog } = require('./database');

// FFmpeg 경로 설정
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, 'uploads');
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

// 보안 및 최적화 미들웨어
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX,
  message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Multer 설정 (로컬 저장)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userId = req.user._id.toString();
    const userDir = path.join(uploadDir, userId);
    try {
      await fs.access(userDir);
    } catch {
      await fs.mkdir(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    cb(null, fileName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = config.ALLOWED_FILE_TYPES;
    const isAllowed = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.mimetype.startsWith(type.slice(0, -2));
      }
      return file.mimetype === type;
    });
    
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다.'), false);
    }
  }
});

// JWT 인증 미들웨어
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '접근 토큰이 필요합니다.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: '유효하지 않은 사용자입니다.' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// 활동 로그 기록 미들웨어
const logActivity = async (req, userId, action, details = null, fileId = null) => {
  try {
    await ActivityLog.create({
      userId,
      fileId,
      action,
      details,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
  } catch (error) {
    console.error('Activity log error:', error);
  }
};

// 비디오 썸네일 생성 함수
const generateVideoThumbnail = (inputPath, outputPath, timeSeek = '00:00:01') => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(timeSeek)
      .frames(1)
      .size('200x200')
      .aspect('1:1')
      .output(outputPath)
      .on('end', () => {
        console.log('Video thumbnail generated successfully');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error generating video thumbnail:', err);
        reject(err);
      })
      .run();
  });
};

// =================================
// 즐겨찾기 관리 라우트
// =================================

// 파일 즐겨찾기 토글
app.post('/api/files/:fileId/favorite', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 즐겨찾기 상태 토글
    const newFavoriteStatus = !file.isFavorite;
    
    const updatedFile = await File.findByIdAndUpdate(
      fileId,
      { isFavorite: newFavoriteStatus },
      { new: true }
    );

    const action = newFavoriteStatus ? '즐겨찾기 추가' : '즐겨찾기 제거';
    logActivity(req, req.user._id, 'upload', `${action}: ${file.originalName}`, fileId);

    res.json({ 
      message: `${action}되었습니다.`,
      isFavorite: newFavoriteStatus,
      file: {
        id: updatedFile._id,
        name: updatedFile.originalName,
        isFavorite: updatedFile.isFavorite
      }
    });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: '즐겨찾기 설정에 실패했습니다.' });
  }
});

// 즐겨찾기 목록 조회
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user._id,
      isFavorite: true,
      isDeleted: false
    }).sort({ updatedAt: -1 });

    console.log(`즐겨찾기 파일 조회: ${files.length}개`);

    res.json({ files });
  } catch (error) {
    console.error('Favorites list error:', error);
    res.status(500).json({ error: '즐겨찾기 목록을 가져오는데 실패했습니다.' });
  }
});

// =================================
// 공유 관리 라우트
// =================================

// 파일 공유 링크 생성
app.post('/api/files/:fileId/share', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { expiresIn = 30 } = req.body; // 기본 30일 후 만료
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 고유한 공유 토큰 생성
    const shareToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresIn);

    // 파일에 공유 정보 업데이트
    const updatedFile = await File.findByIdAndUpdate(
      fileId,
      {
        isShared: true,
        shareToken: shareToken,
        shareExpires: expiresAt
      },
      { new: true }
    );

    // Share 레코드 생성
    await Share.create({
      fileId: fileId,
      userId: req.user._id,
      shareToken: shareToken,
      permissions: 'read',
      expiresAt: expiresAt,
      isActive: true
    });

    logActivity(req, req.user._id, 'share', `파일 공유: ${file.originalName}`, fileId);

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${shareToken}`;

    res.json({
      message: '공유 링크가 생성되었습니다.',
      shareUrl: shareUrl,
      shareToken: shareToken,
      expiresAt: expiresAt,
      file: {
        id: updatedFile._id,
        name: updatedFile.originalName,
        isShared: updatedFile.isShared
      }
    });
  } catch (error) {
    console.error('Share file error:', error);
    res.status(500).json({ error: '파일 공유에 실패했습니다.' });
  }
});

// 파일 공유 취소
app.delete('/api/files/:fileId/share', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 파일의 공유 정보 제거
    const updatedFile = await File.findByIdAndUpdate(
      fileId,
      {
        isShared: false,
        shareToken: null,
        shareExpires: null
      },
      { new: true }
    );

    // Share 레코드 비활성화
    await Share.updateMany(
      { fileId: fileId, userId: req.user._id },
      { isActive: false }
    );

    logActivity(req, req.user._id, 'upload', `파일 공유 취소: ${file.originalName}`, fileId);

    res.json({
      message: '파일 공유가 취소되었습니다.',
      file: {
        id: updatedFile._id,
        name: updatedFile.originalName,
        isShared: updatedFile.isShared
      }
    });
  } catch (error) {
    console.error('Unshare file error:', error);
    res.status(500).json({ error: '공유 취소에 실패했습니다.' });
  }
});

// 공유된 파일 목록 조회
app.get('/api/shared', authenticateToken, async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user._id,
      isShared: true,
      isDeleted: false
    }).sort({ updatedAt: -1 });

    console.log(`공유된 파일 조회: ${files.length}개`);

    res.json({ files });
  } catch (error) {
    console.error('Shared files list error:', error);
    res.status(500).json({ error: '공유된 파일 목록을 가져오는데 실패했습니다.' });
  }
});

// 공유 링크를 통한 파일 접근
app.get('/share/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;
    
    const share = await Share.findOne({
      shareToken: shareToken,
      isActive: true
    }).populate('fileId userId');

    if (!share) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>링크를 찾을 수 없음</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>🔗 링크를 찾을 수 없습니다</h1>
          <p>이 공유 링크는 존재하지 않거나 만료되었습니다.</p>
        </body>
        </html>
      `);
    }

    // 만료 확인
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>링크 만료됨</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>⏰ 링크가 만료되었습니다</h1>
          <p>이 공유 링크는 만료되어 더 이상 사용할 수 없습니다.</p>
        </body>
        </html>
      `);
    }

    const file = share.fileId;
    if (!file || file.isDeleted) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>파일을 찾을 수 없음</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>📁 파일을 찾을 수 없습니다</h1>
          <p>요청한 파일이 삭제되었거나 존재하지 않습니다.</p>
        </body>
        </html>
      `);
    }

    // 접근 횟수 증가
    await Share.findByIdAndUpdate(share._id, {
      $inc: { accessCount: 1 }
    });

    // 파일 정보 페이지 반환
    const fileExtension = path.extname(file.originalName).toLowerCase();
    const isImage = file.mimeType && file.mimeType.startsWith('image/');
    const isVideo = file.mimeType && file.mimeType.startsWith('video/');
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${file.originalName} - 공유된 파일</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
          .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .file-info { text-align: center; margin-bottom: 30px; }
          .file-icon { width: 64px; height: 64px; margin: 0 auto 16px; background: #0061ff; color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
          .file-name { font-size: 24px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
          .file-details { color: #6b7280; margin-bottom: 8px; }
          .shared-by { font-size: 14px; color: #9ca3af; }
          .download-btn { display: inline-block; background: #0061ff; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
          .download-btn:hover { background: #0051d5; }
          .preview { margin-top: 20px; text-align: center; }
          .preview img, .preview video { max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .error-msg { color: #dc2626; font-size: 14px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="file-info">
            <div class="file-icon">📁</div>
            <div class="file-name">${file.originalName}</div>
            <div class="file-details">${(file.fileSize / 1024 / 1024).toFixed(2)} MB</div>
            <div class="shared-by">공유자: ${share.userId.name}</div>
            ${isImage ? `<div class="preview"><img src="/api/shared/${shareToken}/preview" alt="${file.originalName}" onerror="this.style.display='none'; document.querySelector('.error-msg').style.display='block';"></div><div class="error-msg" style="display:none;">이미지를 불러올 수 없습니다.</div>` : ''}
            ${isVideo ? `<div class="preview"><video controls poster="/api/shared/${shareToken}/thumbnail"><source src="/api/shared/${shareToken}/preview" type="${file.mimeType}">비디오를 재생할 수 없습니다.</video></div>` : ''}
            <a href="/api/shared/${shareToken}/download" class="download-btn">다운로드</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Share access error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>오류 발생</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>❌ 오류가 발생했습니다</h1>
        <p>파일을 불러오는 중 오류가 발생했습니다.</p>
      </body>
      </html>
    `);
  }
});

// 공유 링크를 통한 파일 다운로드
app.get('/api/shared/:shareToken/download', async (req, res) => {
  try {
    const { shareToken } = req.params;
    
    const share = await Share.findOne({
      shareToken: shareToken,
      isActive: true
    }).populate('fileId');

    if (!share || !share.fileId || share.fileId.isDeleted) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 만료 확인
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: '공유 링크가 만료되었습니다.' });
    }

    const file = share.fileId;
    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      // 접근 횟수 증가
      await Share.findByIdAndUpdate(share._id, {
        $inc: { accessCount: 1 }
      });
      
      res.download(filePath, file.originalName);
    } catch {
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Shared download error:', error);
    res.status(500).json({ error: '파일 다운로드에 실패했습니다.' });
  }
});

// 공유 파일 미리보기
app.get('/api/shared/:shareToken/preview', async (req, res) => {
  try {
    const { shareToken } = req.params;
    
    const share = await Share.findOne({
      shareToken: shareToken,
      isActive: true
    }).populate('fileId');

    if (!share || !share.fileId || share.fileId.isDeleted) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 만료 확인
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: '공유 링크가 만료되었습니다.' });
    }

    const file = share.fileId;
    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      // 한글 파일명 처리
      const encodedFileName = encodeURIComponent(file.originalName);
      
      // Set appropriate headers for inline viewing
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      
      // Stream the file
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
      
    } catch (error) {
      console.error('File access error:', error);
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Shared preview error:', error);
    res.status(500).json({ error: '파일 미리보기에 실패했습니다.' });
  }
});

// 공유 파일 썸네일
app.get('/api/shared/:shareToken/thumbnail', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const { size = '200' } = req.query; // Default thumbnail size 200px
    
    const share = await Share.findOne({
      shareToken: shareToken,
      isActive: true
    }).populate('fileId');

    if (!share || !share.fileId || share.fileId.isDeleted) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 만료 확인
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: '공유 링크가 만료되었습니다.' });
    }

    const file = share.fileId;

    // Support thumbnails for images and videos
    const isImage = file.mimeType && file.mimeType.startsWith('image/');
    const isVideo = file.mimeType && file.mimeType.startsWith('video/');
    
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: '이미지 또는 비디오 파일만 썸네일을 지원합니다.' });
    }

    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      if (isImage) {
        // For images, serve the original file
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent('thumb_' + file.originalName)}`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);
        
      } else if (isVideo) {
        // For videos, generate and serve thumbnail
        const thumbnailDir = path.join(__dirname, 'thumbnails');
        const thumbnailFileName = `${file._id}_thumb.jpg`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFileName);
        
        // Ensure thumbnail directory exists
        try {
          await fs.access(thumbnailDir);
        } catch {
          await fs.mkdir(thumbnailDir, { recursive: true });
        }
        
        // Check if thumbnail already exists
        let thumbnailExists = false;
        try {
          await fs.access(thumbnailPath);
          thumbnailExists = true;
        } catch {
          // Thumbnail doesn't exist, will generate it
        }
        
        if (!thumbnailExists) {
          try {
            await generateVideoThumbnail(filePath, thumbnailPath);
          } catch (error) {
            console.error('Failed to generate video thumbnail:', error);
            return res.status(500).json({ error: '비디오 썸네일 생성에 실패했습니다.' });
          }
        }
        
        // Serve the thumbnail
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent('thumb_' + file.originalName + '.jpg')}`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        const thumbnailStream = require('fs').createReadStream(thumbnailPath);
        thumbnailStream.pipe(res);
        
      }
      
    } catch (error) {
      console.error('File access error:', error);
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Shared thumbnail error:', error);
    res.status(500).json({ error: '썸네일 로드에 실패했습니다.' });
  }
});

// =================================
// 인증 라우트
// =================================

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword
    });

    const token = jwt.sign(
      { userId: user._id },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: '잘못된 이메일 또는 비밀번호입니다.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '잘못된 이메일 또는 비밀번호입니다.' });
    }

    const token = jwt.sign(
      { userId: user._id },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 사용자 프로필 조회
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// =================================
// 파일 관리 라우트
// =================================

// 파일 목록 조회
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const { folderId, recent, limit, type } = req.query;
    console.log('Files API called with params:', { folderId, recent, limit, type, userId: req.user._id });
    
    let query = {
      userId: req.user._id,
      isDeleted: false
    };

    if (recent === 'true') {
      // Recent files query
      console.log('Fetching recent files...');
      let files = await File.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 10);
      
      // Type filtering for recent files
      if (type === 'image') {
        console.log('Filtering recent files for images only');
        files = files.filter(file => file.mimeType && file.mimeType.startsWith('image/'));
      }
      
      // Filter files that actually exist
      const existingFiles = [];
      for (const file of files) {
        try {
          await fs.access(path.resolve(file.firebasePath));
          existingFiles.push(file);
        } catch (error) {
          console.log(`File missing, will be cleaned up: ${file.originalName}`);
          // Don't include missing files in response
        }
      }
      
      console.log('Recent files found:', existingFiles.length);
      console.log('Recent files (first 3):', existingFiles.slice(0, 3).map(f => ({ 
        name: f.originalName, 
        mimeType: f.mimeType, 
        type: f.mimeType ? (f.mimeType.startsWith('image/') ? 'image' : 'other') : 'unknown' 
      })));
      
      return res.json({ files: existingFiles, folders: [] });
    }

    // 타입 필터링 추가
    if (type === 'image') {
      console.log('Filtering for image files only');
      query.mimeType = { $regex: '^image/', $options: 'i' };
    } else if (type === 'video') {
      console.log('Filtering for video files only');
      query.mimeType = { $regex: '^video/', $options: 'i' };
    } else if (type === 'audio') {
      console.log('Filtering for audio files only');
      query.mimeType = { $regex: '^audio/', $options: 'i' };
    } else if (type === 'document') {
      console.log('Filtering for document files only');
      query.mimeType = { $in: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] };
    }

    // Regular files query
    query.folderId = folderId || null;
    
    console.log('Final query:', JSON.stringify(query, null, 2));
    
    const files = await File.find(query).sort({ createdAt: -1 });
    console.log('Files found in database:', files.length);
    
    // Log first few files for debugging
    console.log('Files (first 5):', files.slice(0, 5).map(f => ({ 
      name: f.originalName, 
      mimeType: f.mimeType, 
      type: f.mimeType ? (f.mimeType.startsWith('image/') ? 'image' : f.mimeType.startsWith('video/') ? 'video' : 'other') : 'unknown' 
    })));

    // Filter files that actually exist
    const existingFiles = [];
    const missingFiles = [];
    
    for (const file of files) {
      try {
        await fs.access(path.resolve(file.firebasePath));
        existingFiles.push(file);
      } catch (error) {
        console.log(`File missing: ${file.originalName}`);
        missingFiles.push(file);
      }
    }

    // Clean up missing files from database (optional background task)
    if (missingFiles.length > 0) {
      console.log(`Cleaning up ${missingFiles.length} missing files from database...`);
      for (const missingFile of missingFiles) {
        await File.findByIdAndUpdate(missingFile._id, { isDeleted: true });
        // Update user storage
        await User.findByIdAndUpdate(req.user._id, {
          $inc: { storageUsed: -missingFile.fileSize }
        });
      }
    }

    // For photos tab, don't include folders
    let folders = [];
    if (type !== 'image' && type !== 'video' && type !== 'audio' && type !== 'document') {
      folders = await Folder.find({
        userId: req.user._id,
        parentId: folderId || null,
        isDeleted: false
      }).sort({ name: 1 });
    }
    
    console.log('Folders found:', folders.length);
    console.log('Existing files after cleanup:', existingFiles.length);

    res.json({ files: existingFiles, folders });
  } catch (error) {
    console.error('Files list error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 파일 업로드
app.post('/api/files/upload', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const { folderId } = req.body;
    const uploadedFiles = [];

    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    if (req.user.storageUsed + totalSize > req.user.storageLimit) {
      return res.status(400).json({ error: '저장 공간이 부족합니다.' });
    }

    for (const file of req.files) {
      try {
        const savedFile = await File.create({
          userId: req.user._id,
          filename: file.filename,
          originalName: file.originalname,
          firebaseUrl: `/uploads/${req.user._id}/${file.filename}`,
          firebasePath: file.path,
          fileSize: file.size,
          mimeType: file.mimetype,
          folderId: folderId || null
        });

        uploadedFiles.push(savedFile);
      } catch (error) {
        console.error('File save error:', error);
        continue;
      }
    }

    await User.findByIdAndUpdate(req.user._id, {
      $inc: { storageUsed: totalSize }
    });

    logActivity(req, req.user._id, 'upload', `${uploadedFiles.length}개 파일 업로드`);

    res.json({
      message: `${uploadedFiles.length}개 파일이 성공적으로 업로드되었습니다.`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
  }
});

// 파일 다운로드
app.get('/api/files/:fileId/download', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      // 한글 파일명 처리
      const encodedFileName = encodeURIComponent(file.originalName);
      
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
      res.setHeader('Content-Type', file.mimeType);
      
      logActivity(req, req.user._id, 'download', `파일 다운로드: ${file.originalName}`, file._id);
      
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
      
    } catch {
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: '파일 다운로드에 실패했습니다.' });
  }
});

// 파일 미리보기
app.get('/api/files/:fileId/preview', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      // 한글 파일명 처리
      const encodedFileName = encodeURIComponent(file.originalName);
      
      // Set appropriate headers for inline viewing
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      
      // Stream the file
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
      
    } catch (error) {
      console.error('File access error:', error);
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: '파일 미리보기에 실패했습니다.' });
  }
});

// 파일 썸네일
app.get('/api/files/:fileId/thumbnail', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { size = '200' } = req.query; // Default thumbnail size 200px
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // Support thumbnails for images and videos
    const isImage = file.mimeType && file.mimeType.startsWith('image/');
    const isVideo = file.mimeType && file.mimeType.startsWith('video/');
    
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: '이미지 또는 비디오 파일만 썸네일을 지원합니다.' });
    }

    const filePath = path.resolve(file.firebasePath);
    
    try {
      await fs.access(filePath);
      
      if (isImage) {
        // For images, serve the original file
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent('thumb_' + file.originalName)}`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);
        
      } else if (isVideo) {
        // For videos, generate and serve thumbnail
        const thumbnailDir = path.join(__dirname, 'thumbnails');
        const thumbnailFileName = `${fileId}_thumb.jpg`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFileName);
        
        // Ensure thumbnail directory exists
        try {
          await fs.access(thumbnailDir);
        } catch {
          await fs.mkdir(thumbnailDir, { recursive: true });
        }
        
        // Check if thumbnail already exists
        let thumbnailExists = false;
        try {
          await fs.access(thumbnailPath);
          thumbnailExists = true;
        } catch {
          // Thumbnail doesn't exist, will generate it
        }
        
        if (!thumbnailExists) {
          try {
            await generateVideoThumbnail(filePath, thumbnailPath);
          } catch (error) {
            console.error('Failed to generate video thumbnail:', error);
            return res.status(500).json({ error: '비디오 썸네일 생성에 실패했습니다.' });
          }
        }
        
        // Serve the thumbnail
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent('thumb_' + file.originalName + '.jpg')}`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        const thumbnailStream = require('fs').createReadStream(thumbnailPath);
        thumbnailStream.pipe(res);
        
      }
      
    } catch (error) {
      console.error('File access error:', error);
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ error: '썸네일 로드에 실패했습니다.' });
  }
});

// 파일 삭제
app.delete('/api/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    await File.findByIdAndUpdate(fileId, { isDeleted: true });

    await User.findByIdAndUpdate(req.user._id, {
      $inc: { storageUsed: -file.fileSize }
    });

    // 실제 파일 삭제 (백그라운드)
    try {
      await fs.unlink(file.firebasePath);
    } catch (error) {
      console.error('File deletion error:', error);
    }

    logActivity(req, req.user._id, 'delete', `파일 삭제: ${file.originalName}`, file._id);

    res.json({ message: '파일이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
  }
});

// 파일 이름 변경
app.post('/api/files/:fileId/rename', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { newName } = req.body;
    
    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: '새 파일 이름을 입력해주세요.' });
    }

    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const oldName = file.originalName;
    await File.findByIdAndUpdate(fileId, { 
      originalName: newName.trim() 
    });

    logActivity(req, req.user._id, 'rename', `파일 이름 변경: ${oldName} → ${newName.trim()}`, file._id);

    res.json({ 
      message: '파일 이름이 성공적으로 변경되었습니다.',
      oldName,
      newName: newName.trim()
    });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({ error: '파일 이름 변경에 실패했습니다.' });
  }
});

// =================================
// 폴더 관리 라우트
// =================================

// 폴더 생성
app.post('/api/folders', authenticateToken, async (req, res) => {
  try {
    const { name, parentId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '폴더 이름을 입력해주세요.' });
    }

    let path = name.trim();
    if (parentId) {
      const parentFolder = await Folder.findOne({
        _id: parentId,
        userId: req.user._id,
        isDeleted: false
      });
      
      if (!parentFolder) {
        return res.status(404).json({ error: '부모 폴더를 찾을 수 없습니다.' });
      }
      
      path = `${parentFolder.path}/${name.trim()}`;
    }

    const folder = await Folder.create({
      userId: req.user._id,
      name: name.trim(),
      parentId: parentId || null,
      path
    });

    logActivity(req, req.user._id, 'create_folder', `폴더 생성: ${name}`);

    res.status(201).json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: '폴더 생성에 실패했습니다.' });
  }
});

// 폴더 이름 변경
app.post('/api/folders/:folderId/rename', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { newName } = req.body;
    
    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: '새 폴더 이름을 입력해주세요.' });
    }

    const folder = await Folder.findOne({
      _id: folderId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!folder) {
      return res.status(404).json({ error: '폴더를 찾을 수 없습니다.' });
    }

    const oldName = folder.name;
    
    // 폴더 경로도 업데이트
    let newPath = newName.trim();
    if (folder.parentId) {
      const parentFolder = await Folder.findOne({
        _id: folder.parentId,
        userId: req.user._id,
        isDeleted: false
      });
      
      if (parentFolder) {
        newPath = `${parentFolder.path}/${newName.trim()}`;
      }
    }

    await Folder.findByIdAndUpdate(folderId, { 
      name: newName.trim(),
      path: newPath
    });

    logActivity(req, req.user._id, 'rename', `폴더 이름 변경: ${oldName} → ${newName.trim()}`, folderId);

    res.json({ 
      message: '폴더 이름이 성공적으로 변경되었습니다.',
      oldName,
      newName: newName.trim()
    });
  } catch (error) {
    console.error('Rename folder error:', error);
    res.status(500).json({ error: '폴더 이름 변경에 실패했습니다.' });
  }
});

// 폴더 삭제
app.delete('/api/folders/:folderId', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    
    const folder = await Folder.findOne({
      _id: folderId,
      userId: req.user._id,
      isDeleted: false
    });

    if (!folder) {
      return res.status(404).json({ error: '폴더를 찾을 수 없습니다.' });
    }

    // 폴더 내의 모든 파일 삭제
    const files = await File.find({
      userId: req.user._id,
      folderId: folderId,
      isDeleted: false
    });

    let totalSizeReduced = 0;
    for (const file of files) {
      await File.findByIdAndUpdate(file._id, { isDeleted: true });
      totalSizeReduced += file.fileSize;
      
      // 실제 파일 삭제 (백그라운드)
      try {
        await fs.unlink(file.firebasePath);
      } catch (error) {
        console.error('File deletion error:', error);
      }
    }

    // 하위 폴더 삭제 (재귀적으로)
    const subFolders = await Folder.find({
      userId: req.user._id,
      parentId: folderId,
      isDeleted: false
    });

    for (const subFolder of subFolders) {
      await Folder.findByIdAndUpdate(subFolder._id, { isDeleted: true });
      
      // 하위 폴더의 파일들도 삭제
      const subFiles = await File.find({
        userId: req.user._id,
        folderId: subFolder._id,
        isDeleted: false
      });

      for (const subFile of subFiles) {
        await File.findByIdAndUpdate(subFile._id, { isDeleted: true });
        totalSizeReduced += subFile.fileSize;
        
        try {
          await fs.unlink(subFile.firebasePath);
        } catch (error) {
          console.error('File deletion error:', error);
        }
      }
    }

    // 폴더 삭제
    await Folder.findByIdAndUpdate(folderId, { isDeleted: true });

    // 사용자 저장 공간 업데이트
    if (totalSizeReduced > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { storageUsed: -totalSizeReduced }
      });
    }

    logActivity(req, req.user._id, 'delete_folder', `폴더 삭제: ${folder.name}`, folderId);

    res.json({ 
      message: '폴더가 성공적으로 삭제되었습니다.',
      deletedFiles: files.length,
      freedSpace: totalSizeReduced
    });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: '폴더 삭제에 실패했습니다.' });
  }
});

// 모든 폴더 목록 조회 (사이드바용)
app.get('/api/folders/all', authenticateToken, async (req, res) => {
  try {
    const folders = await Folder.find({
      userId: req.user._id,
      isDeleted: false
    }).sort({ name: 1 });

    console.log('All folders retrieved:', folders.length);

    res.json({ folders });
  } catch (error) {
    console.error('All folders list error:', error);
    res.status(500).json({ error: '폴더 목록을 가져오는데 실패했습니다.' });
  }
});

// =================================
// 휴지통 관리 라우트
// =================================

// 휴지통 파일 목록 조회
app.get('/api/trash', authenticateToken, async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user._id,
      isDeleted: true
    }).sort({ updatedAt: -1 });

    const folders = await Folder.find({
      userId: req.user._id,
      isDeleted: true
    }).sort({ updatedAt: -1 });

    res.json({ files, folders });
  } catch (error) {
    console.error('Trash files error:', error);
    res.status(500).json({ error: '휴지통 파일 목록을 가져오는데 실패했습니다.' });
  }
});

// 파일 완전 삭제
app.delete('/api/trash/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: true
    });

    if (!file) {
      return res.status(404).json({ error: '삭제된 파일을 찾을 수 없습니다.' });
    }

    // 실제 파일 삭제
    try {
      await fs.unlink(file.firebasePath);
    } catch (error) {
      console.error('File deletion error:', error);
    }

    // 데이터베이스에서 완전 삭제
    await File.findByIdAndDelete(fileId);

    logActivity(req, req.user._id, 'delete', `파일 완전 삭제: ${file.originalName}`, fileId);

    res.json({ message: '파일이 완전히 삭제되었습니다.' });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ error: '파일 완전 삭제에 실패했습니다.' });
  }
});

// 파일 복구
app.post('/api/trash/files/:fileId/restore', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`🔄 파일 복구 요청: fileId=${fileId}, userId=${req.user._id}`);
    
    const file = await File.findOne({
      _id: fileId,
      userId: req.user._id,
      isDeleted: true
    });

    if (!file) {
      console.log(`❌ 복구할 파일을 찾을 수 없음: fileId=${fileId}`);
      return res.status(404).json({ error: '삭제된 파일을 찾을 수 없습니다.' });
    }

    console.log(`📋 복구할 파일 정보:`, {
      id: file._id,
      name: file.originalName,
      isDeleted: file.isDeleted,
      fileSize: file.fileSize,
      filePath: file.firebasePath
    });

    // 실제 파일이 존재하는지 확인
    try {
      await fs.access(file.firebasePath);
      console.log(`✅ 실제 파일 존재 확인: ${file.firebasePath}`);
    } catch (error) {
      console.log(`❌ 실제 파일이 존재하지 않음: ${file.firebasePath}`);
      return res.status(400).json({ 
        error: '실제 파일이 존재하지 않아 복구할 수 없습니다. 파일이 완전히 삭제되었을 수 있습니다.' 
      });
    }

    // 파일 복구 (isDeleted를 false로 변경)
    const updateResult = await File.findByIdAndUpdate(
      fileId, 
      { isDeleted: false },
      { new: true }
    );
    
    console.log(`✅ 파일 복구 완료:`, {
      id: updateResult._id,
      name: updateResult.originalName,
      isDeleted: updateResult.isDeleted
    });

    // 사용자 저장 공간 복구
    const userUpdateResult = await User.findByIdAndUpdate(req.user._id, {
      $inc: { storageUsed: file.fileSize }
    }, { new: true });

    console.log(`💾 저장공간 복구 완료: ${file.fileSize} bytes 추가, 총 사용량: ${userUpdateResult.storageUsed}`);

    logActivity(req, req.user._id, 'upload', `파일 복구: ${file.originalName}`, fileId);

    res.json({ 
      message: '파일이 성공적으로 복구되었습니다.',
      file: {
        id: updateResult._id,
        name: updateResult.originalName,
        isDeleted: updateResult.isDeleted
      }
    });
  } catch (error) {
    console.error('❌ 파일 복구 오류:', error);
    res.status(500).json({ error: '파일 복구에 실패했습니다.' });
  }
});

// 폴더 완전 삭제
app.delete('/api/trash/folders/:folderId', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    
    const folder = await Folder.findOne({
      _id: folderId,
      userId: req.user._id,
      isDeleted: true
    });

    if (!folder) {
      return res.status(404).json({ error: '삭제된 폴더를 찾을 수 없습니다.' });
    }

    // 폴더 내의 모든 파일 완전 삭제
    const files = await File.find({
      userId: req.user._id,
      folderId: folderId,
      isDeleted: true
    });

    for (const file of files) {
      // 실제 파일 삭제
      try {
        await fs.unlink(file.firebasePath);
      } catch (error) {
        console.error('File deletion error:', error);
      }
      
      // 데이터베이스에서 완전 삭제
      await File.findByIdAndDelete(file._id);
    }

    // 하위 폴더 완전 삭제 (재귀적으로)
    const subFolders = await Folder.find({
      userId: req.user._id,
      parentId: folderId,
      isDeleted: true
    });

    for (const subFolder of subFolders) {
      // 하위 폴더의 파일들도 완전 삭제
      const subFiles = await File.find({
        userId: req.user._id,
        folderId: subFolder._id,
        isDeleted: true
      });

      for (const subFile of subFiles) {
        try {
          await fs.unlink(subFile.firebasePath);
        } catch (error) {
          console.error('File deletion error:', error);
        }
        
        await File.findByIdAndDelete(subFile._id);
      }
      
      // 하위 폴더 삭제
      await Folder.findByIdAndDelete(subFolder._id);
    }

    // 폴더 완전 삭제
    await Folder.findByIdAndDelete(folderId);

    logActivity(req, req.user._id, 'delete', `폴더 완전 삭제: ${folder.name}`, folderId);

    res.json({ 
      message: '폴더가 완전히 삭제되었습니다.',
      deletedFiles: files.length
    });
  } catch (error) {
    console.error('Permanent delete folder error:', error);
    res.status(500).json({ error: '폴더 완전 삭제에 실패했습니다.' });
  }
});

// 폴더 복구
app.post('/api/trash/folders/:folderId/restore', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    console.log(`🔄 폴더 복구 요청: folderId=${folderId}, userId=${req.user._id}`);
    
    const folder = await Folder.findOne({
      _id: folderId,
      userId: req.user._id,
      isDeleted: true
    });

    if (!folder) {
      console.log(`❌ 복구할 폴더를 찾을 수 없음: folderId=${folderId}`);
      return res.status(404).json({ error: '삭제된 폴더를 찾을 수 없습니다.' });
    }

    console.log(`📋 복구할 폴더 정보:`, {
      id: folder._id,
      name: folder.name,
      isDeleted: folder.isDeleted
    });

    // 폴더 복구
    await Folder.findByIdAndUpdate(folderId, { isDeleted: false });

    // 폴더 내의 모든 파일 찾기
    const files = await File.find({
      userId: req.user._id,
      folderId: folderId,
      isDeleted: true
    });

    console.log(`📁 폴더 내 파일 개수: ${files.length}`);

    let totalSizeRestored = 0;
    let restoredFileCount = 0;
    let missingFileCount = 0;

    for (const file of files) {
      // 실제 파일이 존재하는지 확인
      try {
        await fs.access(file.firebasePath);
        console.log(`✅ 파일 존재 확인: ${file.originalName}`);
        
        // 파일 복구
        await File.findByIdAndUpdate(file._id, { isDeleted: false });
        totalSizeRestored += file.fileSize;
        restoredFileCount++;
      } catch (error) {
        console.log(`❌ 파일 누락: ${file.originalName} (${file.firebasePath})`);
        missingFileCount++;
        
        // 누락된 파일은 데이터베이스에서 완전 삭제
        await File.findByIdAndDelete(file._id);
      }
    }

    // 하위 폴더 복구 (재귀적으로)
    const subFolders = await Folder.find({
      userId: req.user._id,
      parentId: folderId,
      isDeleted: true
    });

    for (const subFolder of subFolders) {
      await Folder.findByIdAndUpdate(subFolder._id, { isDeleted: false });
      
      // 하위 폴더의 파일들도 복구
      const subFiles = await File.find({
        userId: req.user._id,
        folderId: subFolder._id,
        isDeleted: true
      });

      for (const subFile of subFiles) {
        try {
          await fs.access(subFile.firebasePath);
          await File.findByIdAndUpdate(subFile._id, { isDeleted: false });
          totalSizeRestored += subFile.fileSize;
          restoredFileCount++;
        } catch (error) {
          console.log(`❌ 하위 파일 누락: ${subFile.originalName}`);
          missingFileCount++;
          await File.findByIdAndDelete(subFile._id);
        }
      }
    }

    // 사용자 저장 공간 복구
    if (totalSizeRestored > 0) {
      const userUpdateResult = await User.findByIdAndUpdate(req.user._id, {
        $inc: { storageUsed: totalSizeRestored }
      }, { new: true });

      console.log(`💾 저장공간 복구 완료: ${totalSizeRestored} bytes 추가, 총 사용량: ${userUpdateResult.storageUsed}`);
    }

    logActivity(req, req.user._id, 'create_folder', `폴더 복구: ${folder.name}`, folderId);

    let message = `폴더가 성공적으로 복구되었습니다. (복구된 파일: ${restoredFileCount}개)`;
    if (missingFileCount > 0) {
      message += ` ${missingFileCount}개의 파일은 실제 파일이 존재하지 않아 복구할 수 없었습니다.`;
    }

    res.json({ 
      message: message,
      restoredFiles: restoredFileCount,
      missingFiles: missingFileCount,
      restoredSpace: totalSizeRestored
    });
  } catch (error) {
    console.error('❌ 폴더 복구 오류:', error);
    res.status(500).json({ error: '폴더 복구에 실패했습니다.' });
  }
});

// =================================
// 검색 라우트
// =================================

// 파일 검색
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 1) {
      return res.status(400).json({ error: '검색어를 입력해주세요.' });
    }

    const searchTerm = q.trim();
    
    const files = await File.find({
      userId: req.user._id,
      isDeleted: false,
      $or: [
        { originalName: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { tags: { $in: [new RegExp(searchTerm, 'i')] } }
      ]
    }).sort({ createdAt: -1 });

    const folders = await Folder.find({
      userId: req.user._id,
      isDeleted: false,
      name: { $regex: searchTerm, $options: 'i' }
    }).sort({ name: 1 });

    res.json({ files, folders });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: '검색에 실패했습니다.' });
  }
});

// =================================
// 에러 핸들러
// =================================

app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ error: 'API 엔드포인트를 찾을 수 없습니다.' });
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.use((error, req, res, next) => {
  console.error('Global error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '파일 크기가 너무 큽니다.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '파일 개수가 너무 많습니다.' });
    }
  }
  
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// =================================
// 서버 시작
// =================================

const startServer = async () => {
  try {
    await ensureUploadDir();
    await connectDB();
    
    app.listen(config.PORT, () => {
      console.log(`🚀 Philip-Box server running on port ${config.PORT}`);
      console.log(`📁 Visit http://localhost:${config.PORT} to use the application`);
      console.log(`🍃 Connected to MongoDB: ${config.MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
      console.log(`💾 Using local file storage: ${uploadDir}`);
    });
  } catch (error) {
    console.error('Server start error:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
}); 