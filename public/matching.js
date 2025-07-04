document.addEventListener('DOMContentLoaded', async () => {
    // 認証チェック
    if (!await checkAuth()) {
        console.log('認証チェック失敗');
        return;
    }

    console.log('マッチングページ初期化開始');

    // フィルター要素の取得
    const gameModeFilter = document.getElementById('gameModeFilter');
    const mainLaneFilter = document.getElementById('mainLaneFilter');
    const rankFilter = document.getElementById('rankFilter');
    const postsList = document.getElementById('postsList');

    // 投稿一覧を取得する関数
    async function loadPosts() {
        try {
            // フィルターの値を取得
            const filters = {
                gameMode: gameModeFilter.value,
                mainLane: mainLaneFilter.value,
                rank: rankFilter.value
            };

            // クエリパラメータの構築
            const queryParams = new URLSearchParams(
                Object.entries(filters).filter(([_, value]) => value)
            ).toString();

            const response = await fetch(`/api/posts${queryParams ? `?${queryParams}` : ''}`, {
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('投稿の取得に失敗しました');
            }

            const posts = await response.json();
            displayPosts(posts);
        } catch (error) {
            console.error('投稿取得エラー:', error);
            showError(error.message);
        }
    }

    // 投稿を表示する関数
    function displayPosts(posts) {
        postsList.innerHTML = '';
        
        if (posts.length === 0) {
            postsList.innerHTML = '<p class="no-posts">募集がありません</p>';
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post);
            postsList.appendChild(postElement);
        });
    }

    // 投稿要素を作成する関数
    function createPostElement(post) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post-item';
        
        // ランク情報の取得
        const soloRank = post.author.rank.find(r => r.queueType === 'RANKED_SOLO_5x5');
        const rankText = soloRank 
            ? `${soloRank.tier} ${soloRank.rank}`
            : '未設定';
        const rankImageFile = soloRank && soloRank.tier !== 'UNRANKED' ? 
            `Rank=${soloRank.tier}.png` : 'Rank=Unranked.png';

        // 現在のユーザーが投稿者かどうかを確認
        const user = JSON.parse(localStorage.getItem('user'));
        const currentUsername = user ? user.username : null;
        const isAuthor = post.author._id === currentUsername;

        postDiv.innerHTML = `
            <div class="post-header">
                <div class="author-info">
                    <img src="${post.author.summonerInfo.iconUrl}" alt="プロフィール画像" class="author-icon">
                    <div class="author-details">
                        <div class="author-name-rank">
                            <span class="author-name">${post.author.displayName}</span>
                            <div class="rank-container">
                                <img src="/rankIMG/${rankImageFile}" alt="${rankText}" class="rank-icon">
                                <span class="author-rank">${rankText}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <h3 class="post-title">${post.title}</h3>
                <div class="post-tags">
                    <span class="tag game-mode">${getGameModeName(post.gameMode)}</span>
                    <span class="tag lane">${getLaneName(post.mainLane)}</span>
                </div>
                <p class="post-description">${post.description || ''}</p>
            </div>
            <div class="post-footer">
                <span class="post-time">${new Date(post.createdAt).toLocaleString()}</span>
                <div class="post-actions">
                    ${isAuthor 
                        ? `<button class="delete-btn" data-post-id="${post._id}">
                            <i class="fas fa-trash"></i> 削除する
                           </button>`
                        : `<button class="apply-btn" data-post-id="${post._id}">
                            <i class="fas fa-paper-plane"></i> 申請する
                           </button>`
                    }
                </div>
            </div>
        `;

        // 削除ボタンのイベントリスナー
        if (isAuthor) {
            const deleteBtn = postDiv.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => handleDelete(post));
        } else {
            const applyBtn = postDiv.querySelector('.apply-btn');
            applyBtn.addEventListener('click', () => handleApply(post));
        }

        return postDiv;
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

    // 申請処理
    async function handleApply(post) {
        try {
            // 申請モーダルを表示
            const modalHtml = `
                <div class="modal-content apply-modal">
                    <h2>申請フォーム</h2>
                    <form id="applyForm">
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
                            <textarea id="message" class="form-control" rows="3" placeholder="メッセージを入力してください"></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="submit-btn">申請する</button>
                            <button type="button" class="cancel-btn" id="cancelApplyBtn">キャンセル</button>
                        </div>
                    </form>
                </div>
            `;

            // モーダルを表示
            const modalOverlay = document.createElement('div');
            modalOverlay.className = 'modal-overlay active';
            modalOverlay.innerHTML = modalHtml;
            document.body.appendChild(modalOverlay);

            // キャンセルボタンのイベントリスナー
            document.getElementById('cancelApplyBtn').addEventListener('click', () => {
                closeModal();
            });

            // フォームの送信処理
            const form = document.getElementById('applyForm');
            form.onsubmit = async (e) => {
                e.preventDefault();
                const preferredLane = document.getElementById('preferredLane').value;
                const message = document.getElementById('message').value;

                if (!preferredLane) {
                    showError('希望レーンを選択してください');
                    return;
                }

                try {
                    const response = await fetch('/api/requests', {
                        method: 'POST',
                        headers: {
                            ...getAuthHeaders(),
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            postId: post._id,
                            preferredLane,
                            message
                        })
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.message || '申請に失敗しました');
                    }

                    closeModal();
                    showSuccess('申請を送信しました');
                } catch (error) {
                    console.error('申請送信エラー:', error);
                    showError(error.message);
                }
            };
        } catch (error) {
            console.error('申請エラー:', error);
            showError(error.message);
        }
    }

    // モーダルを閉じる関数
    function closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    // 投稿削除処理
    async function handleDelete(post) {
        if (!confirm('この投稿を削除してもよろしいですか？')) {
            return;
        }

        try {
            const response = await fetch(`/api/posts/${post._id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('投稿の削除に失敗しました');
            }

            showSuccess('投稿を削除しました');
            loadPosts(); // 投稿一覧を再読み込み
        } catch (error) {
            console.error('削除エラー:', error);
            showError(error.message);
        }
    }

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

    // フィルター変更時のイベントリスナー
    gameModeFilter.addEventListener('change', loadPosts);
    mainLaneFilter.addEventListener('change', loadPosts);
    rankFilter.addEventListener('change', loadPosts);

    // 初期表示
    loadPosts();
}); 