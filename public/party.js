document.addEventListener('DOMContentLoaded', async () => {
    // 認証チェック
    if (!await checkAuth()) {
        console.log('認証チェック失敗');
        return;
    }

    console.log('パーティーページ初期化開始');

    // ナビゲーション初期化
    const profile = await initializeNavigation();
    if (!profile) return;

    const partyContainer = document.getElementById('partyContainer');
    const noPartyMessage = document.getElementById('noPartyMessage');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');

    let currentParty = null;
    let pusherChannel = null;

    // Pusher接続を設定
    const pusher = new Pusher('8ebcc71b2fe50be4967d', {
        cluster: 'ap3'
    });

    // チャットメッセージを追加
    function addChatMessage(message) {
        const isOwnMessage = message.sender._id === profile.username;
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isOwnMessage ? 'own-message' : ''}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <img src="${message.sender.summonerInfo.iconUrl}" alt="" class="message-avatar">
            <div class="message-info">
                <span class="message-sender">${message.sender.displayName}</span>
                <div class="message-content">${message.content}</div>
                <span class="message-time">${time}</span>
            </div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // パーティー情報を表示
    function displayParty(party) {
        currentParty = party;
        
        if (!party) {
            partyContainer.style.display = 'none';
            noPartyMessage.style.display = 'block';
            return;
        }

        partyContainer.style.display = 'grid';
        noPartyMessage.style.display = 'none';

        // ゲームモードと作成日時を表示
        document.querySelector('.game-mode').textContent = getGameModeDisplay(party.post.gameMode);
        document.querySelector('.created-at').textContent = `作成: ${new Date(party.createdAt).toLocaleString()}`;

        // パーティー解散ボタンを表示（投稿主のみ）
        const partyHeader = document.querySelector('.party-header');
        const existingButton = partyHeader.querySelector('.disband-btn');
        if (existingButton) {
            existingButton.remove();
        }

        if (party.post.author._id === profile.username) {
            const disbandButton = document.createElement('button');
            disbandButton.className = 'disband-btn';
            disbandButton.textContent = 'パーティーを解散';
            disbandButton.onclick = disbandParty;
            partyHeader.appendChild(disbandButton);
        }

        // メンバーリストを表示
        const membersList = document.querySelector('.members-list');
        membersList.innerHTML = party.members.map(member => {
            const soloRank = member.summonerInfo.ranks.find(r => r.queueType === 'RANKED_SOLO_5x5');
            const rankDisplay = soloRank ? `${soloRank.tier} ${soloRank.rank}` : 'UNRANKED';
            const rankImageFile = soloRank && soloRank.tier !== 'UNRANKED' ? 
                `Rank=${soloRank.tier}.png` : 'Rank=Unranked.png';

            return `
                <div class="member-item">
                    <img src="${member.summonerInfo.iconUrl}" alt="" class="member-image">
                    <div class="member-info">
                        <div class="member-name-container">
                            <span class="member-name">${member.displayName}</span>
                            <span class="member-summoner-name">${member.summonerName}</span>
                        </div>
                        <div class="member-details">
                            <div class="member-rank-info">
                                <img src="/rankIMG/${rankImageFile}" alt="${rankDisplay}" class="rank-icon">
                                <span class="rank-text">${rankDisplay}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 既存のチャットメッセージを表示
        chatMessages.innerHTML = '';
        if (party.chat && party.chat.messages) {
            party.chat.messages.forEach(addChatMessage);
        }

        // Pusherチャンネルの購読
        if (pusherChannel) {
            pusherChannel.unsubscribe();
        }
        pusherChannel = pusher.subscribe(`party-${party._id}`);
        pusherChannel.bind('chat-message', addChatMessage);
    }

    // ゲームモードの表示名を取得
    function getGameModeDisplay(gameMode) {
        const modes = {
            'RANKED_SOLO': 'ランク（ソロ/デュオ）',
            'RANKED_FLEX': 'ランク（フレックス）',
            'NORMAL': 'ノーマル',
            'ARAM': 'ARAM'
        };
        return modes[gameMode] || gameMode;
    }

    // パーティー情報を取得
    async function fetchParty() {
        try {
            const response = await fetch('/api/party', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('パーティー情報の取得に失敗しました');
            }

            const party = await response.json();
            displayParty(party);
        } catch (error) {
            console.error('パーティー取得エラー:', error);
            showError(error.message);
        }
    }

    // チャットメッセージを送信
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const content = messageInput.value.trim();
        if (!content || !currentParty) return;

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    partyId: currentParty._id,
                    message: content
                })
            });

            if (!response.ok) {
                throw new Error('メッセージの送信に失敗しました');
            }

            messageInput.value = '';
        } catch (error) {
            console.error('メッセージ送信エラー:', error);
            showError(error.message);
        }
    });

    // エラーメッセージを表示
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.querySelector('.main-content').insertBefore(errorDiv, partyContainer);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    // パーティー解散
    async function disbandParty() {
        try {
            const response = await fetch('/api/party/disband', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('パーティーの解散に失敗しました');
            }

            window.location.href = '/matching.html';
        } catch (error) {
            console.error('パーティー解散エラー:', error);
            showError(error.message);
        }
    }

    // 初期表示
    await fetchParty();

    // 定期的にパーティー情報を更新
    setInterval(fetchParty, 10000);
}); 