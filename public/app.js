document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const authContainer = document.getElementById('authContainer');
    const welcomeSection = document.querySelector('.welcome-section');
    const navLogoutBtn = document.getElementById('navLogoutBtn');
    const userProfile = document.querySelector('.user-profile');
    const authRequiredLinks = document.querySelectorAll('.auth-required');
    const homeLink = document.getElementById('homeLink');
    const navProfileImage = document.getElementById('navProfileImage');

    // プロフィール画像を更新する関数
    function updateProfileImage(iconUrl, element) {
        if (!element) return;
        if (!iconUrl) {
            element.innerHTML = '👤';
            element.style.fontSize = '24px';
            element.style.backgroundColor = '#1a1a2e';
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            element.style.backgroundImage = '';
        } else {
            element.innerHTML = '';
            element.style.backgroundImage = `url(${iconUrl})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
        }
    }

    // ホームリンクのクリックイベント
    if (homeLink) {
        homeLink.addEventListener('click', () => {
            if (token) {
                // ログイン済みの場合
                if (authContainer) authContainer.style.display = 'none';
                if (welcomeSection) welcomeSection.style.display = 'block';
            } else {
                // 未ログインの場合
                if (authContainer) authContainer.style.display = 'block';
                if (welcomeSection) welcomeSection.style.display = 'none';
            }
        });
    }

    // ログイン状態に応じて表示を切り替え
    if (token) {
        if (authContainer) authContainer.style.display = 'none';
        if (welcomeSection) welcomeSection.style.display = 'block';
        if (userProfile) userProfile.style.display = 'flex';
        
        // 認証が必要なリンクを有効化
        authRequiredLinks.forEach(link => {
            link.classList.remove('disabled-link');
            link.removeAttribute('data-tooltip');
        });
        
        // ユーザー情報を取得して表示
        fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            const navDisplayName = document.getElementById('navDisplayName');
            if (navDisplayName) {
                navDisplayName.textContent = data.displayName || data.username;
            }
            
            // プロフィール画像を更新
            if (data.summonerInfo && data.summonerInfo.iconUrl) {
                updateProfileImage(data.summonerInfo.iconUrl, navProfileImage);
            } else {
                updateProfileImage(null, navProfileImage);
            }
        })
        .catch(error => console.error('ユーザー情報の取得に失敗:', error));
    } else {
        if (authContainer) authContainer.style.display = 'block';
        if (welcomeSection) welcomeSection.style.display = 'none';
        if (userProfile) userProfile.style.display = 'none';
        
        // 認証が必要なリンクを無効化
        authRequiredLinks.forEach(link => {
            link.classList.add('disabled-link');
            link.setAttribute('data-tooltip', 'ログインが必要です');
        });

        // デフォルトのプロフィール画像を設定
        updateProfileImage(null, navProfileImage);
    }

    // ログアウトボタンの処理
    if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                logout();
            }
        });
    }

    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            // タブの切り替え
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // フォームの切り替え
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.querySelector(`#${button.dataset.tab}Form`).classList.add('active');

            // エラーメッセージをクリア
            document.querySelectorAll('.error-message').forEach(error => error.textContent = '');
        });
    });

    // ログインフォームの処理
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const form = e.target;

        try {
            await login(username, password);
        } catch (error) {
            showError(form, error.message);
        }
    });

    // エラーメッセージを表示する関数
    function showError(form, message) {
        // 既存のエラーメッセージがあれば削除
        const existingErrors = form.querySelectorAll('.error-message');
        existingErrors.forEach(error => error.remove());

        // 新しいエラーメッセージを作成
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.color = 'red';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.marginBottom = '10px';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.fontWeight = 'bold';
        errorDiv.style.padding = '10px';
        errorDiv.style.backgroundColor = '#ffebee';
        errorDiv.style.borderRadius = '4px';
        errorDiv.textContent = message;

        // フォームの最初の入力欄の前にエラーメッセージを挿入
        const firstInput = form.querySelector('input');
        if (firstInput) {
            firstInput.parentElement.insertBefore(errorDiv, firstInput);
        } else {
            form.insertBefore(errorDiv, form.firstChild);
        }
    }

    // 新規登録フォームの処理
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('新規登録フォーム送信');
        
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const displayName = document.getElementById('displayName').value;
        const summonerName = document.getElementById('summonerName').value;
        const form = e.target;
        
        // 入力値の検証
        if (!username || !password || !displayName || !summonerName) {
            showError(form, '全ての項目を入力してください');
            return;
        }
        
        console.log('入力値:', { username, displayName, summonerName });

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password, displayName, summonerName })
            });

            const data = await response.json();
            console.log('サーバーレスポンス:', data);

            if (!response.ok) {
                // エラーメッセージの日本語化
                let errorMessage = data.message;
                if (data.message.includes('このユーザー名は既に使用されています')) {
                    errorMessage = 'このユーザー名は既に使用されています。別のユーザー名を選択してください。';
                }
                throw new Error(errorMessage);
            }

            // 登録成功時のトークンとユーザー情報を保存
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // ホームページにリダイレクト
            console.log('ホームページへリダイレクト');
            alert('登録が完了しました！');
            window.location.replace('/');
        } catch (error) {
            console.error('登録エラー:', error);
            showError(form, error.message);
        }
    });
});

// ログイン処理の関数
async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Cookieを含める
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'ログインに失敗しました');
        }

        // トークンとユーザー情報を保存
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        console.log('ログイン成功、ホームページへリダイレクト');
        // リダイレクト方法を変更
        window.location.replace('/');
    } catch (error) {
        console.error('ログインエラー:', error);
        throw error;
    }
}

// ログアウト処理を更新
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
} 