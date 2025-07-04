// ナビゲーション初期化関数
async function initializeNavigation() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('トークンが見つかりません - ナビゲーション初期化をスキップ');
        return null;
    }

    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.log('認証エラー: トークンが無効');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return null;
            }
            throw new Error('プロフィール取得に失敗しました');
        }

        const profile = await response.json();
        
        // ナビゲーションバーの要素を更新
        const navProfileImage = document.getElementById('navProfileImage');
        const navDisplayName = document.getElementById('navDisplayName');
        const navLogoutBtn = document.getElementById('navLogoutBtn');

        if (profile.summonerInfo && profile.summonerInfo.iconUrl) {
            navProfileImage.style.backgroundImage = `url(${profile.summonerInfo.iconUrl})`;
        }
        navDisplayName.textContent = profile.displayName;

        // ログアウトボタンのイベントリスナー
        navLogoutBtn.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
        });

        return profile;
    } catch (error) {
        console.error('ナビゲーション初期化エラー:', error);
        return null;
    }
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        // 保護されたページのリスト
        const protectedPages = ['/matching.html', '/posts.html', '/requests.html', '/party.html', '/profile.html'];
        const currentPage = window.location.pathname;
        
        // 現在のページが保護されたページの場合、ログインページにリダイレクト
        if (protectedPages.includes(currentPage)) {
            console.log('保護されたページへのアクセス - ログインが必要です');
            window.location.href = '/login.html';
            return;
        }
    }

    await initializeNavigation();
});

// エラーメッセージの表示
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.insertBefore(errorDiv, document.body.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

// エクスポート
window.initializeNavigation = initializeNavigation; 