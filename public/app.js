// LoL募集掲示板 - メインアプリケーション
let currentUser = null;
let currentPartyId = null;
let messagePollingInterval = null;
let sessionRefreshInterval = null; // セッション延長用インターバル

// レーンアイコンヘルパー関数
function getLaneIconUrl(lane) {
    if (!lane) return null;
    
    // positionIMGフォルダ内の画像を使用
    const laneLower = lane.toLowerCase();
    const laneIcons = {
        // 新しいレーン名
        'top': '/positionIMG/Position_Top.png',
        'jg': '/positionIMG/Position_Jungle.png',
        'mid': '/positionIMG/Position_Mid.png',
        'bot': '/positionIMG/Position_Bot.png',
        'sup': '/positionIMG/Position_Support.png',
        'autofill': '/positionIMG/Position_Top.png', // Autofillは一時的にTopアイコンを使用
        
        // 旧レーン名（互換性）
        'jungle': '/positionIMG/Position_Jungle.png',
        'middle': '/positionIMG/Position_Mid.png',
        'adc': '/positionIMG/Position_Bot.png',
        'support': '/positionIMG/Position_Support.png',
        'fill': '/positionIMG/Position_Top.png'
    };
    
    return laneIcons[laneLower] || null;
}

// ゲームモードアイコンヘルパー関数
function getModeIconUrl(mode) {
    if (!mode) return null;
    
    // 各ゲームモードに対応する画像マッピング
    const modeLower = mode.toLowerCase();
    const modeIcons = {
        'ranked': '/rankIMG/rank.png',
        'ランク': '/rankIMG/rank.png',
        'flex': '/rankIMG/rank.png',
        'フレックス': '/rankIMG/rank.png',
        'normal': '/rankIMG/rank.png',
        'ノーマル': '/rankIMG/rank.png',
        'aram': '/rankIMG/rank.png',
        'アラム': '/rankIMG/rank.png',
        'draft': '/rankIMG/rank.png',
        'ドラフト': '/rankIMG/rank.png'
    };
    
    return modeIcons[modeLower] || '/rankIMG/rank.png';
}

// ランクアイコンURL取得
function getRankIconUrl(rankInfo) {
    if (!rankInfo || !rankInfo.tier) return null;
    
    const tierLower = rankInfo.tier.toLowerCase();
    const rankIcons = {
        'iron': '/rankIMG/Rank=Iron.png',
        'bronze': '/rankIMG/Rank=Bronze.png',
        'silver': '/rankIMG/Rank=Silver.png',
        'gold': '/rankIMG/Rank=Gold.png',
        'platinum': '/rankIMG/Rank=Platinum.png',
        'emerald': '/rankIMG/Rank=Emerald.png',
        'diamond': '/rankIMG/Rank=Diamond.png',
        'master': '/rankIMG/Rank=Master.png',
        'grandmaster': '/rankIMG/Rank=Grandmaster.png',
        'challenger': '/rankIMG/Rank=Challenger.png'
    };
    
    return rankIcons[tierLower] || null;
}

// ランク表示（アイコン付き）
function createRankDisplay(rankInfo, useIcon = true) {
    if (!rankInfo || !rankInfo.tier) {
        return 'Unranked';
    }
    
    let html = '';
    if (useIcon) {
        const iconUrl = getRankIconUrl(rankInfo);
        if (iconUrl) {
            html += `<img src="${iconUrl}" alt="${rankInfo.tier}" class="rank-icon"> `;
        }
    }
    
    html += `${rankInfo.tier} ${rankInfo.rank}`;
    if (rankInfo.leaguePoints !== undefined) {
        html += ` (${rankInfo.leaguePoints}LP)`;
    }
    
    return useIcon ? 
        `<span class="meta-item-with-icon">${html}</span>` : 
        html;
}

// レーンアイコン付きテキスト生成
function createLaneWithIcon(lane, useIcon = true) {
    if (!lane) return '';
    
    const laneIconUrl = getLaneIconUrl(lane); // 画像URLを取得
    
    let html = '';
    if (useIcon && laneIconUrl) {
        html += `<img src="${laneIconUrl}" alt="${lane}" class="lane-icon"> `;
    }
    html += lane;
    
    return useIcon ? 
        `<span class="meta-item-with-icon">${html}</span>` : 
        html;
}

// モードアイコン付きテキスト生成
function createModeWithIcon(mode, useIcon = true) {
    if (!mode) return '';
    
    const modeIconUrl = getModeIconUrl(mode);
    console.log('createModeWithIcon:', mode, 'URL:', modeIconUrl);
    
    let html = '';
    if (useIcon && modeIconUrl) {
        html += `<img src="${modeIconUrl}" alt="${mode}" class="mode-icon" 
                    onload="console.log('画像読み込み成功:', '${modeIconUrl}')" 
                    onerror="console.error('画像読み込み失敗:', '${modeIconUrl}'); this.style.display='none'"> `;
    }
    html += mode;
    
    return useIcon ? 
        `<span class="meta-item-with-icon">${html}</span>` : 
        html;
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('アプリケーション初期化開始');
    
    // URLパラメータをチェック
    const urlParams = new URLSearchParams(window.location.search);
    const errorStatus = urlParams.get('error');
    
    if (errorStatus) {
        console.log('認証エラーパラメータを検出:', errorStatus);
        // URLをクリーンアップ
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // エラーの種類に応じてメッセージを変更
        let errorMessage = '認証に失敗しました。もう一度お試しください。';
        if (errorStatus === 'discord_denied') {
            errorMessage = 'Discord認証がキャンセルされました。';
        } else if (errorStatus === 'session_failed') {
            errorMessage = 'セッションの保存に失敗しました。もう一度お試しください。';
        }
        
        showMessage(errorMessage, 'error');
    } else {
        // URLをクリーンアップ（エラーがない場合）
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // ローディング画面を表示
    showLoadingScreen();
    
    // 認証状態確認
    setTimeout(() => {
        checkAuthStatus();
    }, 100);
});

// ローディング画面表示
function showLoadingScreen() {
    console.log('ローディング画面表示');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('active');
        loadingScreen.style.display = 'flex';
        console.log('ローディング画面をアクティブに設定');
    } else {
        console.error('loading-screen要素が見つかりません');
    }
}

// ローディング画面非表示
function hideLoadingScreen() {
    console.log('ローディング画面非表示');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.remove('active');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 300);
        console.log('ローディング画面を非アクティブに設定');
    } else {
        console.error('loading-screen要素が見つかりません');
    }
}

// Discord認証状態確認
async function checkAuthStatus() {
    console.log('認証状態確認開始');
    
    const fallbackTimer = setTimeout(() => {
        console.warn('認証確認がタイムアウトしました - フォールバック処理を実行');
        hideLoadingScreen();
        showAuthScreen();
    }, 10000); // タイムアウトを10秒に延長
    
    // 最大3回まで認証確認をリトライ
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`認証確認試行 ${attempt}/3`);
            
            const response = await fetch('/auth/user', {
                credentials: 'include',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            console.log(`認証確認レスポンス (試行${attempt}):`, response.status, response.ok);
            
            if (response.ok) {
                const userData = await response.json();
                currentUser = userData;
                console.log('認証済みユーザー:', currentUser);
                clearTimeout(fallbackTimer);
                hideLoadingScreen();
                
                if (currentUser.riot_id) {
                    console.log('Riot ID設定済み - ダッシュボードを表示');
                    showDashboard();
                    updateNavUserInfo();
                    startSessionManagement(); // セッション管理開始
                } else {
                    console.log('Riot ID未設定 - 設定画面を表示');
                    showRiotIdSetup();
                    startSessionManagement(); // セッション管理開始
                }
                return; // 成功時は即座に終了
            } else if (response.status === 401) {
                // 認証エラーの場合は即座に終了
                console.log('未認証 - ログイン画面を表示');
                clearTimeout(fallbackTimer);
                hideLoadingScreen();
                showAuthScreen();
                return;
            }
            
            // 5xx エラーの場合は短い間隔でリトライ
            if (attempt < 3) {
                console.log(`サーバーエラー - ${2000 * attempt}ms後にリトライします`);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
            
        } catch (error) {
            console.error(`認証状態確認エラー (試行${attempt}):`, error);
            
            // 最後の試行でない場合はリトライ
            if (attempt < 3) {
                console.log(`ネットワークエラー - ${2000 * attempt}ms後にリトライします`);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }
    
    // 全ての試行が失敗した場合
    console.error('認証確認に3回失敗しました - ログイン画面を表示');
    clearTimeout(fallbackTimer);
    hideLoadingScreen();
    showAuthScreen();
}

// Discord認証開始
function loginWithDiscord() {
    showLoadingScreen();
    window.location.href = '/auth/discord';
}

// ログアウト
async function logout() {
    try {
        console.log('ログアウト処理開始');
        
        // セッション管理停止
        stopSessionManagement();
        
        const response = await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = null;
            console.log('ログアウト成功');
            showAuthScreen();
            showMessage('ログアウトしました', 'success');
        } else {
            console.error('ログアウトエラー:', response.status);
            showMessage('ログアウトに失敗しました', 'error');
        }
    } catch (error) {
        console.error('ログアウトエラー:', error);
        showMessage('ログアウトに失敗しました', 'error');
    }
}

// 認証チェック関数
function requireAuth() {
    if (!currentUser) {
        showMessage('ログインが必要です', 'error');
        showAuthScreen();
        return false;
    }
    return true;
}

// Riot ID設定チェック関数
function requireRiotId() {
    if (!requireAuth()) return false;
    
    if (!currentUser.riot_id) {
        showMessage('Riot IDの設定が必要です', 'error');
        showRiotIdSetup();
        return false;
    }
    return true;
}

// 画面表示関数
function showScreen(screenId) {
    // ローディング画面を非表示
    hideLoadingScreen();
    
    // すべての画面を非表示
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    
    // 指定された画面を表示
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

function showAuthScreen() {
    showScreen('auth-screen');
}

function showRiotIdSetup() {
    if (!requireAuth()) return;
    showScreen('riot-id-setup-screen');
}

function showDashboard() {
    if (!requireAuth()) return;
    showScreen('dashboard-screen');
    loadUserInfo();
}

function showAccountEdit() {
    if (!requireAuth()) return;
    showScreen('account-edit-screen');
    loadAccountEditForm();
}

function showCreatePost() {
    if (!requireRiotId()) return;
    showScreen('create-post-screen');
}

function showBoard() {
    showScreen('board-screen');
    console.log('募集掲示板画面を表示');
    // 投稿一覧を読み込み
    loadPosts().catch(error => {
        console.error('投稿読み込みエラー:', error);
        showMessage('投稿の読み込みに失敗しました', 'error');
    });
}

function showMyPosts() {
    showScreen('my-posts-screen');
    console.log('投稿管理画面を表示');
    // 自分の投稿一覧を読み込み
    loadMyPosts().catch(error => {
        console.error('投稿読み込みエラー:', error);
        showMessage('投稿の読み込みに失敗しました', 'error');
    });
}

function showApplications() {
    showScreen('applications-screen');
    console.log('申請管理画面を表示');
    // 申請一覧を読み込み
    loadApplications().catch(error => {
        console.error('申請読み込みエラー:', error);
        showMessage('申請の読み込みに失敗しました', 'error');
    });
}

function showParties() {
    showScreen('parties-screen');
    console.log('パーティー画面を表示');
    // パーティー一覧を読み込み
    loadParties().catch(error => {
        console.error('パーティー読み込みエラー:', error);
        showMessage('パーティーの読み込みに失敗しました', 'error');
    });
}

function showPartyDetail(partyId) {
    if (!requireRiotId()) return;
    currentPartyId = partyId;
    showScreen('party-detail-screen');
    loadPartyDetail(partyId);
    startMessagePolling();
}

// ナビゲーションのユーザー情報更新
function updateNavUserInfo() {
    const navUserInfo = document.getElementById('nav-user-info');
    if (currentUser && navUserInfo) {
        navUserInfo.innerHTML = `
            <img src="${currentUser.avatar_url}" alt="Avatar" class="user-avatar">
            <span style="color: var(--text-primary); font-weight: 600;">${currentUser.display_name}</span>
        `;
    } else if (navUserInfo) {
        navUserInfo.innerHTML = '';
    }
}

// Riot ID設定
document.getElementById('riot-id-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const riotId = document.getElementById('riot-id').value.trim();
    if (!riotId) {
        showMessage('Riot IDを入力してください', 'error');
        return;
    }

    try {
        const response = await fetch('/auth/setup-riot-id', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'include',
            body: JSON.stringify({ riot_id: riotId })
        });

        const result = await response.json();
        console.log('Riot ID設定レスポンス:', response.status, result);
        
        if (response.ok && result.success) {
            currentUser.riot_id = riotId;
            showMessage('Riot IDが設定されました！', 'success');
            showDashboard();
            updateNavUserInfo();
        } else {
            const errorMessage = result.message || result.error || 'Riot ID設定に失敗しました';
            showMessage(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Riot ID設定エラー:', error);
        showMessage('設定中にエラーが発生しました', 'error');
    }
});

// ユーザー情報読み込み
async function loadUserInfo() {
    try {
        const response = await fetch('/auth/user');
        if (response.ok) {
            currentUser = await response.json();
            displayUserInfo();
            updateDashboardWelcome();
        }
    } catch (error) {
        console.error('ユーザー情報の読み込みエラー:', error);
    }
}

function displayUserInfo() {
    const userInfoDiv = document.getElementById('user-info');
    if (!userInfoDiv || !currentUser) return;

    let html = `
        <div class="user-display">
            ${currentUser.avatar_url ? 
                `<img src="${currentUser.avatar_url}" alt="Avatar" class="user-avatar-large">` :
                `<div class="user-avatar-placeholder">👤</div>`
            }
            <div class="user-details">
                <div class="display-name">${currentUser.display_name || 'Unknown'}</div>
                <div class="username">@${currentUser.username || 'unknown'}</div>
                ${currentUser.riot_id ? `<div class="riot-id">🎮 ${currentUser.riot_id}</div>` : ''}
            </div>
        </div>
    `;

    // Riot API情報を表示
    if (currentUser.riot_account_info) {
        const riotInfo = currentUser.riot_account_info;
        html += `
            <div class="riot-account-info">
                <div class="summoner-info">⚔️ ${riotInfo.name || riotInfo.summonerName || currentUser.riot_id || 'Unknown'} (Level ${riotInfo.summonerLevel || 0})</div>
                <div class="rank-container">
        `;

        if (riotInfo.rankedSolo) {
            const soloDisplay = createRankDisplay(riotInfo.rankedSolo, true);
            html += `
                <div class="profile-rank-item">
                    ${soloDisplay}
                </div>
            `;
        }

        if (riotInfo.rankedFlex) {
            const flexDisplay = createRankDisplay(riotInfo.rankedFlex, true);
            html += `
                <div class="profile-rank-item">
                    ${flexDisplay}
                </div>
            `;
        }

        if (!riotInfo.rankedSolo && !riotInfo.rankedFlex) {
            html += `
                <div class="profile-rank-item">
                    Unranked
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    } else if (currentUser.riot_id) {
        // Riot API情報が取得できない場合でも、登録済みのRiot IDを表示
        html += `
            <div class="riot-account-info">
                <div class="summoner-info">⚔️ ${currentUser.riot_id} (Level 不明)</div>
                <div class="riot-info-error">
                    Riot APIからランク情報を取得できませんでした
                </div>
            </div>
        `;
    }

    userInfoDiv.innerHTML = html;
}

function updateDashboardWelcome() {
    const welcomeElement = document.getElementById('dashboard-welcome');
    if (welcomeElement && currentUser) {
        welcomeElement.textContent = `${currentUser.display_name} さん、リフトでの冒険を始めましょう！`;
    }
}

// アカウント編集
function loadAccountEditForm() {
    if (!currentUser) return;
    
    document.getElementById('edit-display-name').value = currentUser.display_name || '';
    document.getElementById('edit-riot-id').value = currentUser.riot_id || '';
}

document.getElementById('account-edit-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const displayName = document.getElementById('edit-display-name').value.trim();
    const riotId = document.getElementById('edit-riot-id').value.trim();
    
    if (!displayName) {
        showMessage('表示名を入力してください', 'error');
        return;
    }

    try {
        const response = await fetch('/auth/update-account', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                display_name: displayName,
                riot_id: riotId 
            })
        });

        const result = await response.json();
        
        if (response.ok) {
            currentUser.display_name = displayName;
            currentUser.riot_id = riotId;
            showMessage('アカウント情報を更新しました', 'success');
            showDashboard();
            updateNavUserInfo();
        } else {
            showMessage(result.error || 'アカウント更新に失敗しました', 'error');
        }
    } catch (error) {
        console.error('アカウント更新エラー:', error);
        showMessage('更新中にエラーが発生しました', 'error');
    }
});

// 募集投稿作成
document.getElementById('create-post-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('post-title').value.trim(),
        mode: document.getElementById('post-mode').value,
        rank: document.getElementById('post-rank').value,
        lane: document.getElementById('post-lane').value,
        description: document.getElementById('post-description').value.trim()
    };

    if (!formData.title || !formData.mode || !formData.rank || !formData.lane) {
        showMessage('必須項目をすべて入力してください', 'error');
        return;
    }

    try {
        const response = await fetch('/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (response.ok) {
            showMessage('募集投稿を作成しました！', 'success');
            document.getElementById('create-post-form').reset();
            showBoard();
        } else {
            showMessage(result.error || '投稿作成に失敗しました', 'error');
        }
    } catch (error) {
        console.error('投稿作成エラー:', error);
        showMessage('投稿作成中にエラーが発生しました', 'error');
    }
});

// 募集投稿一覧読み込み
async function loadPosts() {
    try {
        const rankFilter = document.getElementById('filter-rank')?.value || '';
        const modeFilter = document.getElementById('filter-mode')?.value || '';
        
        let url = '/posts';
        const params = new URLSearchParams();
        if (rankFilter) params.append('rank', rankFilter);
        if (modeFilter) params.append('mode', modeFilter);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayPosts(result.posts);
        } else {
            showMessage(result.message || '投稿の読み込みに失敗しました', 'error');
        }
    } catch (error) {
        console.error('投稿読み込みエラー:', error);
        showMessage('投稿の読み込み中にエラーが発生しました', 'error');
    }
}

function displayPosts(posts) {
    const postsDiv = document.getElementById('recruitment-posts');
    if (!postsDiv) return;

    if (posts.length === 0) {
        postsDiv.innerHTML = `
            <div class="empty-state">
                <p>現在募集投稿はありません</p>
            </div>
        `;
        return;
    }

    const postsHtml = posts.map(post => {
        // 投稿主の情報を決定
        let authorInfo = `👤 投稿者: ${escapeHtml(post.users?.username || post.username || 'Unknown')}`;
        
        // 投稿主かどうかをチェック
        if (currentUser && post.user_id === currentUser.id) {
            // 自分の投稿の場合 - Riot IDとランクの両方を表示
            if (post.users?.riot_id || post.riot_id) {
                authorInfo += ` | 🆔 ${escapeHtml(post.users?.riot_id || post.riot_id)}`;
            }
            
            // 自分のランク情報を表示
            if (currentUser.riot_account_info) {
                const riotInfo = currentUser.riot_account_info;
                if (riotInfo.rankedSolo) {
                    const rankDisplay = createRankDisplay(riotInfo.rankedSolo);
                    authorInfo += ` | ${rankDisplay}`;
                } else if (riotInfo.rankedFlex) {
                    const rankDisplay = createRankDisplay(riotInfo.rankedFlex);
                    authorInfo += ` | ${rankDisplay}`;
                }
            }
        } else {
            // 他人の投稿の場合 - ランクのみ表示（承認されている場合はRiot IDも表示）
            
            // 承認済み申請があるかチェック
            const isApproved = post.user_approved_application;
            
            if (isApproved && (post.users?.riot_id || post.riot_id)) {
                authorInfo += ` | 🆔 ${escapeHtml(post.users?.riot_id || post.riot_id)}`;
            }
            
            // ランク情報を表示
            if (post.author_rank_info) {
                // サーバーから送信されるランク情報を使用
                if (post.author_rank_info.rankedSolo) {
                    const rankDisplay = createRankDisplay(post.author_rank_info.rankedSolo);
                    authorInfo += ` | ${rankDisplay}`;
                } else if (post.author_rank_info.rankedFlex) {
                    const rankDisplay = createRankDisplay(post.author_rank_info.rankedFlex);
                    authorInfo += ` | ${rankDisplay}`;
                }
            }
        }

        // 投稿ランクのアイコン表示
        const postRankMatch = (post.rank || '').match(/(\w+)/);
        const postRankTier = postRankMatch ? postRankMatch[1] : post.rank;
        const postRankObj = { tier: postRankTier, rank: '' };
        const postRankDisplay = createRankDisplay(postRankObj);

        return `
            <div class="post-card">
                <div class="post-header">
                    <div>
                        <h3 class="post-title">${escapeHtml(post.title || '')}</h3>
                        <div class="post-meta">
                            ${createModeWithIcon(post.mode)}
                            ${postRankDisplay}
                            ${createLaneWithIcon(post.lane)}
                            <span class="meta-item-with-icon">📅 ${formatDate(post.created_at)}</span>
                        </div>
                    </div>
                </div>
                
                ${post.description ? `
                    <div class="post-description">
                        ${escapeHtml(post.description)}
                    </div>
                ` : ''}
                
                <div class="post-author">
                    ${authorInfo}
                </div>
                
                ${post.user_id !== currentUser?.id ? `
                    <div class="post-actions">
                        <button class="btn" onclick="showApplyModal(${post.id})">
                            ⚔️ 参加申請
                        </button>
                    </div>
                ` : `
                    <div class="post-actions">
                        <span style="color: var(--text-secondary); font-style: italic;">
                            あなたの投稿です
                        </span>
                    </div>
                `}
            </div>
        `;
    }).join('');

    postsDiv.innerHTML = postsHtml;
}

// 自分の投稿読み込み
async function loadMyPosts() {
    try {
        const response = await fetch('/my-posts');
        const result = await response.json();
        
        if (result.success) {
            displayMyPosts(result.posts);
        } else {
            showMessage(result.message || '投稿の読み込みに失敗しました', 'error');
        }
    } catch (error) {
        console.error('自分の投稿読み込みエラー:', error);
        showMessage('投稿の読み込み中にエラーが発生しました', 'error');
    }
}

function displayMyPosts(posts) {
    const postsDiv = document.getElementById('my-posts-list');
    if (!postsDiv) return;

    if (posts.length === 0) {
        postsDiv.innerHTML = `
            <div class="empty-state">
                <p>まだ投稿がありません</p>
                <button class="btn" onclick="showCreatePost()" style="margin-top: 1rem;">
                    最初の募集を作成
                </button>
            </div>
        `;
        return;
    }

    const postsHtml = posts.map(post => {
        // 投稿ランクのアイコン表示
        const postRankMatch = post.rank.match(/(\w+)/);
        const postRankTier = postRankMatch ? postRankMatch[1] : post.rank;
        const postRankObj = { tier: postRankTier, rank: '' };
        const postRankDisplay = createRankDisplay(postRankObj);

        return `
            <div class="my-post-item">
                <div class="my-post-header">
                    <h4 class="my-post-title">${escapeHtml(post.title)}</h4>
                    <div class="my-post-actions">
                        <button class="btn-small btn-edit" onclick="editPost(${post.id})">編集</button>
                        <button class="btn-small btn-delete" onclick="deletePost(${post.id})">削除</button>
                    </div>
                </div>
                <div class="post-meta">
                    ${createModeWithIcon(post.mode)}
                    ${postRankDisplay}
                    ${createLaneWithIcon(post.lane)}
                    <span class="meta-item-with-icon">📅 ${formatDate(post.created_at)}</span>
                </div>
                ${post.description ? `
                    <div class="post-description" style="margin-top: 1rem;">
                        ${escapeHtml(post.description)}
                    </div>
                ` : ''}
                <div style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                    申請数: ${post.application_count || 0}件
                </div>
            </div>
        `;
    }).join('');

    postsDiv.innerHTML = postsHtml;
}

// 投稿編集・削除
async function editPost(postId) {
    // TODO: 投稿編集機能の実装
    showMessage('投稿編集機能は開発中です', 'error');
}

async function deletePost(postId) {
    if (!confirm('この投稿を削除しますか？')) return;

    try {
        const response = await fetch(`/posts/${postId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showMessage('投稿を削除しました', 'success');
            loadMyPosts();
        } else {
            const result = await response.json();
            showMessage(result.error || '投稿削除に失敗しました', 'error');
        }
    } catch (error) {
        console.error('投稿削除エラー:', error);
        showMessage('削除中にエラーが発生しました', 'error');
    }
}

// 参加申請モーダル
function showApplyModal(postId) {
    document.getElementById('apply-post-id').value = postId;
    document.getElementById('apply-modal').style.display = 'flex';
}

function closeApplyModal() {
    document.getElementById('apply-modal').style.display = 'none';
    document.getElementById('apply-form').reset();
}

// モーダル外クリックで閉じる
document.getElementById('apply-modal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeApplyModal();
    }
});

// 参加申請送信
document.getElementById('apply-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const postId = document.getElementById('apply-post-id').value;
    const lane = document.getElementById('apply-lane').value;
    const message = document.getElementById('apply-message').value.trim();

    if (!lane) {
        showMessage('希望レーンを選択してください', 'error');
        return;
    }

    try {
        const response = await fetch('/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postId: postId,
                lane: lane,
                message: message
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showMessage(result.message || '参加申請を送信しました！', 'success');
            closeApplyModal();
        } else {
            showMessage(result.message || '申請送信に失敗しました', 'error');
        }
    } catch (error) {
        console.error('申請送信エラー:', error);
        showMessage('申請送信中にエラーが発生しました', 'error');
    }
});

// 申請管理
async function loadApplications() {
    try {
        const response = await fetch('/applications');
        const result = await response.json();
        
        if (result.success) {
            displayApplications(result.applications);
        } else {
            showMessage(result.message || '申請の読み込みに失敗しました', 'error');
        }
    } catch (error) {
        console.error('申請読み込みエラー:', error);
        showMessage('申請の読み込み中にエラーが発生しました', 'error');
    }
}

function displayApplications(applications) {
    const applicationsDiv = document.getElementById('applications-list');
    if (!applicationsDiv) return;

    if (applications.length === 0) {
        applicationsDiv.innerHTML = `
            <div class="empty-state">
                <p>現在申請はありません</p>
            </div>
        `;
        return;
    }

    const applicationsHtml = applications.map(app => {
        // 申請者のランク情報表示
        let applicantInfo = `👤 申請者: ${escapeHtml(app.users?.display_name || app.applicant_username || 'Unknown')}`;
        
        // 申請者のランク情報があれば表示
        if (app.applicant_rank_info) {
            if (app.applicant_rank_info.rankedSolo) {
                const rankDisplay = createRankDisplay(app.applicant_rank_info.rankedSolo);
                applicantInfo += ` | ${rankDisplay}`;
            } else if (app.applicant_rank_info.rankedFlex) {
                const rankDisplay = createRankDisplay(app.applicant_rank_info.rankedFlex);
                applicantInfo += ` | ${rankDisplay}`;
            }
        }
        
        // 承認済みの場合は申請者のRiot IDも表示
        if (app.status === 'accepted' && app.users?.riot_id) {
            applicantInfo += ` | 🆔 ${escapeHtml(app.users.riot_id)}`;
        }

        return `
            <div class="application-item">
                <div class="application-header">
                    <h4 class="application-post-title">${escapeHtml(app.recruitment_posts?.title || app.post_title || '投稿')}</h4>
                    <span class="application-status status-${app.status}">${getStatusText(app.status)}</span>
                </div>
                
                <div class="application-details">
                    <div class="application-detail">
                        ${applicantInfo}
                    </div>
                    <div class="application-detail">
                        <strong>希望レーン:</strong> ${createLaneWithIcon(app.lane)}
                    </div>
                    <div class="application-detail">
                        <strong>申請日時:</strong> ${formatDate(app.created_at)}
                    </div>
                </div>
                
                ${app.message ? `
                    <div class="application-message">
                        💬 メッセージ: ${escapeHtml(app.message)}
                    </div>
                ` : ''}
                
                ${app.status === 'pending' ? `
                    <div class="application-actions">
                        <button class="btn-accept" onclick="handleApplication(${app.id}, 'accepted')">
                            ✅ 承認
                        </button>
                        <button class="btn-reject" onclick="handleApplication(${app.id}, 'rejected')">
                            ❌ 拒否
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    applicationsDiv.innerHTML = applicationsHtml;
}

function getStatusText(status) {
    switch (status) {
        case 'pending': return '審査中';
        case 'accepted': return '承認済み';
        case 'rejected': return '拒否済み';
        default: return '不明';
    }
}

// 申請処理
async function handleApplication(applicationId, action) {
    const actionText = action === 'accepted' ? '承認' : '拒否';
    
    if (!confirm(`この申請を${actionText}しますか？`)) return;

    try {
        const response = await fetch(`/applications/${applicationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: action })
        });

        const result = await response.json();
        
        if (result.success) {
            showMessage(result.message || `申請を${actionText}しました`, 'success');
            loadApplications();
            
            if (action === 'accepted' && result.party_id) {
                showMessage('パーティーが作成されました！', 'success');
            }
        } else {
            showMessage(result.message || `申請${actionText}に失敗しました`, 'error');
        }
    } catch (error) {
        console.error(`申請${actionText}エラー:`, error);
        showMessage(`申請${actionText}中にエラーが発生しました`, 'error');
    }
}

// パーティー管理
async function loadParties() {
    try {
        const response = await fetch('/parties');
        const result = await response.json();
        
        if (result.success) {
            displayParties(result.parties);
        } else {
            showMessage(result.message || 'パーティーの読み込みに失敗しました', 'error');
        }
    } catch (error) {
        console.error('パーティー読み込みエラー:', error);
        showMessage('パーティーの読み込み中にエラーが発生しました', 'error');
    }
}

function displayParties(parties) {
    const partiesDiv = document.getElementById('parties-list');
    if (!partiesDiv) return;

    if (parties.length === 0) {
        partiesDiv.innerHTML = `
            <div class="empty-parties">
                <p>参加中のパーティーはありません</p>
            </div>
        `;
        return;
    }

    const partiesHtml = parties.map(party => {
        // パーティーランクのアイコン表示
        const partyRankMatch = party.rank.match(/(\w+)/);
        const partyRankTier = partyRankMatch ? partyRankMatch[1] : party.rank;
        const partyRankObj = { tier: partyRankTier, rank: '' };
        const partyRankDisplay = createRankDisplay(partyRankObj);

        return `
            <div class="party-item">
                <div class="party-header">
                    <h4 class="party-name">${escapeHtml(party.name)}</h4>
                    <span class="party-role role-${party.user_role}">${party.user_role === 'leader' ? 'リーダー' : 'メンバー'}</span>
                </div>
                
                <div class="party-info">
                    <span class="meta-item-with-icon">👥 ${party.member_count}人</span>
                    ${createModeWithIcon(party.mode)}
                    ${partyRankDisplay}
                </div>
                
                <div class="party-created">
                    📅 作成日: ${formatDate(party.created_at)}
                </div>
                
                <button class="enter-party-btn" onclick="showPartyDetail(${party.id})">
                    パーティーに入る
                </button>
            </div>
        `;
    }).join('');

    partiesDiv.innerHTML = partiesHtml;
}

// パーティー詳細
async function loadPartyDetail(partyId) {
    try {
        const [membersResponse, messagesResponse] = await Promise.all([
            fetch(`/parties/${partyId}/members`),
            fetch(`/parties/${partyId}/messages`)
        ]);

        const membersResult = await membersResponse.json();
        const messagesResult = await messagesResponse.json();
        
        if (membersResult.success && messagesResult.success) {
            displayPartyMembers(membersResult.members);
            displayPartyMessages(messagesResult.messages);
        } else {
            showMessage('パーティー情報の読み込みに失敗しました', 'error');
        }
    } catch (error) {
        console.error('パーティー詳細読み込みエラー:', error);
        showMessage('パーティー情報の読み込み中にエラーが発生しました', 'error');
    }
}

function displayPartyMembers(members) {
    const membersDiv = document.getElementById('party-members-list');
    if (!membersDiv) return;

    const membersHtml = members.map(member => {
        // ランク情報の解析とアイコン生成
        let rankDisplay = '';
        if (member.riotInfo && member.riotInfo.rankedSolo) {
            rankDisplay = createRankDisplay(member.riotInfo.rankedSolo);
        } else if (member.riotInfo && member.riotInfo.rankedFlex) {
            rankDisplay = createRankDisplay(member.riotInfo.rankedFlex);
        }

        return `
            <div class="member-card">
                ${member.avatar ? 
                    `<img src="${member.avatar}" alt="Avatar" class="member-avatar">` :
                    `<div class="member-avatar" style="background: var(--accent-gold); display: flex; align-items: center; justify-content: center; color: var(--primary-bg); font-weight: bold;">👤</div>`
                }
                <div class="member-info">
                    <h4>${escapeHtml(member.display_name)}</h4>
                    <div class="member-rank">
                        ${member.riot_id ? `🎮 ${member.riot_id}` : ''}
                        ${rankDisplay ? ` | ${rankDisplay}` : ''}
                        ${member.lane ? ` | ${createLaneWithIcon(member.lane)}` : ''}
                    </div>
                    ${member.role === 'leader' ? `
                        <div style="color: var(--accent-gold); font-weight: 600; font-size: 0.875rem; margin-top: 0.25rem;">
                            👑 リーダー
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    membersDiv.innerHTML = membersHtml;
}

function displayPartyMessages(messages) {
    const messagesDiv = document.getElementById('party-messages');
    if (!messagesDiv) return;

    if (messages.length === 0) {
        messagesDiv.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 2rem; font-style: italic;">
                まだメッセージがありません
            </div>
        `;
        return;
    }

    const messagesHtml = messages.map(message => `
        <div class="message ${message.user_id === currentUser?.id ? 'own' : ''}">
            ${message.avatar_url ? 
                `<img src="${message.avatar_url}" alt="Avatar" class="message-avatar">` :
                `<div class="message-avatar" style="background: var(--accent-gold); display: flex; align-items: center; justify-content: center; color: var(--primary-bg); font-weight: bold; font-size: 1rem;">👤</div>`
            }
            <div class="message-content">
                <div class="message-author">${escapeHtml(message.display_name)}</div>
                <div class="message-text">${escapeHtml(message.content)}</div>
                <div class="message-time">${formatTimeAgo(message.created_at)}</div>
            </div>
        </div>
    `).join('');

    messagesDiv.innerHTML = messagesHtml;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// メッセージ送信
function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content || !currentPartyId) return;

    sendPartyMessage(currentPartyId, content);
    messageInput.value = '';
}

async function sendPartyMessage(partyId, content) {
    try {
        const response = await fetch(`/parties/${partyId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content })
        });

        const result = await response.json();
        
        if (result.success) {
            // メッセージが送信されたら、すぐに最新メッセージを読み込む
            const messagesResponse = await fetch(`/parties/${partyId}/messages`);
            const messagesResult = await messagesResponse.json();
            if (messagesResult.success) {
                displayPartyMessages(messagesResult.messages);
            }
        } else {
            showMessage(result.message || 'メッセージ送信に失敗しました', 'error');
        }
    } catch (error) {
        console.error('メッセージ送信エラー:', error);
        showMessage('メッセージ送信中にエラーが発生しました', 'error');
    }
}

// メッセージ自動更新
function startMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }
    
    messagePollingInterval = setInterval(() => {
        if (currentPartyId) {
            loadPartyMessages();
        }
    }, 5000); // 5秒ごとに更新
}

function stopMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}

async function loadPartyMessages() {
    if (!currentPartyId) return;
    
    try {
        const response = await fetch(`/parties/${currentPartyId}/messages`);
        const result = await response.json();
        if (result.success) {
            displayPartyMessages(result.messages);
        }
    } catch (error) {
        console.error('メッセージ読み込みエラー:', error);
    }
}

// ユーティリティ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'たった今';
    if (diffInMinutes < 60) return `${diffInMinutes}分前`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}時間前`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}日前`;
    
    return formatDate(dateString);
}

function showMessage(message, type = 'success') {
    const messageElement = document.getElementById('toast-message');
    const toastElement = document.getElementById('toast');
    
    if (!messageElement || !toastElement) {
        // fallback to console if elements don't exist
        console.log('Message:', message, 'Type:', type);
        alert(message);
        return;
    }
    
    messageElement.textContent = message;
    
    // Reset all classes
    toastElement.classList.remove('show', 'success', 'error', 'warning');
    
    // Add appropriate class
    toastElement.classList.add('show', type);
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        toastElement.classList.remove('show');
    }, 5000);
}

// パーティー詳細画面を離れる時にポーリングを停止
window.addEventListener('beforeunload', () => {
    stopMessagePolling();
});

// 画面切り替え時にポーリングを管理
const originalShowScreen = showScreen;
showScreen = function(screenId) {
    if (screenId !== 'party-detail-screen') {
        stopMessagePolling();
        currentPartyId = null;
    }
    originalShowScreen(screenId);
};

// セッション管理機能
function startSessionManagement() {
    console.log('セッション管理を開始');
    
    // 30分ごとにセッションを延長
    sessionRefreshInterval = setInterval(async () => {
        if (currentUser) {
            try {
                const response = await fetch('/api/refresh-session', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('セッション自動延長成功:', result.expiresAt);
                } else {
                    console.warn('セッション延長失敗 - 再ログインが必要な可能性があります');
                }
            } catch (error) {
                console.error('セッション延長エラー:', error);
            }
        }
    }, 30 * 60 * 1000); // 30分間隔
}

function stopSessionManagement() {
    if (sessionRefreshInterval) {
        clearInterval(sessionRefreshInterval);
        sessionRefreshInterval = null;
        console.log('セッション管理を停止');
    }
}