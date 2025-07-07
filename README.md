# MyDropbox - 완전한 Dropbox 클론

## 📋 개요

MyDropbox는 Dropbox와 동일한 기능을 제공하는 완전한 파일 저장 및 공유 플랫폼입니다. 현대적인 웹 기술을 사용하여 구축되었으며, 직관적인 UI와 강력한 기능들을 제공합니다.

## ✨ 주요 기능

### 🔐 사용자 관리
- 회원가입 및 로그인
- JWT 기반 인증
- 사용자 프로필 관리
- 저장 공간 관리 (2GB 제한)

### 📁 파일 관리
- 드래그 앤 드롭 파일 업로드
- 다중 파일 업로드 지원
- 파일 미리보기 (이미지, 텍스트)
- 파일 다운로드
- 파일 삭제 및 복구

### 📂 폴더 관리
- 폴더 생성 및 관리
- 계층적 폴더 구조
- 브레드크럼 네비게이션

### 🔍 검색 및 필터링
- 파일명 기반 검색
- 파일 타입별 분류
- 최근 파일, 즐겨찾기, 공유 파일

### 🎨 사용자 인터페이스
- 현대적이고 직관적인 디자인
- 그리드 및 리스트 뷰
- 반응형 디자인 (모바일 지원)
- 다크 모드 지원

### ⚡ 고급 기능
- 키보드 단축키
- 컨텍스트 메뉴
- 실시간 알림
- 파일 선택 및 다중 작업

## 🛠️ 기술 스택

### 백엔드
- **Node.js** - 서버 런타임
- **Express.js** - 웹 프레임워크
- **SQLite3** - 데이터베이스
- **JWT** - 인증
- **Multer** - 파일 업로드
- **bcrypt** - 비밀번호 해싱

### 프론트엔드
- **HTML5** - 마크업
- **CSS3** - 스타일링
- **JavaScript ES6+** - 동적 기능
- **Font Awesome** - 아이콘

## 📦 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 서버 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

### 3. 브라우저에서 접속
```
http://localhost:3001
```

## 🎯 사용 방법

### 1. 회원가입/로그인
- 첫 방문 시 회원가입 양식을 작성하세요
- 기존 사용자는 로그인하세요

### 2. 파일 업로드
- **드래그 앤 드롭**: 파일을 업로드 영역으로 끌어다 놓기
- **클릭 업로드**: "업로드" 버튼 클릭 후 파일 선택
- **다중 파일**: 여러 파일을 한 번에 선택 가능

### 3. 폴더 관리
- "새 폴더" 버튼으로 폴더 생성
- 폴더를 더블클릭하여 열기
- 브레드크럼으로 경로 이동

### 4. 파일 관리
- 파일을 더블클릭하여 미리보기
- 우클릭으로 컨텍스트 메뉴 열기
- 파일 선택 후 다양한 작업 수행

### 5. 키보드 단축키
- `Ctrl + A`: 전체 선택
- `Ctrl + U`: 파일 업로드
- `Delete`: 선택한 파일 삭제

## 📱 반응형 디자인

MyDropbox는 다양한 화면 크기에서 완벽하게 작동합니다:

- **데스크톱**: 1200px 이상
- **태블릿**: 768px - 1199px
- **모바일**: 767px 이하

## 🔧 환경 설정

`config.js` 파일에서 다음 설정을 변경할 수 있습니다:

```javascript
module.exports = {
  PORT: 3001,                    // 서버 포트
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 최대 파일 크기 (100MB)
  STORAGE_LIMIT: 2 * 1024 * 1024 * 1024, // 사용자당 저장 공간 (2GB)
  JWT_SECRET: 'your-secret-key',  // JWT 비밀키
  // ... 기타 설정
};
```

## 📊 데이터베이스 구조

### Users 테이블
- id, name, email, password
- storage_used, created_at, updated_at

### Files 테이블
- id, user_id, filename, original_name
- file_path, file_size, mime_type
- folder_id, is_shared, is_favorite, is_deleted
- created_at, updated_at

### Folders 테이블
- id, user_id, name, parent_id
- path, is_deleted
- created_at, updated_at

## 🔐 보안 기능

- JWT 토큰 기반 인증
- 비밀번호 해싱 (bcrypt)
- 파일 접근 권한 검증
- CORS 정책 적용
- 파일 크기 제한

## 🚀 배포

### 로컬 배포
```bash
npm start
```

### 프로덕션 배포
1. 환경 변수 설정
2. 데이터베이스 설정
3. 정적 파일 경로 설정
4. 서버 실행

## 🤝 기여하기

1. 이 저장소를 포크하세요
2. 기능 브랜치를 생성하세요 (`git checkout -b feature/AmazingFeature`)
3. 변경사항을 커밋하세요 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시하세요 (`git push origin feature/AmazingFeature`)
5. Pull Request를 생성하세요

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 📞 지원

문제가 발생하거나 질문이 있으시면 GitHub Issues를 통해 문의해주세요.

## 🎉 데모

실제 동작하는 데모를 보려면 서버를 실행하고 브라우저에서 `http://localhost:3001`에 접속하세요.

---

**MyDropbox**로 안전하고 편리한 파일 관리를 경험해보세요! 🚀 