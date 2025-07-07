class DropboxClone {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentFolderId = null;
        this.selectedFiles = new Set();
        this.currentView = 'grid';
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
        this.hideLoading();
    }

    hideLoading() {
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
        }, 1000);
    }

    setupEventListeners() {
        // Auth form listeners
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('showRegister').addEventListener('click', () => this.showRegisterForm());
        document.getElementById('showLogin').addEventListener('click', () => this.showLoginForm());

        // App listeners
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('uploadBtn').addEventListener('click', () => this.triggerFileUpload());
        document.getElementById('newFolderBtn').addEventListener('click', () => this.showNewFolderModal());
        document.getElementById('selectAllBtn').addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // File input listener
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop listeners
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // View toggle listeners
        document.getElementById('gridViewBtn').addEventListener('click', () => this.setView('grid'));
        document.getElementById('listViewBtn').addEventListener('click', () => this.setView('list'));

        // Nav tab listeners
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Modal listeners
        document.getElementById('newFolderForm').addEventListener('submit', (e) => this.handleNewFolder(e));

        // Context menu listeners
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    checkAuth() {
        if (this.token) {
            this.showApp();
            this.loadUserProfile();
            this.loadFiles();
        } else {
            this.showAuth();
        }
    }

    showAuth() {
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
    }

    showApp() {
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
    }

    showRegisterForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }

    showLoginForm() {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }

    async handleLogin(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const loginData = {
            email: formData.get('email'),
            password: formData.get('password')
        };

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(loginData)
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                this.showApp();
                this.loadUserProfile();
                this.loadFiles();
                this.showNotification('로그인 성공!', 'success');
            } else {
                this.showNotification(data.error || '로그인에 실패했습니다.', 'error');
            }
        } catch (error) {
            this.showNotification('서버 오류가 발생했습니다.', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');

        if (password !== confirmPassword) {
            this.showNotification('비밀번호가 일치하지 않습니다.', 'error');
            return;
        }

        const registerData = {
            name: formData.get('name'),
            email: formData.get('email'),
            password: password
        };

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(registerData)
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                this.showApp();
                this.loadUserProfile();
                this.loadFiles();
                this.showNotification('회원가입 성공!', 'success');
            } else {
                this.showNotification(data.error || '회원가입에 실패했습니다.', 'error');
            }
        } catch (error) {
            this.showNotification('서버 오류가 발생했습니다.', 'error');
        }
    }

    handleLogout() {
        this.token = null;
        this.user = {};
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.showAuth();
        this.showNotification('로그아웃되었습니다.', 'info');
    }

    async loadUserProfile() {
        try {
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const user = await response.json();
                document.getElementById('userName').textContent = user.name;
                document.getElementById('userEmail').textContent = user.email;
                this.updateStorageInfo(user.storage_used, user.storage_limit);
            }
        } catch (error) {
            console.error('Failed to load user profile:', error);
        }
    }

    updateStorageInfo(used, limit) {
        const percentage = (used / limit) * 100;
        document.getElementById('storageUsed').style.width = `${percentage}%`;
        document.getElementById('storageText').textContent = 
            `${this.formatFileSize(used)} / ${this.formatFileSize(limit)} 사용`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async loadFiles(folderId = null) {
        try {
            const response = await fetch(`/api/files?folderId=${folderId || ''}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderFiles(data.files, data.folders);
            }
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }

    renderFiles(files, folders) {
        const fileGrid = document.getElementById('fileGrid');
        const emptyState = document.getElementById('emptyState');
        
        fileGrid.innerHTML = '';
        
        if (files.length === 0 && folders.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        // Render folders first
        folders.forEach(folder => {
            const folderElement = this.createFolderElement(folder);
            fileGrid.appendChild(folderElement);
        });
        
        // Render files
        files.forEach(file => {
            const fileElement = this.createFileElement(file);
            fileGrid.appendChild(fileElement);
        });
    }

    createFolderElement(folder) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'folder';
        div.dataset.id = folder.id;
        
        div.innerHTML = `
            <div class="file-icon folder">
                <i class="fas fa-folder"></i>
            </div>
            <div class="file-name">${folder.name}</div>
            <div class="file-info">
                <span>폴더</span>
                <span>${new Date(folder.created_at).toLocaleDateString()}</span>
            </div>
            <div class="file-actions">
                <button class="file-action" onclick="app.openFolder(${folder.id})">
                    <i class="fas fa-folder-open"></i>
                </button>
                <button class="file-action" onclick="app.showContextMenu(event, ${folder.id}, 'folder')">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        div.addEventListener('dblclick', () => this.openFolder(folder.id));
        
        return div;
    }

    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'file';
        div.dataset.id = file.id;
        
        const fileType = this.getFileType(file.mime_type);
        const icon = this.getFileIcon(fileType);
        
        div.innerHTML = `
            <div class="file-icon ${fileType}">
                <i class="${icon}"></i>
            </div>
            <div class="file-name">${file.original_name}</div>
            <div class="file-info">
                <span>${this.formatFileSize(file.file_size)}</span>
                <span>${new Date(file.created_at).toLocaleDateString()}</span>
            </div>
            <div class="file-actions">
                <button class="file-action" onclick="app.downloadFile(${file.id})">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action" onclick="app.showContextMenu(event, ${file.id}, 'file')">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        div.addEventListener('dblclick', () => this.previewFile(file));
        div.addEventListener('click', (e) => this.handleFileClick(e, file.id));
        
        return div;
    }

    getFileType(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
        if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
        return 'default';
    }

    getFileIcon(fileType) {
        const icons = {
            image: 'fas fa-image',
            video: 'fas fa-video',
            document: 'fas fa-file-alt',
            archive: 'fas fa-file-archive',
            folder: 'fas fa-folder',
            default: 'fas fa-file'
        };
        return icons[fileType] || icons.default;
    }

    handleFileClick(e, fileId) {
        if (e.ctrlKey || e.metaKey) {
            // Multi-select with Ctrl/Cmd
            if (this.selectedFiles.has(fileId)) {
                this.selectedFiles.delete(fileId);
            } else {
                this.selectedFiles.add(fileId);
            }
        } else {
            // Single select
            this.selectedFiles.clear();
            this.selectedFiles.add(fileId);
        }
        
        this.updateFileSelection();
    }

    updateFileSelection() {
        document.querySelectorAll('.file-item').forEach(item => {
            const fileId = parseInt(item.dataset.id);
            if (this.selectedFiles.has(fileId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    triggerFileUpload() {
        document.getElementById('fileInput').click();
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await this.uploadFiles(files);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
    }

    async handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await this.uploadFiles(files);
        }
    }

    async uploadFiles(files) {
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        
        if (this.currentFolderId) {
            formData.append('folderId', this.currentFolderId);
        }

        const uploadProgress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        uploadProgress.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = '업로드 중...';

        try {
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                progressFill.style.width = '100%';
                progressText.textContent = '업로드 완료!';
                
                setTimeout(() => {
                    uploadProgress.classList.add('hidden');
                    this.loadFiles(this.currentFolderId);
                    this.showNotification(`${files.length}개 파일이 업로드되었습니다.`, 'success');
                }, 1000);
            } else {
                uploadProgress.classList.add('hidden');
                this.showNotification(data.error || '업로드에 실패했습니다.', 'error');
            }
        } catch (error) {
            uploadProgress.classList.add('hidden');
            this.showNotification('업로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async downloadFile(fileId) {
        try {
            const response = await fetch(`/api/files/${fileId}/download`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = ''; // Browser will use the filename from Content-Disposition header
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                this.showNotification('파일 다운로드를 시작했습니다.', 'success');
            }
        } catch (error) {
            this.showNotification('다운로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async deleteFile(fileId) {
        if (!confirm('이 파일을 삭제하시겠습니까?')) {
            return;
        }

        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadFiles(this.currentFolderId);
                this.showNotification('파일이 삭제되었습니다.', 'success');
            }
        } catch (error) {
            this.showNotification('삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    showNewFolderModal() {
        document.getElementById('currentLocation').textContent = this.getCurrentPath();
        this.showModal('newFolderModal');
    }

    async handleNewFolder(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const folderData = {
            name: formData.get('name'),
            parentId: this.currentFolderId
        };

        try {
            const response = await fetch('/api/folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(folderData)
            });

            if (response.ok) {
                this.closeModal('newFolderModal');
                this.loadFiles(this.currentFolderId);
                this.showNotification('폴더가 생성되었습니다.', 'success');
                e.target.reset();
            }
        } catch (error) {
            this.showNotification('폴더 생성 중 오류가 발생했습니다.', 'error');
        }
    }

    getCurrentPath() {
        // This would need to be implemented based on your folder structure
        return '/';
    }

    openFolder(folderId) {
        this.currentFolderId = folderId;
        this.loadFiles(folderId);
        this.updateBreadcrumb();
    }

    updateBreadcrumb() {
        // This would need to be implemented based on your folder structure
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = `
            <a href="#" data-folder-id="" onclick="app.openFolder(null)">
                <i class="fas fa-home"></i> 홈
            </a>
        `;
    }

    setView(view) {
        this.currentView = view;
        const fileGrid = document.getElementById('fileGrid');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (view === 'grid') {
            fileGrid.classList.remove('list-view');
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        } else {
            fileGrid.classList.add('list-view');
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Load different content based on tab
        switch(tabName) {
            case 'files':
                this.loadFiles(this.currentFolderId);
                break;
            case 'shared':
                this.loadSharedFiles();
                break;
            case 'recent':
                this.loadRecentFiles();
                break;
            case 'favorites':
                this.loadFavorites();
                break;
            case 'trash':
                this.loadTrash();
                break;
        }
    }

    async loadSharedFiles() {
        // Implementation for shared files
        this.showNotification('공유된 파일 기능은 개발 중입니다.', 'info');
    }

    async loadRecentFiles() {
        // Implementation for recent files
        this.showNotification('최근 파일 기능은 개발 중입니다.', 'info');
    }

    async loadFavorites() {
        // Implementation for favorites
        this.showNotification('즐겨찾기 기능은 개발 중입니다.', 'info');
    }

    async loadTrash() {
        // Implementation for trash
        this.showNotification('휴지통 기능은 개발 중입니다.', 'info');
    }

    async handleSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
            this.loadFiles(this.currentFolderId);
            return;
        }

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderFiles(data.files, []);
                this.showNotification(`"${query}"에 대한 검색 결과입니다.`, 'info');
            }
        } catch (error) {
            this.showNotification('검색 중 오류가 발생했습니다.', 'error');
        }
    }

    toggleSelectAll() {
        const allItems = document.querySelectorAll('.file-item');
        if (this.selectedFiles.size === allItems.length) {
            this.selectedFiles.clear();
        } else {
            this.selectedFiles.clear();
            allItems.forEach(item => {
                this.selectedFiles.add(parseInt(item.dataset.id));
            });
        }
        this.updateFileSelection();
    }

    handleContextMenu(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        e.preventDefault();
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.classList.remove('hidden');
        
        // Store the target file info
        contextMenu.dataset.fileId = fileItem.dataset.id;
        contextMenu.dataset.fileType = fileItem.dataset.type;
    }

    hideContextMenu() {
        document.getElementById('contextMenu').classList.add('hidden');
    }

    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'a':
                    e.preventDefault();
                    this.toggleSelectAll();
                    break;
                case 'u':
                    e.preventDefault();
                    this.triggerFileUpload();
                    break;
            }
        }
    }

    async previewFile(file) {
        const modal = document.getElementById('previewModal');
        const title = document.getElementById('previewTitle');
        const content = document.getElementById('previewContent');
        
        title.textContent = file.original_name;
        
        if (file.mime_type.startsWith('image/')) {
            content.innerHTML = `<img src="/uploads/${this.user.id}/${file.filename}" style="max-width: 100%; max-height: 500px;" alt="${file.original_name}">`;
        } else if (file.mime_type.startsWith('text/')) {
            content.innerHTML = `<iframe src="/uploads/${this.user.id}/${file.filename}" style="width: 100%; height: 500px; border: none;"></iframe>`;
        } else {
            content.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-file" style="font-size: 4rem; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>${file.original_name}</h3>
                    <p>이 파일 형식은 미리보기를 지원하지 않습니다.</p>
                    <button class="btn btn-primary" onclick="app.downloadFile(${file.id})">
                        <i class="fas fa-download"></i> 다운로드
                    </button>
                </div>
            `;
        }
        
        this.showModal('previewModal');
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="${icon[type]}"></i>
            <span>${message}</span>
        `;
        
        notifications.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Global functions for onclick handlers
function closeModal(modalId) {
    app.closeModal(modalId);
}

// Initialize the app
const app = new DropboxClone();

// Export for global access
window.app = app; 