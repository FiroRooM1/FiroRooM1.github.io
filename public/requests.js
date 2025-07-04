document.addEventListener('DOMContentLoaded', async () => {
    // 認証チェック
    if (!await checkAuth()) {
        console.log('認証チェック失敗');
        return;
    }

    console.log('申請一覧ページ初期化開始');

    // ナビゲーション初期化
    const profile = await initializeNavigation();
    if (!profile) return;

    // DOM要素の取得
    const receivedRequestsContainer = document.getElementById('receivedRequests');
    const sentRequestsContainer = document.getElementById('sentRequests');
    const tabButtons = document.querySelectorAll('.tab-btn');

    // 初期データ読み込み
    await loadRequests();

    // タブ切り替えの処理
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // タブボタンのアクティブ状態を切り替え
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 申請リストの表示を切り替え
            const tabName = button.dataset.tab;
            document.querySelectorAll('.requests-list').forEach(list => {
                list.classList.remove('active');
            });
            document.getElementById(`${tabName}Requests`).classList.add('active');
        });
    });

    // 申請一覧を取得する関数
    async function loadRequests() {
        try {
            const response = await fetch('/api/requests', {
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('申請の取得に失敗しました');
            }

            const { received, sent } = await response.json();
            displayRequests('receivedRequests', received, true);
            displayRequests('sentRequests', sent, false);
        } catch (error) {
            console.error('申請取得エラー:', error);
            showError(error.message);
        }
    }

    // 申請を表示する関数
    function displayRequests(containerId, requests, isReceived) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (requests.length === 0) {
            container.innerHTML = `<p class="no-requests">${isReceived ? '受け取った申請はありません' : '送信した申請はありません'}</p>`;
            return;
        }

        requests.forEach(request => {
            const requestElement = createRequestElement(request, isReceived);
            container.appendChild(requestElement);
        });
    }

    // 申請要素を作成する関数
    function createRequestElement(request, isReceived) {
        const requestDiv = document.createElement('div');
        requestDiv.className = 'request-item';

        // ランク情報の取得
        const soloRank = request.applicant.summonerInfo.ranks.find(r => r.queueType === 'RANKED_SOLO_5x5');
        const flexRank = request.applicant.summonerInfo.ranks.find(r => r.queueType === 'RANKED_FLEX_SR');
        
        const soloRankText = soloRank 
            ? `${soloRank.tier} ${soloRank.rank} (${soloRank.leaguePoints}LP)`
            : '未設定';
        const flexRankText = flexRank
            ? `${flexRank.tier} ${flexRank.rank} (${flexRank.leaguePoints}LP)`
            : '未設定';
            
        const rankImageFile = soloRank && soloRank.tier !== 'UNRANKED' ? 
            `Rank=${soloRank.tier}.png` : 'Rank=Unranked.png';

        requestDiv.innerHTML = `
            <div class="request-header">
                <div class="applicant-info">
                    <img src="${request.applicant.summonerInfo.iconUrl}" alt="プロフィール画像" class="applicant-icon">
                    <div class="applicant-details">
                        <div class="applicant-name-rank">
                            <span class="applicant-name">${request.applicant.displayName}</span>
                            <span class="summoner-name">${request.applicant.summonerInfo.name}</span>
                        </div>
                        <div class="rank-info">
                            <div class="rank-container">
                                <img src="/rankIMG/${rankImageFile}" alt="${soloRankText}" class="rank-icon">
                                <div class="rank-details">
                                    <span class="rank-type">ソロランク</span>
                                    <span class="rank-text">${soloRankText}</span>
                                </div>
                            </div>
                            <div class="rank-container">
                                <img src="/rankIMG/${flexRank ? `Rank=${flexRank.tier}.png` : 'Rank=Unranked.png'}" alt="${flexRankText}" class="rank-icon">
                                <div class="rank-details">
                                    <span class="rank-type">フレックス</span>
                                    <span class="rank-text">${flexRankText}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="request-content">
                <div class="post-info">
                    <h3 class="post-title">${request.post.title}</h3>
                    <div class="post-details">
                        <div class="post-tags">
                            <span class="tag game-mode">${getGameModeName(request.post.gameMode)}</span>
                            <span class="tag lane">${getLaneName(request.post.mainLane)}</span>
                        </div>
                        <div class="preferred-lane">
                            <span class="label">希望レーン:</span>
                            <span class="tag lane preferred">${getLaneName(request.preferredLane)}</span>
                        </div>
                    </div>
                </div>
                ${request.message ? `
                    <div class="message-container">
                        <span class="label">メッセージ:</span>
                        <p class="request-message">${request.message}</p>
                    </div>
                ` : ''}
                <div class="request-status">
                    <span class="status-badge ${request.status}">${getStatusName(request.status)}</span>
                    <span class="request-time">${new Date(request.createdAt).toLocaleString()}</span>
                </div>
            </div>
            ${isReceived && request.status === 'pending' ? `
                <div class="request-actions">
                    <button class="accept-btn" onclick="handleAccept('${request._id}')">
                        <i class="fas fa-check"></i> 承認
                    </button>
                    <button class="reject-btn" onclick="handleReject('${request._id}')">
                        <i class="fas fa-times"></i> 拒否
                    </button>
                </div>
            ` : ''}
        `;

        return requestDiv;
    }

    // ゲームモード名を取得
    function getGameModeName(mode) {
        const modes = {
            'NORMAL': 'ノーマル',
            'RANKED_SOLO': 'ランク(ソロ/デュオ)',
            'RANKED_FLEX': 'ランク(フレックス)',
            'ARAM': 'ARAM'
        };
        return modes[mode] || mode;
    }

    // レーン名を取得
    function getLaneName(lane) {
        const lanes = {
            'TOP': 'TOP',
            'JUNGLE': 'JUNGLE',
            'MID': 'MID',
            'ADC': 'ADC',
            'SUPPORT': 'SUPPORT',
            'AUTOFILL': 'AUTOFILL'
        };
        return lanes[lane] || lane;
    }

    // ステータス名を取得
    function getStatusName(status) {
        const statuses = {
            'pending': '承認待ち',
            'accepted': '承認済み',
            'rejected': '拒否',
            'cancelled': 'キャンセル'
        };
        return statuses[status] || status;
    }

    // 申請を承認する関数
    window.handleAccept = async (requestId) => {
        try {
            const response = await fetch(`/api/requests/${requestId}/accept`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || '申請の承認に失敗しました');
            }

            const { party } = await response.json();
            showSuccess('申請を承認しました');

            // パーティーページに遷移
            setTimeout(() => {
                window.location.href = `/party.html?id=${party._id}`;
            }, 1500);
        } catch (error) {
            console.error('申請承認エラー:', error);
            showError(error.message);
        }
    };

    // 申請を拒否する関数
    window.handleReject = async (requestId) => {
        if (!confirm('この申請を拒否してもよろしいですか？')) {
            return;
        }

        try {
            const response = await fetch(`/api/requests/${requestId}/reject`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || '申請の拒否に失敗しました');
            }

            showSuccess('申請を拒否しました');
            await loadRequests(); // 申請一覧を再読み込み
        } catch (error) {
            console.error('申請拒否エラー:', error);
            showError(error.message);
        }
    };

    // Pusherを使用してリアルタイム通知を受信
    const pusher = new Pusher('8ebcc71b2fe50be4967d', {
        cluster: 'ap3'
    });

    const channel = pusher.subscribe(`user-${profile.username}`);
    
    channel.bind('request-accepted', data => {
        showSuccess(data.message);
        loadRequests(); // 申請一覧を再読み込み
        
        // パーティーページに遷移
        setTimeout(() => {
            window.location.href = `/party.html?id=${data.party._id}`;
        }, 1500);
    });

    channel.bind('request-rejected', data => {
        showError(data.message);
        loadRequests(); // 申請一覧を再読み込み
    });

    // エラーメッセージを表示
    function showError(message) {
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.innerHTML = `
            <i class="fas fa-exclamation-circle toast-icon"></i>
            <span class="toast-message">${message}</span>
            <i class="fas fa-times toast-close" onclick="this.parentElement.remove()"></i>
        `;
        document.querySelector('.toast-container')?.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 成功メッセージを表示
    function showSuccess(message) {
        const toast = document.createElement('div');
        toast.className = 'toast success';
        toast.innerHTML = `
            <i class="fas fa-check-circle toast-icon"></i>
            <span class="toast-message">${message}</span>
            <i class="fas fa-times toast-close" onclick="this.parentElement.remove()"></i>
        `;
        document.querySelector('.toast-container')?.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}); 