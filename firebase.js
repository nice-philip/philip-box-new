const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

// Firebase Admin SDK 초기화
let firebaseApp = null;

try {
  // private key 처리
  const privateKey = config.FIREBASE_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('Firebase private key is missing');
  }
  
  // Service account 설정
  const serviceAccount = {
    type: "service_account",
    project_id: config.FIREBASE_PROJECT_ID,
    private_key_id: config.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: config.FIREBASE_CLIENT_EMAIL,
    client_id: config.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: config.FIREBASE_CLIENT_X509_CERT_URL
  };

  // Firebase 앱 초기화
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.FIREBASE_STORAGE_BUCKET
  });
  
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  // Firebase 없이도 서버가 시작되도록 함
  firebaseApp = null;
}

const storage = firebaseApp ? admin.storage() : null;
const bucket = storage ? storage.bucket() : null;

/**
 * Firebase Storage에 파일 업로드
 * @param {Buffer} fileBuffer - 파일 데이터
 * @param {string} originalName - 원본 파일명
 * @param {string} mimeType - 파일 MIME 타입
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 업로드 결과
 */
const uploadFile = async (fileBuffer, originalName, mimeType, userId) => {
  if (!bucket) {
    throw new Error('Firebase Storage가 초기화되지 않았습니다.');
  }
  
  try {
    const fileExtension = originalName.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = `uploads/${userId}/${fileName}`;
    
    const file = bucket.file(filePath);
    
    // 파일 업로드
    await file.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName: originalName,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString()
        }
      }
    });
    
    // 다운로드 URL 생성 (7일 만료)
    const [downloadURL] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7일
    });
    
    return {
      fileName: fileName,
      filePath: filePath,
      downloadURL: downloadURL,
      size: fileBuffer.length
    };
  } catch (error) {
    console.error('Firebase upload error:', error);
    throw new Error('파일 업로드에 실패했습니다.');
  }
};

/**
 * Firebase Storage에서 파일 다운로드 URL 생성
 * @param {string} filePath - Firebase Storage 파일 경로
 * @param {number} expiresIn - 만료 시간 (밀리초)
 * @returns {Promise<string>} 다운로드 URL
 */
const getDownloadURL = async (filePath, expiresIn = 24 * 60 * 60 * 1000) => {
  if (!bucket) {
    throw new Error('Firebase Storage가 초기화되지 않았습니다.');
  }
  
  try {
    const file = bucket.file(filePath);
    const [downloadURL] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn,
    });
    return downloadURL;
  } catch (error) {
    console.error('Firebase download URL error:', error);
    throw new Error('다운로드 URL 생성에 실패했습니다.');
  }
};

/**
 * Firebase Storage에서 파일 삭제
 * @param {string} filePath - Firebase Storage 파일 경로
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
const deleteFile = async (filePath) => {
  if (!bucket) {
    console.warn('Firebase Storage가 초기화되지 않았습니다.');
    return true;
  }
  
  try {
    const file = bucket.file(filePath);
    await file.delete();
    return true;
  } catch (error) {
    console.error('Firebase delete error:', error);
    // 파일이 존재하지 않는 경우도 성공으로 처리
    if (error.code === 404) {
      return true;
    }
    throw new Error('파일 삭제에 실패했습니다.');
  }
};

/**
 * Firebase Storage에서 파일 존재 여부 확인
 * @param {string} filePath - Firebase Storage 파일 경로
 * @returns {Promise<boolean>} 파일 존재 여부
 */
const fileExists = async (filePath) => {
  if (!bucket) {
    return false;
  }
  
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error('Firebase file exists error:', error);
    return false;
  }
};

/**
 * Firebase Storage에서 파일 메타데이터 조회
 * @param {string} filePath - Firebase Storage 파일 경로
 * @returns {Promise<Object>} 파일 메타데이터
 */
const getFileMetadata = async (filePath) => {
  if (!bucket) {
    throw new Error('Firebase Storage가 초기화되지 않았습니다.');
  }
  
  try {
    const file = bucket.file(filePath);
    const [metadata] = await file.getMetadata();
    return metadata;
  } catch (error) {
    console.error('Firebase metadata error:', error);
    throw new Error('파일 메타데이터 조회에 실패했습니다.');
  }
};

/**
 * Firebase Storage에서 파일 스트림 생성
 * @param {string} filePath - Firebase Storage 파일 경로
 * @returns {ReadableStream} 파일 스트림
 */
const createReadStream = (filePath) => {
  if (!bucket) {
    throw new Error('Firebase Storage가 초기화되지 않았습니다.');
  }
  
  const file = bucket.file(filePath);
  return file.createReadStream();
};

module.exports = {
  admin,
  storage,
  bucket,
  uploadFile,
  getDownloadURL,
  deleteFile,
  fileExists,
  getFileMetadata,
  createReadStream,
  isInitialized: () => !!firebaseApp
}; 