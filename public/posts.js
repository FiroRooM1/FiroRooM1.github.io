document.addEventListener('DOMContentLoaded', async () => {
    // 認証チェック
    if (!await checkAuth()) {
        console.log('認証チェック失敗');
        return;
    }

    console.log('投稿ページ初期化開始');

    // ナビゲーション初期化
    const profile = await initializeNavigation();
    if (!profile) return;

    // ユーザー情報を表示
    const navProfileImage = document.getElementById('navProfileImage');
    const navDisplayName = document.getElementById('navDisplayName');
    const navLogoutBtn = document.getElementById('navLogoutBtn');

    // プロフィール画像を更新する関数
    function updateProfileImage(avatar, element) {
        if (avatar.includes('👤')) {
            element.innerHTML = avatar;
            element.style.fontSize = '24px';
            element.style.backgroundColor = '#1a1a2e';
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            element.style.backgroundImage = '';
        } else {
            element.innerHTML = '';
            const isAdminIcon = avatar === 'Ahri_7.jpg';
            const imagePath = isAdminIcon ? `/IconadminIMG/${avatar}` : `/IconIMG/${avatar}`;
            element.style.backgroundImage = `url(${avatar.startsWith('/') ? avatar : imagePath})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
        }
    }

    // ユーザー情報を取得
    fetch('/api/user/profile', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(data => {
        navDisplayName.textContent = data.displayName || data.username;
        if (data.avatar) {
            updateProfileImage(data.avatar, navProfileImage);
        }
    })
    .catch(error => console.error('ユーザー情報の取得に失敗:', error));

    // ログアウトボタンの処理
    navLogoutBtn.addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
            localStorage.removeItem('token');
            window.location.replace('/');
        }
    });

    // フォームの送信処理
    const postForm = document.getElementById('postForm');
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            const formData = {
                title: document.getElementById('title').value,
                gameMode: document.getElementById('gameMode').value,
                mainLane: document.getElementById('mainLane').value,
                description: document.getElementById('description').value
            };

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || '投稿の作成に失敗しました');
            }

            showSuccess('投稿を作成しました');
            setTimeout(() => {
                window.location.href = '/matching.html';
            }, 2000);
        } catch (error) {
            console.error('投稿作成エラー:', error);
            showError(error.message);
        }
    });

    // キャンセルボタンの処理
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = '/matching.html';
    });

    // エラーメッセージの表示
    function showError(message) {
        showToast(message, 'error');
    }

    // 成功メッセージの表示
    function showSuccess(message) {
        showToast(message, 'success');
    }

    // トースト通知の表示
    function showToast(message, type = 'success') {
        // トーストコンテナの取得または作成
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // トースト要素の作成
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // アイコンの設定
        const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <i class="fas fa-times toast-close"></i>
        `;

        // トーストを表示
        container.appendChild(toast);

        // 閉じるボタンのイベントリスナー
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.remove();
        });

        // 3秒後に自動的に消える
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.remove();
            }
        }, 3000);
    }

    // 投稿を表示する関数
    function displayPosts(posts) {
        const postsContainer = document.getElementById('posts');
        const currentUsername = localStorage.getItem('username');
        postsContainer.innerHTML = posts.length > 0
            ? posts.map(post => `
                <div class="post-item">
                    <div class="post-header">
                        <h3>${post.title}</h3>
                        ${post.author._id === currentUsername 
                            ? `<button onclick="deletePost(${post._id})" class="delete-btn">
                                <i class="fas fa-trash"></i> 削除
                            </button>`
                            : `<button onclick="applyToPost(${post._id})" class="apply-btn">
                                <i class="fas fa-paper-plane"></i> 申請
                            </button>`
                        }
                    </div>
                    <div class="post-content">
                        <p>${post.description}</p>
                        <p>ゲームモード: ${post.gameMode}</p>
                        <p>投稿者: ${post.author.displayName}</p>
                        <p>投稿日時: ${new Date(post.createdAt).toLocaleString()}</p>
                    </div>
                </div>
            `).join('')
            : '<p class="no-posts">投稿がありません</p>';
    }

    // 申請モーダルのHTML
    const modalHtml = `
        <div id="applyModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>申請フォーム</h2>
                    <button class="close-btn" onclick="closeApplyModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="applyForm" class="apply-form">
                    <input type="hidden" id="postId">
                    <div class="form-group">
                        <label for="preferredLane">希望レーン</label>
                        <select id="preferredLane" class="form-control" required>
                            <option value="">選択してください</option>
                            <option value="TOP">TOP</option>
                            <option value="JUNGLE">JUNGLE</option>
                            <option value="MID">MID</option>
                            <option value="ADC">ADC</option>
                            <option value="SUPPORT">SUPPORT</option>
                            <option value="AUTOFILL">AUTOFILL</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="message">メッセージ（任意）</label>
                        <textarea id="message" class="form-control" rows="4" placeholder="メッセージを入力してください"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="submit-btn">申請を送信</button>
                        <button type="button" class="cancel-btn" onclick="closeApplyModal()">キャンセル</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // モーダルをbodyに追加
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 申請モーダルを開く関数
    window.applyToPost = (postId) => {
        document.getElementById('postId').value = postId;
        document.getElementById('applyModal').style.display = 'block';
    };

    // 申請モーダルを閉じる関数
    window.closeApplyModal = () => {
        document.getElementById('applyModal').style.display = 'none';
        document.getElementById('applyForm').reset();
    };

    // 申請フォームの送信処理
    document.getElementById('applyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const postId = document.getElementById('postId').value;
        const preferredLane = document.getElementById('preferredLane').value;
        const message = document.getElementById('message').value;

        try {
            const response = await fetch('/api/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ postId, preferredLane, message })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || '申請の送信に失敗しました');
            }

            showSuccess('申請を送信しました');
            closeApplyModal();
        } catch (error) {
            console.error('申請送信エラー:', error);
            showError(error.message);
        }
    });
}); 