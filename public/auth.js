// 認証状態をチェックする共通関数
async function checkAuth() {
    const token = localStorage.getItem('token');
    console.log('認証チェック - トークン:', token ? '存在します' : '存在しません');

    if (!token) {
        console.log('トークンが見つからないためログインページにリダイレクト');
        window.location.href = '/login.html';
        return false;
    }

    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            console.log('プロフィール取得失敗:', response.status);
            if (response.status === 401) {
                console.log('認証エラー: トークンが無効');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return false;
            }
            throw new Error('認証チェックに失敗しました');
        }

        const data = await response.json();
        console.log('認証チェック成功:', data.username);
        return true;
    } catch (error) {
        console.error('認証チェックエラー:', error);
        return false;
    }
}

// APIリクエスト用の共通ヘッダーを取得
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// ページロード時の認証チェック
document.addEventListener('DOMContentLoaded', async () => {
    // 保護されたページのリスト
    const protectedPages = ['/matching.html', '/posts.html', '/requests.html', '/party.html', '/profile.html'];
    const currentPage = window.location.pathname;

    // 現在のページが保護されたページの場合のみ認証チェックを実行
    if (protectedPages.includes(currentPage)) {
        console.log('保護されたページのチェック:', currentPage);
        await checkAuth();
    }
}); 