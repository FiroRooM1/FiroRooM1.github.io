document.addEventListener('DOMContentLoaded', async () => {
    // ログイン状態の確認
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const displayNameInput = document.getElementById('displayName');
    const summonerNameInput = document.getElementById('summonerName');
    const passwordInput = document.getElementById('password');
    const editBtn = document.getElementById('editBtn');
    const submitBtn = document.getElementById('submitBtn');
    const profileForm = document.getElementById('profileForm');
    const cancelBtn = document.getElementById('cancelBtn');
    const navProfileImage = document.getElementById('navProfileImage');
    const navDisplayName = document.getElementById('navDisplayName');
    const navLogoutBtn = document.getElementById('navLogoutBtn');
    const summonerNameDisplay = document.getElementById('summonerNameDisplay');

    // プロフィール情報を取得
    async function loadProfile() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.log('認証エラー: トークンが無効または期限切れ');
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error('プロフィール情報の取得に失敗しました');
            }

            const profile = await response.json();
            console.log('プロフィール情報取得成功:', profile);
            
            if (profile) {
                displayNameInput.value = profile.displayName || '';
                summonerNameInput.value = profile.summonerName || '';
                summonerNameDisplay.textContent = profile.summonerName || '';
                
                // ナビゲーションバーの表示を更新
                if (navDisplayName) {
                    navDisplayName.textContent = profile.displayName;
                }
                if (navProfileImage && profile.summonerInfo) {
                    navProfileImage.style.backgroundImage = `url(${profile.summonerInfo.iconUrl})`;
                }

                // サモナー情報を表示
                if (profile.summonerInfo) {
                    updateSummonerInfo(profile.summonerInfo);
                }
            }

            // フォームを無効化
            disableForm();
        } catch (error) {
            console.error('プロフィール取得エラー:', error);
            showError(error.message);
        }
    }

    // プロフィール編集を有効化
    editBtn.addEventListener('click', () => {
        enableForm();
    });

    // プロフィール更新
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('プロフィール更新開始');

        try {
            const updateData = {
                displayName: displayNameInput.value,
                summonerName: summonerNameInput.value
            };

            // パスワードが入力されている場合のみ追加
            if (passwordInput.value.trim()) {
                updateData.password = passwordInput.value;
            }

            console.log('送信データ:', updateData);

            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify(updateData)
            });

            console.log('レスポンスステータス:', response.status);

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'プロフィールの更新に失敗しました');
            }

            console.log('更新成功:', result);
            
            showSuccessMessage('プロフィールの更新が完了しました');
            passwordInput.value = ''; // パスワードフィールドをクリア
            disableForm();
            
            // ローカルストレージのユーザー情報を更新
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // プロフィール情報を再読み込み
            await loadProfile();
        } catch (error) {
            console.error('プロフィール更新エラー:', error);
            showErrorMessage(error.message);
        }
    });

    // キャンセルボタンの処理
    cancelBtn.addEventListener('click', async () => {
        passwordInput.value = ''; // パスワードフィールドをクリア
        await loadProfile();
        disableForm();
    });

    // フォームの有効化
    function enableForm() {
        displayNameInput.disabled = false;
        summonerNameInput.disabled = false;
        passwordInput.disabled = false;
        submitBtn.style.display = 'block';
        editBtn.style.display = 'none';
        cancelBtn.style.display = 'block';
    }

    // フォームの無効化
    function disableForm() {
        displayNameInput.disabled = true;
        summonerNameInput.disabled = true;
        passwordInput.disabled = true;
        submitBtn.style.display = 'none';
        editBtn.style.display = 'block';
        cancelBtn.style.display = 'none';
    }

    // サモナー情報の表示を更新
    function updateSummonerInfo(summonerInfo) {
        const summonerIcon = document.getElementById('summonerIcon');
        const summonerNameDisplay = document.getElementById('summonerNameDisplay');
        const summonerLevel = document.getElementById('summonerLevel');
        const rankInfo = document.getElementById('rankInfo');

        // アイコンを設定
        if (summonerInfo.iconUrl) {
            summonerIcon.src = summonerInfo.iconUrl;
        }

        // サモナー名を設定
        summonerNameDisplay.textContent = summonerInfo.name || '';

        // レベルを設定
        summonerLevel.textContent = `レベル ${summonerInfo.level || 0}`;

        // ランク情報を設定
        if (summonerInfo.ranks && summonerInfo.ranks.length > 0) {
            rankInfo.innerHTML = summonerInfo.ranks.map(rank => {
                const queueType = rank.queueType === 'RANKED_SOLO_5x5' ? 'ソロ/デュオ' : 'フレックス';
                const winRate = ((rank.wins / (rank.wins + rank.losses)) * 100).toFixed(1);
                
                return `
                    <div class="rank-card">
                        <div class="rank-header">
                            <img src="/rankIMG/Rank=${rank.tier}.png" alt="${rank.tier}" class="rank-icon-small">
                            <span class="rank-type">${queueType}</span>
                        </div>
                        <div class="rank-details">
                            <span class="rank-tier">${rank.tier} ${rank.rank}</span>
                            <span class="rank-lp">${rank.leaguePoints} LP</span>
                            <span class="rank-record">${rank.wins}勝 ${rank.losses}敗 (${winRate}%)</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            rankInfo.innerHTML = `
                <div class="rank-card">
                    <div class="rank-header">
                        <img src="/rankIMG/Rank=UNRANKED.png" alt="Unranked" class="rank-icon-small">
                        <span class="rank-type">ランク未設定</span>
                    </div>
                    <div class="rank-details">
                        <span class="rank-tier">未ランク</span>
                        <span class="rank-record">0勝 0敗</span>
                    </div>
                </div>
            `;
        }
    }

    // エラーメッセージの表示
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.querySelector('.profile-section').insertBefore(errorDiv, document.querySelector('.profile-header'));
        setTimeout(() => errorDiv.remove(), 5000);
    }

    // 成功メッセージを表示する関数
    function showSuccessMessage(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #4CAF50;
            color: white;
            padding: 15px 30px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
            font-weight: bold;
            text-align: center;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);

        setTimeout(() => {
            successDiv.style.opacity = '0';
            successDiv.style.transition = 'opacity 0.5s ease';
            setTimeout(() => successDiv.remove(), 500);
        }, 3000);
    }

    // エラーメッセージを表示する関数
    function showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #f44336;
            color: white;
            padding: 15px 30px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
            font-weight: bold;
            text-align: center;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.style.opacity = '0';
            errorDiv.style.transition = 'opacity 0.5s ease';
            setTimeout(() => errorDiv.remove(), 500);
        }, 3000);
    }

    // 初期表示
    await loadProfile();

    // ログアウトボタンの処理
    navLogoutBtn.addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
    });
}); 