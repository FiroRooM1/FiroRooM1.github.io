document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                // トークンをローカルストレージに保存
                localStorage.setItem('token', data.token);
                // ユーザー情報も保存
                localStorage.setItem('user', JSON.stringify(data.user));
                
                console.log('ログイン成功:', {
                    token: data.token.substring(0, 10) + '...',
                    user: data.user
                });

                // ホームページにリダイレクト
                window.location.href = '/';
            } else {
                throw new Error(data.message || 'ログインに失敗しました');
            }
        } catch (error) {
            console.error('ログインエラー:', error);
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        }
    });
}); 