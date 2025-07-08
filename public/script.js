class DropboxClone {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentFolderId = null;
        this.selectedFiles = new Set();
        this.currentView = 'grid';
        this.contextTarget = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
        this.updateBreadcrumb();
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
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        
        // Search button listener  
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());

        // File input listener
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop listeners
        this.setupDragAndDrop();

        // View toggle listeners
        document.getElementById('gridViewBtn').addEventListener('click', () => this.setView('grid'));
        document.getElementById('listViewBtn').addEventListener('click', () => this.setView('list'));

        // Nav item listeners
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(item.dataset.tab);
            });
        });

        // Files tab listeners
        document.querySelectorAll('.files-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchFilesTab(tab.dataset.filter));
        });

        // View button listeners
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        // Modal listeners
        document.getElementById('newFolderForm').addEventListener('submit', (e) => this.handleNewFolder(e));
        
        // 공유 모달 listeners
        document.getElementById('createShareBtn').addEventListener('click', () => this.createShareLink());
        document.getElementById('cancelShareBtn').addEventListener('click', () => this.cancelShare());
        document.getElementById('copyShareUrl').addEventListener('click', () => this.copyShareUrl());
        
        // 이름 변경 모달 listener
        document.getElementById('renameForm').addEventListener('submit', (e) => this.handleRename(e));
        
        // Modal close listeners
        this.setupModalListeners();

        // Context menu listeners
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        
        // 컨텍스트 메뉴 항목 클릭 이벤트
        document.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleContextAction(item.dataset.action);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setupModalListeners() {
        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Add event listeners to all modal close buttons
        document.querySelectorAll('.modal-close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Add event listeners to all modal cancel buttons
        document.querySelectorAll('.modal-cancel').forEach(cancelBtn => {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const modal = cancelBtn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Prevent modal content clicks from closing modal
        document.querySelectorAll('.modal-content').forEach(content => {
            content.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    setupDragAndDrop() {
        let isDragging = false;
        let dragLeaveTimeout;
        
        // Document level events for better stability
        document.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.token) return;
            
            isDragging = true;
            
            // Clear any pending timeout
            if (dragLeaveTimeout) {
                clearTimeout(dragLeaveTimeout);
                dragLeaveTimeout = null;
            }
            
            // Show upload area
            document.getElementById('uploadArea').classList.add('drag-over');
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.token) return;
            
            // Use timeout to avoid flickering when moving between elements
            dragLeaveTimeout = setTimeout(() => {
                isDragging = false;
                document.getElementById('uploadArea').classList.remove('drag-over');
            }, 100);
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            
            // Clear timeout
            if (dragLeaveTimeout) {
                clearTimeout(dragLeaveTimeout);
                dragLeaveTimeout = null;
            }
            
            if (this.token) {
                document.getElementById('uploadArea').classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    this.uploadFiles(files);
                }
            } else {
                this.showNotification('파일을 업로드하려면 로그인이 필요합니다.', 'error');
            }
        });
    }

    checkAuth() {
        if (this.token) {
            this.showApp();
            this.loadUserProfile();
            this.loadFiles();
            this.updateBreadcrumb();
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
        
        // Load sidebar folders on app load
        this.updateSidebarFolders();
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
                this.loadFiles(null, false); // Load files and suggested files after registration
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
                this.updateStorageInfo(user.storage_used || user.storageUsed || 0, user.storage_limit || user.storageLimit || 2147483648);
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
        console.log('Loading files for folder:', folderId);
        
        try {
            const response = await fetch(`/api/files?folderId=${folderId || ''}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            console.log('Files API response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Files data received:', data);
                console.log('Files count:', data.files?.length || 0);
                console.log('Folders count:', data.folders?.length || 0);
                
                this.renderFiles(data.files || [], data.folders || []);
                this.loadSuggestedFiles();
            } else {
                const errorData = await response.json();
                console.error('Files API error:', errorData);
                this.showNotification(errorData.error || '파일 목록을 불러오는데 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Failed to load files:', error);
            this.showNotification('파일 목록을 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadSuggestedFiles() {
        console.log('Loading suggested files...');
        
        try {
            const response = await fetch('/api/files?recent=true&limit=6', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Suggested files received:', data.files?.length || 0);
                this.renderSuggestedFiles(data.files || []);
            } else {
                console.error('Suggested files API error:', response.status);
            }
        } catch (error) {
            console.error('Failed to load suggested files:', error);
        }
    }

    renderSuggestedFiles(files) {
        console.log('Rendering suggested files:', files.length);
        
        const container = document.getElementById('suggestedFiles');
        if (!container) {
            console.error('suggestedFiles container not found');
            return;
        }
        
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = '<p>최근 파일이 없습니다.</p>';
            return;
        }

        files.forEach((file, index) => {
            console.log(`Rendering suggested file ${index + 1}:`, file.original_name || file.originalName);
            
            const fileType = this.getFileType(file.mime_type || file.mimeType);
            const icon = this.getFileIcon(fileType);
            const mimeType = file.mime_type || file.mimeType;
            const fileId = file.id || file._id;
            const isImage = mimeType && mimeType.startsWith('image/');
            const isVideo = mimeType && mimeType.startsWith('video/');
            const hasThumbnail = isImage || isVideo;
            
            const card = document.createElement('div');
            card.className = 'suggested-file';
            card.innerHTML = `
                <div class="file-icon ${fileType}" id="suggested-icon-${fileId}">
                    ${hasThumbnail ? 
                        `<img class="file-thumbnail" id="suggested-thumb-${fileId}" src="" alt="${file.original_name || file.originalName}" style="display: none;">
                         <i class="${icon}" id="suggested-fallback-${fileId}"></i>` : 
                        `<i class="${icon}"></i>`
                    }
                    ${isVideo ? '<div class="video-overlay-small"><i class="fas fa-play"></i></div>' : ''}
                </div>
                <div class="file-name">${file.original_name || file.originalName}</div>
                <div class="file-info">
                    <span>${this.formatFileSize(file.file_size || file.fileSize)}</span>
                </div>
            `;
            
            // Load thumbnail for image and video files
            if (hasThumbnail) {
                this.loadSuggestedThumbnail(fileId, file.original_name || file.originalName);
            }
            
            card.addEventListener('click', () => this.previewFile(file));
            container.appendChild(card);
        });
    }

    async loadSuggestedThumbnail(fileId, fileName) {
        try {
            const response = await fetch(`/api/files/${fileId}/thumbnail?size=150`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const thumbnail = document.getElementById(`suggested-thumb-${fileId}`);
                const fallbackIcon = document.getElementById(`suggested-fallback-${fileId}`);
                
                if (thumbnail && fallbackIcon) {
                    thumbnail.onload = () => {
                        thumbnail.style.display = 'block';
                        fallbackIcon.style.display = 'none';
                        URL.revokeObjectURL(blobUrl);
                    };
                    
                    thumbnail.onerror = () => {
                        URL.revokeObjectURL(blobUrl);
                    };
                    
                    thumbnail.src = blobUrl;
                }
            }
        } catch (error) {
            console.error('Failed to load suggested thumbnail for:', fileName, error);
        }
    }

    renderFiles(files, folders) {
        console.log('Rendering files:', files.length, 'folders:', folders.length);
        
        const fileGrid = document.getElementById('fileGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!fileGrid) {
            console.error('fileGrid element not found');
            return;
        }
        
        fileGrid.innerHTML = '';
        
        if (files.length === 0 && folders.length === 0) {
            console.log('No files or folders to display');
            if (emptyState) {
                emptyState.classList.remove('hidden');
            }
            return;
        }
        
        if (emptyState) {
            emptyState.classList.add('hidden');
        }
        
        // Render folders first
        folders.forEach((folder, index) => {
            console.log(`Rendering folder ${index + 1}:`, folder.name);
            const folderElement = this.createFolderElement(folder);
            fileGrid.appendChild(folderElement);
        });
        
        // Render files
        files.forEach((file, index) => {
            console.log(`Rendering file ${index + 1}:`, file.original_name || file.originalName);
            const fileElement = this.createFileElement(file);
            fileGrid.appendChild(fileElement);
        });
        
        // Update sidebar folder list
        this.updateSidebarFolders();
        
        console.log('Files rendered successfully');
    }

    async updateSidebarFolders() {
        try {
            // Get all folders for sidebar (not limited to current folder)
            const response = await fetch('/api/folders/all', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderSidebarFolders(data.folders || []);
            } else {
                console.error('Failed to load folders for sidebar');
            }
        } catch (error) {
            console.error('Error loading sidebar folders:', error);
        }
    }

    renderSidebarFolders(folders) {
        const folderList = document.getElementById('folderList');
        if (!folderList) {
            console.error('folderList element not found');
            return;
        }

        folderList.innerHTML = '';

        if (folders.length === 0) {
            folderList.innerHTML = '<li style="padding: 8px 20px; color: #9ca3af; font-size: 12px;">폴더가 없습니다</li>';
            return;
        }

        folders.forEach(folder => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            
            a.href = '#';
            a.className = 'nav-item';
            a.innerHTML = `<i class="fas fa-folder"></i> ${folder.name}`;
            
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.openFolder(folder.id || folder._id);
                
                // Update active state
                document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
                a.classList.add('active');
            });
            
            li.appendChild(a);
            folderList.appendChild(li);
        });

        console.log(`Sidebar folders updated: ${folders.length} folders`);
    }

    createFolderElement(folder) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'folder';
        div.dataset.id = folder.id || folder._id;
        
        div.innerHTML = `
            <div class="file-icon folder">
                <i class="fas fa-folder"></i>
            </div>
            <div class="file-name">${folder.name}</div>
            <div class="file-info">
                <span>폴더</span>
                <span>${new Date(folder.created_at || folder.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="file-actions">
                <button class="file-action open-btn" data-folder-id="${folder.id || folder._id}">
                    <i class="fas fa-folder-open"></i>
                </button>
                <button class="file-action delete-btn" data-folder-id="${folder.id || folder._id}">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="file-action context-btn" data-folder-id="${folder.id || folder._id}" data-type="folder">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const openBtn = div.querySelector('.open-btn');
        const deleteBtn = div.querySelector('.delete-btn');
        const contextBtn = div.querySelector('.context-btn');
        
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openFolder(folder.id || folder._id);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteFolder(folder.id || folder._id);
        });
        
        contextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showContextMenu(e, folder, 'folder');
        });
        
        div.addEventListener('dblclick', () => this.openFolder(folder.id || folder._id));
        
        return div;
    }

    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'file';
        div.dataset.id = file.id || file._id;
        
        const fileType = this.getFileType(file.mime_type || file.mimeType);
        const icon = this.getFileIcon(fileType);
        const mimeType = file.mime_type || file.mimeType;
        const fileId = file.id || file._id;
        const isFavorite = file.isFavorite || false;
        
        // Check if file is an image or video to show thumbnail
        const isImage = mimeType && mimeType.startsWith('image/');
        const isVideo = mimeType && mimeType.startsWith('video/');
        const hasThumbnail = isImage || isVideo;
        
        div.innerHTML = `
            <div class="file-icon ${fileType}" id="icon-${fileId}">
                ${hasThumbnail ? 
                    `<img class="file-thumbnail" id="thumb-${fileId}" src="" alt="${file.original_name || file.originalName}" style="display: none;">
                     <i class="${icon}" id="fallback-${fileId}"></i>` : 
                    `<i class="${icon}"></i>`
                }
                ${isVideo ? '<div class="video-overlay"><i class="fas fa-play"></i></div>' : ''}
            </div>
            <div class="file-name">${file.original_name || file.originalName}</div>
            <div class="file-info">
                <span>${this.formatFileSize(file.file_size || file.fileSize)}</span>
                <span>${new Date(file.created_at || file.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="file-actions">
                <button class="file-action favorite-btn ${isFavorite ? 'active' : ''}" data-file-id="${fileId}" title="${isFavorite ? '즐겨찾기 제거' : '즐겨찾기 추가'}">
                    <i class="fas fa-heart"></i>
                </button>
                <button class="file-action share-btn" data-file-id="${fileId}" title="공유">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="file-action download-btn" data-file-id="${fileId}">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action delete-btn" data-file-id="${fileId}">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="file-action context-btn" data-file-id="${fileId}" data-type="file">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
        
        // Load thumbnail for image and video files
        if (hasThumbnail) {
            this.loadThumbnail(fileId, file.original_name || file.originalName);
        }
        
        // Add event listeners
        const favoriteBtn = div.querySelector('.favorite-btn');
        const shareBtn = div.querySelector('.share-btn');
        const downloadBtn = div.querySelector('.download-btn');
        const deleteBtn = div.querySelector('.delete-btn');
        const contextBtn = div.querySelector('.context-btn');
        
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite(fileId, isFavorite);
        });
        
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showShareModal(file);
        });
        
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadFile(fileId);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteFile(fileId);
        });
        
        contextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showContextMenu(e, file, 'file');
        });
        
        div.addEventListener('dblclick', () => this.previewFile(file));
        div.addEventListener('click', (e) => this.handleFileClick(e, fileId));
        
        return div;
    }

    async loadThumbnail(fileId, fileName) {
        try {
            const response = await fetch(`/api/files/${fileId}/thumbnail?size=200`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const thumbnail = document.getElementById(`thumb-${fileId}`);
                const fallbackIcon = document.getElementById(`fallback-${fileId}`);
                
                if (thumbnail && fallbackIcon) {
                    thumbnail.onload = () => {
                        thumbnail.style.display = 'block';
                        fallbackIcon.style.display = 'none';
                        URL.revokeObjectURL(blobUrl); // Clean up blob URL after loading
                    };
                    
                    thumbnail.onerror = () => {
                        // If thumbnail fails to load, keep the fallback icon
                        URL.revokeObjectURL(blobUrl);
                    };
                    
                    thumbnail.src = blobUrl;
                }
            }
        } catch (error) {
            console.error('Failed to load thumbnail for:', fileName, error);
            // Fallback icon will remain visible
        }
    }

    getFileType(mimeType) {
        if (!mimeType) return 'default';
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
            const fileId = item.dataset.id;
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
                    this.loadUserProfile();
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
                a.download = '';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                this.showNotification('파일 다운로드를 시작했습니다.', 'success');
            }
        } catch (error) {
            this.showNotification('다운로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async deleteFile(fileId) {
        if (!fileId) {
            this.showNotification('파일 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 파일을 삭제하시겠습니까?')) {
            return;
        }

        try {
            this.showNotification('파일을 삭제하는 중...', 'info');
            
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadFiles(this.currentFolderId);
                this.loadUserProfile();
                this.showNotification('파일이 성공적으로 삭제되었습니다.', 'success');
            } else {
                const data = await response.json();
                this.showNotification(data.error || '파일 삭제에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('파일 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    async deleteFolder(folderId) {
        if (!folderId) {
            this.showNotification('폴더 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 폴더를 삭제하시겠습니까? 폴더 내의 모든 파일도 삭제됩니다.')) {
            return;
        }

        try {
            this.showNotification('폴더를 삭제하는 중...', 'info');
            
            const response = await fetch(`/api/folders/${folderId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadFiles(this.currentFolderId);
                this.loadUserProfile();
                this.showNotification('폴더가 성공적으로 삭제되었습니다.', 'success');
                
                // Update sidebar folders
                this.updateSidebarFolders();
            } else {
                const data = await response.json();
                this.showNotification(data.error || '폴더 삭제에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Delete folder error:', error);
            this.showNotification('폴더 삭제 중 오류가 발생했습니다.', 'error');
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
                
                // Update sidebar folders
                this.updateSidebarFolders();
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
        console.log('Opening folder:', folderId);
        this.currentFolderId = folderId;
        this.loadFiles(folderId);
        this.updateBreadcrumb();
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `
                <a href="#" class="breadcrumb-item home-btn">
                    <i class="fas fa-home"></i> 홈
                </a>
            `;
            
            // Add event listener for home button
            const homeBtn = breadcrumb.querySelector('.home-btn');
            if (homeBtn) {
                homeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.goHome();
                });
            }
        }
    }

    goHome() {
        console.log('Going home - switching to all files view');
        
        // Reset current folder ID
        this.currentFolderId = null;
        
        // Switch to Files tab
        this.switchTab('files');
        
        // Load all files
        this.loadFiles(null);
        
        // Update breadcrumb
        this.updateBreadcrumb();
        
        // Show notification
        this.showNotification('홈으로 이동했습니다.', 'info');
    }

    setView(view) {
        this.currentView = view;
        const fileGrid = document.getElementById('fileGrid');
        const gridBtns = document.querySelectorAll('.view-btn');
        
        gridBtns.forEach(btn => btn.classList.remove('active'));
        
        if (view === 'grid') {
            fileGrid.classList.remove('list-view');
            document.querySelector('[data-view="grid"]').classList.add('active');
        } else {
            fileGrid.classList.add('list-view');
            document.querySelector('[data-view="list"]').classList.add('active');
        }
    }

    switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Reset current folder when switching to non-files tabs
        if (tabName !== 'files') {
            this.currentFolderId = null;
        }
        
        // Load different content based on tab
        switch(tabName) {
            case 'files':
                // Load suggested files only if we're at the root level (no specific folder selected)
                this.loadFiles(this.currentFolderId, this.currentFolderId !== null);
                break;
            case 'photos':
                this.loadPhotos();
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
        
        // Update breadcrumb
        this.updateBreadcrumb();
    }

    switchFilesTab(filter) {
        document.querySelectorAll('.files-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        // Load filtered content
        if (filter === 'recent') {
            this.loadFiles(this.currentFolderId);
        } else if (filter === 'starred') {
            this.loadFavorites();
        }
    }

    async loadPhotos() {
        try {
            const response = await fetch('/api/files?type=image', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderFiles(data.files || [], []);
            }
        } catch (error) {
            this.showNotification('사진 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadSharedFiles() {
        try {
            const response = await fetch('/api/shared', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('공유된 파일 로드:', data.files?.length || 0);
                this.renderFiles(data.files || [], []);
                
                if (data.files && data.files.length > 0) {
                    this.showNotification(`${data.files.length}개의 공유된 파일을 불러왔습니다.`, 'info');
                } else {
                    this.showNotification('공유된 파일이 없습니다.', 'info');
                }
            } else {
                const data = await response.json();
                this.showNotification(data.error || '공유된 파일 목록을 불러오는데 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Load shared files error:', error);
            this.showNotification('공유된 파일 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadRecentFiles() {
        try {
            const response = await fetch('/api/files?recent=true', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderFiles(data.files || [], []);
            }
        } catch (error) {
            this.showNotification('최근 파일 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadFavorites() {
        try {
            const response = await fetch('/api/favorites', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('즐겨찾기 파일 로드:', data.files?.length || 0);
                this.renderFiles(data.files || [], []);
                
                if (data.files && data.files.length > 0) {
                    this.showNotification(`${data.files.length}개의 즐겨찾기 파일을 불러왔습니다.`, 'info');
                } else {
                    this.showNotification('즐겨찾기한 파일이 없습니다.', 'info');
                }
            } else {
                const data = await response.json();
                this.showNotification(data.error || '즐겨찾기 목록을 불러오는데 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Load favorites error:', error);
            this.showNotification('즐겨찾기 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    async loadTrash() {
        try {
            const response = await fetch('/api/trash', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderTrashFiles(data.files || [], data.folders || []);
                this.showNotification('휴지통을 불러왔습니다.', 'info');
            } else {
                this.showNotification('휴지통을 불러오는데 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Load trash error:', error);
            this.showNotification('휴지통 로드 중 오류가 발생했습니다.', 'error');
        }
    }

    renderTrashFiles(files, folders) {
        console.log('Rendering trash files:', files.length, 'folders:', folders.length);
        
        const fileGrid = document.getElementById('fileGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!fileGrid) {
            console.error('fileGrid element not found');
            return;
        }
        
        fileGrid.innerHTML = '';
        
        if (files.length === 0 && folders.length === 0) {
            console.log('No deleted files or folders');
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.innerHTML = '<p>휴지통이 비어있습니다.</p>';
            }
            return;
        }
        
        if (emptyState) {
            emptyState.classList.add('hidden');
        }
        
        // Render deleted folders first
        folders.forEach((folder, index) => {
            console.log(`Rendering deleted folder ${index + 1}:`, folder.name);
            const folderElement = this.createTrashFolderElement(folder);
            fileGrid.appendChild(folderElement);
        });
        
        // Render deleted files
        files.forEach((file, index) => {
            console.log(`Rendering deleted file ${index + 1}:`, file.original_name || file.originalName);
            const fileElement = this.createTrashFileElement(file);
            fileGrid.appendChild(fileElement);
        });
        
        console.log('Trash files rendered successfully');
    }

    createTrashFolderElement(folder) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'folder';
        div.dataset.id = folder.id || folder._id;
        
        const deletedDate = new Date(folder.updatedAt).toLocaleDateString();
        
        div.innerHTML = `
            <div class="file-icon folder">
                <i class="fas fa-folder"></i>
            </div>
            <div class="file-name">${folder.name}</div>
            <div class="file-info">
                <span>폴더 - 삭제됨</span>
                <span>${deletedDate}</span>
            </div>
            <div class="file-actions">
                <button class="file-action restore-btn" data-folder-id="${folder.id || folder._id}" title="복구">
                    <i class="fas fa-undo"></i>
                </button>
                <button class="file-action permanent-delete-btn" data-folder-id="${folder.id || folder._id}" title="완전삭제">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const restoreBtn = div.querySelector('.restore-btn');
        const permanentDeleteBtn = div.querySelector('.permanent-delete-btn');
        
        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.restoreFolder(folder.id || folder._id);
        });
        
        permanentDeleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.permanentDeleteFolder(folder.id || folder._id);
        });
        
        return div;
    }

    createTrashFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = 'file';
        div.dataset.id = file.id || file._id;
        
        const fileType = this.getFileType(file.mime_type || file.mimeType);
        const icon = this.getFileIcon(fileType);
        const deletedDate = new Date(file.updatedAt).toLocaleDateString();
        
        div.innerHTML = `
            <div class="file-icon ${fileType}">
                ${icon}
            </div>
            <div class="file-name">${file.original_name || file.originalName}</div>
            <div class="file-info">
                <span>${this.formatFileSize(file.file_size || file.fileSize)} - 삭제됨</span>
                <span>${deletedDate}</span>
            </div>
            <div class="file-actions">
                <button class="file-action restore-btn" data-file-id="${file.id || file._id}" title="복구">
                    <i class="fas fa-undo"></i>
                </button>
                <button class="file-action permanent-delete-btn" data-file-id="${file.id || file._id}" title="완전삭제">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const restoreBtn = div.querySelector('.restore-btn');
        const permanentDeleteBtn = div.querySelector('.permanent-delete-btn');
        
        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.restoreFile(file.id || file._id);
        });
        
        permanentDeleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.permanentDeleteFile(file.id || file._id);
        });
        
        return div;
    }

    async restoreFile(fileId) {
        if (!fileId) {
            this.showNotification('파일 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 파일을 복구하시겠습니까?')) {
            return;
        }

        try {
            this.showNotification('파일을 복구하는 중...', 'info');
            
            const response = await fetch(`/api/trash/files/${fileId}/restore`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ 파일 복구 완료:', data);
                
                // 먼저 휴지통을 새로고침하여 복구된 파일을 제거
                this.loadTrash();
                
                // 잠시 후 모든 파일 탭으로 이동
                setTimeout(() => {
                    this.switchTab('files');
                    this.loadUserProfile(); // 저장공간 업데이트
                    this.showNotification('파일이 성공적으로 복구되었습니다. 모든 파일 탭에서 확인하세요.', 'success');
                }, 500);
            } else {
                const data = await response.json();
                this.showNotification(data.error || '파일 복구에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Restore file error:', error);
            this.showNotification('파일 복구 중 오류가 발생했습니다.', 'error');
        }
    }

    async restoreFolder(folderId) {
        if (!folderId) {
            this.showNotification('폴더 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 폴더를 복구하시겠습니까? 폴더 내의 모든 파일도 함께 복구됩니다.')) {
            return;
        }

        try {
            this.showNotification('폴더를 복구하는 중...', 'info');
            
            const response = await fetch(`/api/trash/folders/${folderId}/restore`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ 폴더 복구 완료:', data);
                
                // 먼저 휴지통을 새로고침하여 복구된 폴더를 제거
                this.loadTrash();
                
                // 잠시 후 모든 파일 탭으로 이동
                setTimeout(() => {
                    this.switchTab('files');
                    this.loadUserProfile(); // 저장공간 업데이트
                    this.showNotification('폴더가 성공적으로 복구되었습니다. 모든 파일 탭에서 확인하세요.', 'success');
                }, 500);
            } else {
                const data = await response.json();
                this.showNotification(data.error || '폴더 복구에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Restore folder error:', error);
            this.showNotification('폴더 복구 중 오류가 발생했습니다.', 'error');
        }
    }

    async permanentDeleteFile(fileId) {
        if (!fileId) {
            this.showNotification('파일 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 파일을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        try {
            this.showNotification('파일을 완전히 삭제하는 중...', 'info');
            
            const response = await fetch(`/api/trash/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadTrash(); // 휴지통 다시 로드
                this.showNotification('파일이 완전히 삭제되었습니다.', 'success');
            } else {
                const data = await response.json();
                this.showNotification(data.error || '파일 완전 삭제에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Permanent delete file error:', error);
            this.showNotification('파일 완전 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    async permanentDeleteFolder(folderId) {
        if (!folderId) {
            this.showNotification('폴더 ID가 없습니다.', 'error');
            return;
        }

        if (!confirm('이 폴더를 완전히 삭제하시겠습니까? 폴더 내의 모든 파일도 완전히 삭제되며 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        try {
            this.showNotification('폴더를 완전히 삭제하는 중...', 'info');
            
            const response = await fetch(`/api/trash/folders/${folderId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadTrash(); // 휴지통 다시 로드
                this.showNotification('폴더가 완전히 삭제되었습니다.', 'success');
            } else {
                const data = await response.json();
                this.showNotification(data.error || '폴더 완전 삭제에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Permanent delete folder error:', error);
            this.showNotification('폴더 완전 삭제 중 오류가 발생했습니다.', 'error');
        }
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
                this.renderFiles(data.files || [], data.folders || []);
                this.showNotification(`"${query}"에 대한 검색 결과입니다.`, 'info');
            }
        } catch (error) {
            this.showNotification('검색 중 오류가 발생했습니다.', 'error');
        }
    }

    showContextMenu(e, item, type) {
        e.preventDefault();
        e.stopPropagation();
        
        // 현재 대상 항목 저장
        this.contextTarget = item;
        this.contextType = type;
        
        // 컨텍스트 메뉴 표시
        const contextMenu = document.getElementById('contextMenu');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 마우스 위치에서 메뉴 표시
        let x = e.pageX;
        let y = e.pageY;
        
        // 화면 밖으로 나가지 않도록 조정
        if (x + 200 > viewportWidth) {
            x = viewportWidth - 200;
        }
        if (y + 250 > viewportHeight) {
            y = viewportHeight - 250;
        }
        
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.remove('hidden');
        
        // 타입에 따라 메뉴 항목 표시/숨김
        const downloadItem = contextMenu.querySelector('[data-action="download"]');
        const shareItem = contextMenu.querySelector('[data-action="share"]');
        const favoriteItem = contextMenu.querySelector('[data-action="favorite"]');
        const renameItem = contextMenu.querySelector('[data-action="rename"]');
        const deleteItem = contextMenu.querySelector('[data-action="delete"]');
        
        if (type === 'folder') {
            // 폴더인 경우 다운로드, 공유, 즐겨찾기 숨김
            downloadItem.style.display = 'none';
            shareItem.style.display = 'none';
            favoriteItem.style.display = 'none';
            renameItem.style.display = 'block';
            deleteItem.style.display = 'block';
            deleteItem.innerHTML = '<i class="fas fa-trash"></i> 폴더 삭제';
        } else {
            // 파일인 경우 모든 항목 표시
            downloadItem.style.display = 'block';
            shareItem.style.display = 'block';
            favoriteItem.style.display = 'block';
            renameItem.style.display = 'block';
            deleteItem.style.display = 'block';
            deleteItem.innerHTML = '<i class="fas fa-trash"></i> 삭제';
            
            // 즐겨찾기 상태에 따라 텍스트 변경
            if (item && item.isFavorite) {
                favoriteItem.innerHTML = '<i class="fas fa-heart"></i> 즐겨찾기 제거';
            } else {
                favoriteItem.innerHTML = '<i class="fas fa-heart"></i> 즐겨찾기 추가';
            }
        }
        
        console.log('Context menu shown for:', type, item?.name || item?.originalName || item?.original_name);
    }

    handleContextAction(action) {
        if (!this.contextTarget) {
            console.log('No context target');
            return;
        }
        
        const item = this.contextTarget;
        const type = this.contextType;
        const itemId = item.id || item._id;
        
        console.log('Context action:', action, 'for', type, ':', item.name || item.originalName || item.original_name);
        
        // 컨텍스트 메뉴 숨기기
        this.hideContextMenu();
        
        // 타입에 따른 액션 처리
        if (type === 'folder') {
            switch (action) {
                case 'rename':
                    this.showRenameFolderModal(item);
                    break;
                case 'delete':
                    this.deleteFolder(itemId);
                    break;
                default:
                    console.log('Unsupported action for folder:', action);
            }
        } else {
            // 파일에 대한 액션 처리
            switch (action) {
                case 'download':
                    this.downloadFile(itemId);
                    break;
                case 'share':
                    this.showShareModal(item);
                    break;
                case 'favorite':
                    this.toggleFavorite(itemId, item.isFavorite);
                    break;
                case 'rename':
                    this.showRenameModal(item);
                    break;
                case 'delete':
                    this.deleteFile(itemId);
                    break;
                default:
                    console.log('Unknown action:', action);
            }
        }
    }

    hideContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.classList.add('hidden');
        this.contextTarget = null;
        this.contextType = null;
    }

    showRenameModal(file) {
        const modal = document.getElementById('renameModal');
        const title = document.getElementById('renameModalTitle');
        const label = document.getElementById('renameLabel');
        const input = document.getElementById('renameInput');
        
        // 현재 이름 변경 대상 저장
        this.renameTarget = file;
        this.renameType = 'file';
        
        // 모달 내용 설정
        title.textContent = '파일 이름 변경';
        label.textContent = '새 파일 이름';
        
        // 현재 파일 이름에서 확장자 제거하여 입력창에 설정
        const currentName = file.original_name || file.originalName;
        const nameWithoutExt = currentName.includes('.') ? 
            currentName.substring(0, currentName.lastIndexOf('.')) : currentName;
        
        input.value = nameWithoutExt;
        input.placeholder = '새 파일 이름을 입력하세요';
        
        this.showModal('renameModal');
        
        // 입력창에 포커스 및 텍스트 선택
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    }

    showRenameFolderModal(folder) {
        const modal = document.getElementById('renameModal');
        const title = document.getElementById('renameModalTitle');
        const label = document.getElementById('renameLabel');
        const input = document.getElementById('renameInput');
        
        // 현재 이름 변경 대상 저장
        this.renameTarget = folder;
        this.renameType = 'folder';
        
        // 모달 내용 설정
        title.textContent = '폴더 이름 변경';
        label.textContent = '새 폴더 이름';
        
        input.value = folder.name;
        input.placeholder = '새 폴더 이름을 입력하세요';
        
        this.showModal('renameModal');
        
        // 입력창에 포커스 및 텍스트 선택
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    }

    handleContextMenu(e) {
        // 우클릭 메뉴는 비활성화 (점 3개 클릭으로만 사용)
        e.preventDefault();
        return false;
    }

    handleKeyboard(e) {
        // ESC key to close modals
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                this.closeModal(activeModal.id);
                return;
            }
            
            // If no modal is open, hide context menu
            this.hideContextMenu();
            return;
        }

        // Other keyboard shortcuts only work when no modal is open
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) return;

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

    toggleSelectAll() {
        const allItems = document.querySelectorAll('.file-item');
        if (this.selectedFiles.size === allItems.length) {
            this.selectedFiles.clear();
        } else {
            this.selectedFiles.clear();
            allItems.forEach(item => {
                this.selectedFiles.add(item.dataset.id);
            });
        }
        this.updateFileSelection();
    }

    async previewFile(file) {
        const modal = document.getElementById('previewModal');
        const title = document.getElementById('previewTitle');
        const content = document.getElementById('previewContent');
        
        title.textContent = file.original_name || file.originalName;
        
        const mimeType = file.mime_type || file.mimeType;
        const fileId = file.id || file._id;
        const fileName = file.original_name || file.originalName;
        const fileExt = fileName.split('.').pop().toLowerCase();
        
        // Show loading
        content.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner"></div>
                <p>파일을 불러오는 중...</p>
            </div>
        `;
        
        this.showModal('previewModal');

        try {
            // Create blob URL for authenticated access
            const createBlobUrl = async () => {
                try {
                    const response = await fetch(`/api/files/${fileId}/preview`, {
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const blob = await response.blob();
                    return URL.createObjectURL(blob);
                } catch (error) {
                    console.error('Error creating blob URL:', error);
                    throw error;
                }
            };

            if (mimeType && mimeType.startsWith('image/')) {
                // Image files
                console.log('Loading image preview for:', fileName);
                console.log('MIME type:', mimeType);
                console.log('File ID:', fileId);
                
                try {
                    const blobUrl = await createBlobUrl();
                    console.log('Blob URL created successfully:', blobUrl);
                    
                    // Create image element with detailed error handling
                    const imageContainer = document.createElement('div');
                    imageContainer.style.textAlign = 'center';
                    
                    const img = document.createElement('img');
                    img.id = `preview-image-${fileId}`;
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '70vh';
                    img.style.objectFit = 'contain';
                    img.style.opacity = '0';
                    img.style.transition = 'opacity 0.3s';
                    img.alt = fileName;
                    
                    // Add comprehensive event listeners
                    img.onload = () => {
                        console.log('✅ Image loaded successfully:', fileName);
                        console.log('Image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
                        img.style.opacity = '1';
                        URL.revokeObjectURL(blobUrl);
                    };
                    
                    img.onerror = (error) => {
                        console.error('❌ Image failed to load:', error);
                        console.error('Blob URL was:', blobUrl);
                        
                        // Try alternative method: direct API call
                        console.log('Trying alternative method...');
                        this.loadImageAlternative(fileId, fileName, imageContainer);
                        URL.revokeObjectURL(blobUrl);
                    };
                    
                    // Monitor loading progress
                    img.onloadstart = () => console.log('🔄 Image loading started');
                    img.onprogress = () => console.log('📊 Image loading in progress');
                    
                    imageContainer.appendChild(img);
                    content.innerHTML = '';
                    content.appendChild(imageContainer);
                    
                    // Start loading
                    console.log('Setting image src to blob URL...');
                    img.src = blobUrl;
                    
                } catch (error) {
                    console.error('Failed to create blob URL for image:', error);
                    // Try alternative method
                    this.loadImageAlternative(fileId, fileName, content);
                }
                
            } else if (mimeType && mimeType.startsWith('video/')) {
                // Video files
                const blobUrl = await createBlobUrl();
                content.innerHTML = `
                    <div style="text-align: center;">
                        <video controls style="max-width: 100%; max-height: 70vh;" preload="metadata">
                            <source src="${blobUrl}" type="${mimeType}">
                            브라우저가 비디오 재생을 지원하지 않습니다.
                        </video>
                    </div>
                `;
                
            } else if (mimeType && mimeType.startsWith('audio/')) {
                // Audio files
                const blobUrl = await createBlobUrl();
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="margin-bottom: 20px;">
                            <i class="fas fa-music" style="font-size: 4rem; color: #0061ff; margin-bottom: 20px;"></i>
                            <h3>${fileName}</h3>
                        </div>
                        <audio controls style="width: 100%; max-width: 400px;" preload="metadata">
                            <source src="${blobUrl}" type="${mimeType}">
                            브라우저가 오디오 재생을 지원하지 않습니다.
                        </audio>
                    </div>
                `;
                
            } else if (mimeType === 'application/pdf' || fileExt === 'pdf') {
                // PDF files
                const blobUrl = await createBlobUrl();
                content.innerHTML = `
                    <div style="text-align: center;">
                        <iframe src="${blobUrl}" 
                                style="width: 100%; height: 70vh; border: none;"
                                title="PDF 미리보기">
                        </iframe>
                    </div>
                `;
                
            } else if (mimeType && (mimeType.startsWith('text/') || 
                       ['js', 'html', 'css', 'json', 'xml', 'md', 'txt', 'csv', 'log'].includes(fileExt))) {
                // Text and code files
                try {
                    const response = await fetch(`/api/files/${fileId}/preview`, {
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });
                    
                    if (response.ok) {
                        const textContent = await response.text();
                        const language = this.getLanguageFromExtension(fileExt);
                        
                        content.innerHTML = `
                            <div style="text-align: left;">
                                <div style="background-color: #f8f9fa; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                                    ${fileName} (${language})
                                </div>
                                <pre style="background-color: #f8f9fa; padding: 20px; margin: 0; overflow: auto; max-height: 60vh; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;"><code>${this.escapeHtml(textContent)}</code></pre>
                            </div>
                        `;
                    } else {
                        throw new Error('텍스트 파일을 불러올 수 없습니다.');
                    }
                } catch (error) {
                    content.innerHTML = this.getUnsupportedFileContent(fileName, fileId, '텍스트 파일을 미리보는 중 오류가 발생했습니다.');
                }
                
            } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
                // Microsoft Office files
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-file-alt" style="font-size: 4rem; color: #0061ff; margin-bottom: 20px;"></i>
                        <h3>${fileName}</h3>
                        <p style="margin: 20px 0; color: #6b7280;">Microsoft Office 문서는 미리보기를 지원하지 않습니다.</p>
                        <p style="margin-bottom: 20px; color: #6b7280;">파일을 다운로드하여 확인하세요.</p>
                        <button class="btn btn-primary modal-download-btn" data-file-id="${fileId}">
                            <i class="fas fa-download"></i> 다운로드
                        </button>
                    </div>
                `;
                
                // Add event listener
                setTimeout(() => {
                    const downloadBtn = content.querySelector('.modal-download-btn');
                    if (downloadBtn) {
                        downloadBtn.addEventListener('click', () => this.downloadFile(fileId));
                    }
                }, 0);
                
            } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExt)) {
                // Archive files
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-file-archive" style="font-size: 4rem; color: #9333ea; margin-bottom: 20px;"></i>
                        <h3>${fileName}</h3>
                        <p style="margin: 20px 0; color: #6b7280;">압축 파일은 미리보기를 지원하지 않습니다.</p>
                        <p style="margin-bottom: 20px; color: #6b7280;">파일을 다운로드하여 압축을 해제하세요.</p>
                        <button class="btn btn-primary modal-download-btn" data-file-id="${fileId}">
                            <i class="fas fa-download"></i> 다운로드
                        </button>
                    </div>
                `;
                
                // Add event listener
                setTimeout(() => {
                    const downloadBtn = content.querySelector('.modal-download-btn');
                    if (downloadBtn) {
                        downloadBtn.addEventListener('click', () => this.downloadFile(fileId));
                    }
                }, 0);
                
            } else {
                // Unsupported files
                content.innerHTML = this.getUnsupportedFileContent(fileName, fileId);
            }
            
        } catch (error) {
            console.error('Preview error:', error);
            content.innerHTML = this.getUnsupportedFileContent(fileName, fileId, '파일 미리보기 중 오류가 발생했습니다.');
        }
    }

    getLanguageFromExtension(ext) {
        const languages = {
            'js': 'JavaScript',
            'ts': 'TypeScript',
            'html': 'HTML',
            'css': 'CSS',
            'json': 'JSON',
            'xml': 'XML',
            'md': 'Markdown',
            'txt': 'Plain Text',
            'csv': 'CSV',
            'log': 'Log File',
            'py': 'Python',
            'java': 'Java',
            'cpp': 'C++',
            'c': 'C',
            'php': 'PHP',
            'rb': 'Ruby',
            'go': 'Go',
            'sql': 'SQL',
            'sh': 'Shell Script',
            'yml': 'YAML',
            'yaml': 'YAML'
        };
        
        return languages[ext] || 'Text File';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getUnsupportedFileContent(fileName, fileId, customMessage = null) {
        const content = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-file" style="font-size: 4rem; color: #ccc; margin-bottom: 20px;"></i>
                <h3>${fileName}</h3>
                <p style="margin: 20px 0; color: #6b7280;">
                    ${customMessage || '이 파일 형식은 미리보기를 지원하지 않습니다.'}
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="btn btn-primary modal-download-btn" data-file-id="${fileId}">
                        <i class="fas fa-download"></i> 다운로드
                    </button>
                    <button class="btn btn-secondary modal-close-btn">
                        <i class="fas fa-times"></i> 닫기
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners after content is inserted
        setTimeout(() => {
            const downloadBtn = document.querySelector('.modal-download-btn');
            const closeBtn = document.querySelector('.modal-close-btn');
            
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => this.downloadFile(fileId));
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal('previewModal'));
            }
        }, 0);
        
        return content;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            // Close any other open modals first
            document.querySelectorAll('.modal.active').forEach(m => {
                m.classList.remove('active');
            });
            
            modal.classList.add('active');
            console.log(`Modal opened: ${modalId}`);
            
            // Focus on the modal for accessibility
            modal.focus();
        } else {
            console.error(`Modal not found: ${modalId}`);
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            console.log(`Modal closed: ${modalId}`);
            
            // Clear any form data if it's a form modal
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
            }
        } else {
            console.error(`Modal not found: ${modalId}`);
        }
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

    async loadImageAlternative(fileId, fileName, targetElement) {
        try {
            console.log('📞 Loading image using alternative method...');
            
            const response = await fetch(`/api/files/${fileId}/preview`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const img = document.createElement('img');
                img.id = `preview-image-alt-${fileId}`;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '70vh';
                img.style.objectFit = 'contain';
                img.style.opacity = '0';
                img.style.transition = 'opacity 0.3s';
                img.alt = fileName;
                
                img.onload = () => {
                    console.log('✅ Alternative image loaded successfully:', fileName);
                    console.log('Image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
                    img.style.opacity = '1';
                    URL.revokeObjectURL(blobUrl);
                };
                
                img.onerror = (error) => {
                    console.error('❌ Alternative image also failed to load:', error);
                    URL.revokeObjectURL(blobUrl);
                    
                    // Show error message as last resort
                    targetElement.innerHTML = `
                        <div style="text-align: center; padding: 40px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #f59e0b; margin-bottom: 20px;"></i>
                            <h3>${fileName}</h3>
                            <p style="margin: 20px 0; color: #6b7280;">이미지를 불러올 수 없습니다.</p>
                            <p style="margin-bottom: 20px; color: #6b7280;">파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.</p>
                            <div style="display: flex; gap: 12px; justify-content: center;">
                                <button class="btn btn-primary" onclick="window.app.downloadFile('${fileId}')">
                                    <i class="fas fa-download"></i> 다운로드
                                </button>
                                <button class="btn btn-secondary" onclick="window.app.closeModal('previewModal')">
                                    <i class="fas fa-times"></i> 닫기
                                </button>
                            </div>
                        </div>
                    `;
                };
                
                targetElement.innerHTML = '';
                targetElement.appendChild(img);
                
                // Start loading
                console.log('Setting alternative image src to blob URL...');
                img.src = blobUrl;
                
            } else {
                console.error('Failed to fetch image data:', response.status);
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('Alternative image loading failed:', error);
            targetElement.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #f59e0b; margin-bottom: 20px;"></i>
                    <h3>${fileName}</h3>
                    <p style="margin: 20px 0; color: #6b7280;">이미지를 불러오는 중 오류가 발생했습니다.</p>
                    <p style="margin-bottom: 20px; color: #6b7280;">네트워크 연결을 확인하거나 나중에 다시 시도해주세요.</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button class="btn btn-primary" onclick="window.app.downloadFile('${fileId}')">
                            <i class="fas fa-download"></i> 다운로드
                        </button>
                        <button class="btn btn-secondary" onclick="window.app.closeModal('previewModal')">
                            <i class="fas fa-times"></i> 닫기
                        </button>
                    </div>
                </div>
            `;
        }
    }

    async toggleFavorite(fileId, currentFavoriteStatus) {
        if (!fileId) {
            this.showNotification('파일 ID가 없습니다.', 'error');
            return;
        }

        try {
            this.showNotification('즐겨찾기를 변경하는 중...', 'info');
            
            const response = await fetch(`/api/files/${fileId}/favorite`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ 즐겨찾기 변경 완료:', data);
                
                // UI 업데이트
                this.updateFavoriteButton(fileId, data.isFavorite);
                
                this.showNotification(data.message, 'success');
                
                // 현재 즐겨찾기 탭에 있다면 목록 새로고침
                const activeTab = document.querySelector('.nav-item.active');
                if (activeTab && activeTab.dataset.tab === 'favorites') {
                    this.loadFavorites();
                }
            } else {
                const data = await response.json();
                this.showNotification(data.error || '즐겨찾기 변경에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Toggle favorite error:', error);
            this.showNotification('즐겨찾기 변경 중 오류가 발생했습니다.', 'error');
        }
    }

    updateFavoriteButton(fileId, isFavorite) {
        const favoriteBtn = document.querySelector(`[data-file-id="${fileId}"].favorite-btn`);
        if (favoriteBtn) {
            if (isFavorite) {
                favoriteBtn.classList.add('active');
                favoriteBtn.title = '즐겨찾기 제거';
            } else {
                favoriteBtn.classList.remove('active');
                favoriteBtn.title = '즐겨찾기 추가';
            }
        }
    }

    async showShareModal(file) {
        // 모달 열기
        this.showModal('shareModal');
        
        // 현재 공유 중인 파일 정보 저장
        this.currentShareFile = file;
        
        // 파일 정보 표시
        const fileIcon = document.querySelector('.share-file-icon');
        const fileName = document.querySelector('.share-file-name');
        const fileSize = document.querySelector('.share-file-size');
        
        // 파일 아이콘 설정
        const fileType = this.getFileType(file.mime_type || file.mimeType);
        const icon = this.getFileIcon(fileType);
        
        // 썸네일 또는 아이콘 표시
        if (fileType === 'image' || fileType === 'video') {
            // 이미지나 비디오의 경우 썸네일 로드
            fileIcon.innerHTML = `
                <div class="file-thumbnail">
                    <img src="" alt="썸네일" class="thumbnail-image" />
                    <div class="thumbnail-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                </div>
            `;
            
            // 썸네일 로드
            const thumbnailImg = fileIcon.querySelector('.thumbnail-image');
            const thumbnailLoading = fileIcon.querySelector('.thumbnail-loading');
            
            try {
                const fileId = file.id || file._id;
                const response = await fetch(`/api/files/${fileId}/thumbnail?size=200`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const thumbnailUrl = URL.createObjectURL(blob);
                    
                    thumbnailImg.onload = () => {
                        thumbnailLoading.style.display = 'none';
                        thumbnailImg.style.display = 'block';
                    };
                    
                    thumbnailImg.onerror = () => {
                        // 썸네일 로드 실패 시 아이콘으로 대체
                        fileIcon.innerHTML = `<i class="${icon}"></i>`;
                    };
                    
                    thumbnailImg.src = thumbnailUrl;
                } else {
                    // 썸네일 로드 실패 시 아이콘으로 대체
                    fileIcon.innerHTML = `<i class="${icon}"></i>`;
                }
            } catch (error) {
                console.error('Error loading thumbnail:', error);
                // 에러 발생 시 아이콘으로 대체
                fileIcon.innerHTML = `<i class="${icon}"></i>`;
            }
        } else {
            // 기타 파일 형식의 경우 아이콘 표시
            fileIcon.innerHTML = `<i class="${icon}"></i>`;
        }
        
        // 파일 정보 설정
        fileName.textContent = file.original_name || file.originalName;
        fileSize.textContent = this.formatFileSize(file.file_size || file.fileSize);
        
        // 공유 상태 확인 및 UI 업데이트
        const isShared = file.isShared;
        const createBtn = document.getElementById('createShareBtn');
        const cancelBtn = document.getElementById('cancelShareBtn');
        const shareResult = document.getElementById('shareResult');
        
        if (isShared) {
            // 이미 공유된 파일인 경우
            createBtn.style.display = 'none';
            cancelBtn.style.display = 'block';
            shareResult.style.display = 'block';
            
            // 현재 공유 정보 표시
            const shareUrl = document.getElementById('shareUrl');
            shareUrl.value = `${window.location.origin}/share/${file.shareToken}`;
            
            const expiresDate = new Date(file.shareExpires);
            document.getElementById('shareExpiresDate').textContent = expiresDate.toLocaleDateString();
        } else {
            // 공유되지 않은 파일인 경우
            createBtn.style.display = 'block';
            cancelBtn.style.display = 'none';
            shareResult.style.display = 'none';
        }
    }

    async createShareLink() {
        if (!this.currentShareFile) return;
        
        const fileId = this.currentShareFile.id || this.currentShareFile._id;
        const expiresIn = parseInt(document.getElementById('shareExpires').value);
        
        try {
            this.showNotification('공유 링크를 생성하는 중...', 'info');
            
            const response = await fetch(`/api/files/${fileId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ expiresIn })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // UI 업데이트
                const createBtn = document.getElementById('createShareBtn');
                const cancelBtn = document.getElementById('cancelShareBtn');
                const shareResult = document.getElementById('shareResult');
                const shareUrl = document.getElementById('shareUrl');
                const shareExpiresDate = document.getElementById('shareExpiresDate');
                
                createBtn.style.display = 'none';
                cancelBtn.style.display = 'block';
                shareResult.style.display = 'block';
                
                shareUrl.value = data.shareUrl;
                shareExpiresDate.textContent = new Date(data.expiresAt).toLocaleDateString();
                
                this.showNotification('공유 링크가 생성되었습니다.', 'success');
                
                // 자동으로 링크 복사
                this.copyShareUrl();
            } else {
                const data = await response.json();
                this.showNotification(data.error || '공유 링크 생성에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Create share link error:', error);
            this.showNotification('공유 링크 생성 중 오류가 발생했습니다.', 'error');
        }
    }

    async cancelShare() {
        if (!this.currentShareFile) return;
        
        const fileId = this.currentShareFile.id || this.currentShareFile._id;
        
        if (!confirm('정말로 공유를 취소하시겠습니까? 기존 공유 링크는 더 이상 사용할 수 없습니다.')) {
            return;
        }
        
        try {
            this.showNotification('공유를 취소하는 중...', 'info');
            
            const response = await fetch(`/api/files/${fileId}/share`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                // UI 업데이트
                const createBtn = document.getElementById('createShareBtn');
                const cancelBtn = document.getElementById('cancelShareBtn');
                const shareResult = document.getElementById('shareResult');
                
                createBtn.style.display = 'block';
                cancelBtn.style.display = 'none';
                shareResult.style.display = 'none';
                
                this.showNotification('공유가 취소되었습니다.', 'success');
                
                // 현재 탭이 공유 탭인 경우 목록 새로고침
                const activeTab = document.querySelector('.nav-item.active');
                if (activeTab && activeTab.dataset.tab === 'shared') {
                    this.loadSharedFiles();
                }
            } else {
                const data = await response.json();
                this.showNotification(data.error || '공유 취소에 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Cancel share error:', error);
            this.showNotification('공유 취소 중 오류가 발생했습니다.', 'error');
        }
    }

    copyShareUrl() {
        const shareUrl = document.getElementById('shareUrl');
        
        if (shareUrl && shareUrl.value) {
            // 링크 복사
            shareUrl.select();
            shareUrl.setSelectionRange(0, 99999); // 모바일 지원
            
            try {
                document.execCommand('copy');
                this.showNotification('공유 링크가 클립보드에 복사되었습니다.', 'success');
            } catch (error) {
                // Fallback: 최신 브라우저의 Clipboard API 사용
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(shareUrl.value).then(() => {
                        this.showNotification('공유 링크가 클립보드에 복사되었습니다.', 'success');
                    }).catch(() => {
                        this.showNotification('링크 복사에 실패했습니다. 수동으로 복사해주세요.', 'error');
                    });
                } else {
                    this.showNotification('링크 복사에 실패했습니다. 수동으로 복사해주세요.', 'error');
                }
            }
        }
    }

    async handleRename(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newName = formData.get('name');
        
        if (!newName || !newName.trim()) {
            this.showNotification('새로운 이름을 입력해주세요.', 'error');
            return;
        }
        
        if (!this.renameTarget) {
            this.showNotification('이름을 변경할 대상이 없습니다.', 'error');
            return;
        }
        
        try {
            this.showNotification(`${this.renameType === 'file' ? '파일' : '폴더'} 이름을 변경하는 중...`, 'info');
            
            let response;
            const itemId = this.renameTarget.id || this.renameTarget._id;
            
            if (this.renameType === 'file') {
                // 파일의 경우 확장자 유지
                const originalName = this.renameTarget.original_name || this.renameTarget.originalName;
                const extension = originalName.includes('.') ? 
                    originalName.substring(originalName.lastIndexOf('.')) : '';
                const finalName = newName.trim() + extension;
                
                response = await fetch(`/api/files/${itemId}/rename`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ newName: finalName })
                });
            } else {
                // 폴더의 경우
                response = await fetch(`/api/folders/${itemId}/rename`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ newName: newName.trim() })
                });
            }

            if (response.ok) {
                this.loadFiles(this.currentFolderId);
                this.loadUserProfile();
                this.updateSidebarFolders(); // 사이드바 폴더 목록도 업데이트
                this.showNotification(`${this.renameType === 'file' ? '파일' : '폴더'} 이름이 성공적으로 변경되었습니다.`, 'success');
                this.closeModal('renameModal');
                
                // 정리
                this.renameTarget = null;
                this.renameType = null;
            } else {
                const data = await response.json();
                this.showNotification(data.error || `${this.renameType === 'file' ? '파일' : '폴더'} 이름 변경에 실패했습니다.`, 'error');
            }
        } catch (error) {
            console.error('Rename error:', error);
            this.showNotification(`${this.renameType === 'file' ? '파일' : '폴더'} 이름 변경 중 오류가 발생했습니다.`, 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.app = new DropboxClone();
}); 