const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const Pusher = require('pusher');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const User = require('./models/User');
const app = express();
const http = require('http').createServer(app);
require('dotenv').config();

// MongoDBの接続
const MONGODB_URI = 'mongodb+srv://FiroRooM:Meister1192@cluster0.y0pfixe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
console.log('MongoDB URI:', MONGODB_URI.replace(/:[^:]*@/, ':****@')); // パスワードを隠して表示

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB接続成功'))
    .catch(err => {
        console.error('MongoDB接続エラー:', err);
        console.log('接続状態:', mongoose.connection.readyState);
        // 接続状態の意味:
        // 0: 切断
        // 1: 接続済み
        // 2: 接続中
        // 3: 切断中
    });

// ミドルウェアの設定
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://rallyleague.onrender.com'  // 実際のRenderドメイン
        : 'http://localhost:3000',
    credentials: true  // Cookie送信を許可
}));
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser()); // Cookieパーサーを追加

// JWT秘密鍵
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 認証ミドルウェア
const authenticateToken = (req, res, next) => {
    console.log('認証チェック開始');
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('トークンが見つかりません');
        return res.status(401).json({ message: '認証が必要です' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log('トークン検証エラー:', err.message);
            return res.status(403).json({ message: 'トークンが無効です' });
        }
        console.log('認証成功:', user.username);
        req.user = user;
        next();
    });
};

// Pusherの設定
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || "2017501",
    key: process.env.PUSHER_KEY || "8ebcc71b2fe50be4967d",
    secret: process.env.PUSHER_SECRET || "8576902a981f5b20ebfe",
    cluster: process.env.PUSHER_CLUSTER || "ap3",
    useTLS: true
});

// Riot API設定
const RIOT_API_KEY = process.env.RIOT_API_KEY;
if (!RIOT_API_KEY) {
    console.error('警告: RIOT_API_KEYが設定されていません。.envファイルを確認してください。');
}
const RIOT_API_BASE_URL = 'https://jp1.api.riotgames.com';
const RIOT_API_ASIA_URL = 'https://asia.api.riotgames.com';

// Riot APIを使用してサモナー情報を取得する関数
async function getSummonerByName(riotId) {
    try {
        console.log(`サモナー情報を取得: ${riotId}`);
        
        // Riot IDをゲーム名とタグラインに分割
        const [gameName, tagLine] = riotId.split('#').map(part => part.trim());
        if (!gameName || !tagLine) {
            throw new Error('無効なRiot IDの形式です。"ゲーム名#タグライン"の形式で入力してください。');
        }

        // まずアカウントのPUUIDを取得
        const accountResponse = await axios.get(
            `${RIOT_API_ASIA_URL}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
            {
                headers: {
                    'X-Riot-Token': RIOT_API_KEY
                }
            }
        );
        console.log('アカウント情報取得成功:', accountResponse.data);
        const puuid = accountResponse.data.puuid;

        // PUUIDを使用してサモナー情報を取得
        const summonerResponse = await axios.get(
            `${RIOT_API_BASE_URL}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
            {
                headers: {
                    'X-Riot-Token': RIOT_API_KEY
                }
            }
        );
        console.log('サモナー情報取得成功:', summonerResponse.data);
        const summoner = summonerResponse.data;

        // ランク情報を取得
        const rankResponse = await axios.get(
            `${RIOT_API_BASE_URL}/lol/league/v4/entries/by-puuid/${puuid}`,
            {
                headers: {
                    'X-Riot-Token': RIOT_API_KEY
                }
            }
        );
        console.log('ランク情報取得成功:', rankResponse.data);
        const ranks = rankResponse.data;

        // アイコン画像のURL
        const iconUrl = `http://ddragon.leagueoflegends.com/cdn/13.24.1/img/profileicon/${summoner.profileIconId}.png`;

        return {
            name: `${gameName} #${tagLine}`,
            level: summoner.summonerLevel,
            iconUrl: iconUrl,
            ranks: ranks.map(rank => ({
                queueType: rank.queueType,
                tier: rank.tier,
                rank: rank.rank,
                leaguePoints: rank.leaguePoints,
                wins: rank.wins,
                losses: rank.losses
            }))
        };
    } catch (error) {
        console.error('Riot API error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
            url: error.config?.url
        });

        if (error.response?.status === 403) {
            throw new Error('Riot APIへのアクセスが拒否されました');
        } else if (error.response?.status === 404) {
            throw new Error('指定されたRiot IDのアカウントが見つかりません');
        } else {
            throw new Error('サモナー情報の取得に失敗しました: ' + (error.response?.data?.status?.message || error.message));
        }
    }
}

// インメモリユーザーストレージ
const users = new Map();

// 投稿データを保存するMap
const posts = new Map();

// 申請データを保存するMap
const requests = new Map();

// パーティーデータを保存するMap
const parties = new Map();

// チャットメッセージを処理する関数
const handleChatMessage = async (partyId, message, user) => {
    try {
        const party = parties.get(partyId);
        if (!party) {
            console.error('パーティーが見つかりません:', partyId);
            return false;
        }

        // メンバーかどうかを確認
        const member = party.members.find(m => m._id === user.username);
        if (!member) {
            console.error('パーティーメンバーではありません:', user.username);
            return false;
        }

        // チャットメッセージを作成
        const chatMessage = {
            type: 'chat',
            content: message,
            sender: {
                _id: user.username,
                displayName: member.displayName,
                summonerName: member.summonerName,
                summonerInfo: member.summonerInfo
            },
            timestamp: new Date()
        };

        // パーティーのチャット履歴に追加
        if (!party.chat) party.chat = { messages: [] };
        party.chat.messages.push(chatMessage);
        parties.set(partyId, party);

        // Pusherでメッセージをブロードキャスト
        await pusher.trigger(`party-${partyId}`, 'chat-message', chatMessage);
        return true;
    } catch (error) {
        console.error('チャットメッセージ処理エラー:', error);
        return false;
    }
};

// チャットメッセージ送信エンドポイント
app.post('/api/chat/send', authenticateToken, async (req, res) => {
    try {
        const { partyId, message } = req.body;
        const user = await User.findOne({ username: req.user.username });

        if (!user || !partyId || !message) {
            return res.status(400).json({ message: '無効なリクエストです' });
        }

        const success = await handleChatMessage(partyId, message, user);
        if (success) {
            res.json({ message: 'メッセージを送信しました' });
        } else {
            res.status(400).json({ message: 'メッセージの送信に失敗しました' });
        }
    } catch (error) {
        console.error('チャットエンドポイントエラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// パーティー参加時の認証トークン生成
app.post('/api/party/auth', authenticateToken, (req, res) => {
    const { partyId } = req.body;
    const user = users.get(req.user.username);
    
    if (!user || !partyId) {
        return res.status(400).json({ message: '無効なリクエストです' });
    }

    const party = parties.get(partyId);
    if (!party || !party.members.some(member => member._id === user.username)) {
        return res.status(403).json({ message: 'パーティーへのアクセスが拒否されました' });
    }

    const socketId = req.body.socket_id;
    const auth = pusher.authorizeChannel(socketId, `private-party-${partyId}`);
    res.send(auth);
});

// デバッグ用：登録済みユーザー一覧を表示
app.get('/api/debug/users', (req, res) => {
    const userList = Array.from(users.entries()).map(([username, user]) => ({
        username,
        displayName: user.displayName,
        summonerName: user.summonerName,
        avatar: user.avatar
    }));
    res.json(userList);
});

// ユーザー登録API
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('新規登録リクエスト受信:', req.body);
        const { username, password, displayName, summonerName } = req.body;

        // 入力検証
        if (!username || !password || !displayName || !summonerName) {
            console.log('入力検証エラー:', { username, displayName, summonerName });
            return res.status(400).json({ message: '必須項目が入力されていません' });
        }

        // MongoDBの接続状態を確認
        if (mongoose.connection.readyState !== 1) {
            console.log('MongoDB接続エラー: 接続状態 =', mongoose.connection.readyState);
            return res.status(500).json({ message: 'データベース接続エラーが発生しました。しばらく待ってから再度お試しください。' });
        }

        // ユーザー名の重複チェック
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('ユーザー名重複:', username);
            return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
        }

        // サモナー情報の取得
        let summonerInfo;
        try {
            summonerInfo = await getSummonerByName(summonerName);
            console.log('サモナー情報取得成功:', summonerInfo);
        } catch (error) {
            console.log('サモナー情報取得エラー:', error.message);
            return res.status(400).json({ message: `サモナー情報の取得に失敗しました: ${error.message}` });
        }

        // パスワードのハッシュ化
        const hashedPassword = await bcrypt.hash(password, 10);

        // ユーザー情報の保存
        const user = new User({
            username,
            password: hashedPassword,
            displayName,
            summonerName,
            summonerInfo
        });

        await user.save();
        console.log('ユーザー登録成功:', username);

        // JWTトークンの生成
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '30d' });

        // HTTPOnly Cookieを設定
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30日
        });

        // ユーザー情報からパスワードを除外
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(201).json({
            message: '登録が完了しました',
            token: token,
            user: userResponse
        });
    } catch (error) {
        console.error('登録エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。しばらく待ってから再度お試しください。' });
    }
});

// ログインAPI
app.post('/api/login', async (req, res) => {
    try {
        console.log('ログインリクエスト受信:', { username: req.body.username });
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user || !await bcrypt.compare(password, user.password)) {
            console.log('ログイン失敗:', { username, reason: !user ? 'ユーザーが存在しない' : 'パスワードが不正' });
            return res.status(401).json({ message: 'ユーザー名またはパスワードが正しくありません' });
        }

        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });

        // HTTPOnly Cookieを設定
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30日
        });

        // ユーザー情報からパスワードを除外
        const userInfo = user.toObject();
        delete userInfo.password;

        console.log('ログイン成功:', { username, token: token.substring(0, 10) + '...' });

        res.json({
            token,
            user: userInfo,
            message: 'ログイン成功'
        });
    } catch (error) {
        console.error('ログインエラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// ログアウトエンドポイントを追加
app.post('/api/logout', (req, res) => {
    res.clearCookie('jwt');
    res.json({ message: 'ログアウト成功' });
});

// プロフィール情報取得API
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username }).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        // サモナー情報を更新
        if (user.summonerName) {
            try {
                const summonerInfo = await getSummonerByName(user.summonerName);
                user.summonerInfo = summonerInfo;
                await user.save();
            } catch (error) {
                console.error('サモナー情報更新エラー:', error);
            }
        }

        res.json(user);
    } catch (error) {
        console.error('プロフィール取得エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// プロフィール更新API
app.post('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username });
        console.log('プロフィール更新リクエスト:', req.body);

        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const { displayName, summonerName, password } = req.body;

        // サモナー名が変更された場合、新しいサモナー情報を取得
        if (summonerName && summonerName !== user.summonerName) {
            try {
                const summonerInfo = await getSummonerByName(summonerName);
                user.summonerName = summonerName;
                user.summonerInfo = summonerInfo;
            } catch (error) {
                return res.status(400).json({ message: error.message });
            }
        }

        // 表示名が提供された場合は更新
        if (displayName) {
            user.displayName = displayName;
        }

        // パスワードが提供された場合は更新
        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        // 更新日時を設定
        user.updatedAt = new Date();

        // MongoDBに保存
        await user.save();

        // パスワードを除外してユーザー情報を返す
        const userResponse = user.toObject();
        delete userResponse.password;

        console.log('プロフィール更新成功:', {
            username: userResponse.username,
            displayName: userResponse.displayName,
            summonerName: userResponse.summonerName
        });

        res.json({
            message: 'プロフィールを更新しました',
            user: userResponse
        });
    } catch (error) {
        console.error('プロフィール更新エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// サモナー情報取得API
app.get('/api/summoner/:summonerName', authenticateToken, async (req, res) => {
    try {
        const summonerName = decodeURIComponent(req.params.summonerName);
        const summonerInfo = await getSummonerByName(summonerName);
        res.json(summonerInfo);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 投稿一覧取得API
app.get('/api/posts', authenticateToken, (req, res) => {
    try {
        const { gameMode, mainLane, rank } = req.query;
        let filteredPosts = Array.from(posts.values());

        // フィルタリング
        if (gameMode) {
            filteredPosts = filteredPosts.filter(post => post.gameMode === gameMode);
        }
        if (mainLane) {
            filteredPosts = filteredPosts.filter(post => post.mainLane === mainLane);
        }
        if (rank) {
            filteredPosts = filteredPosts.filter(post => {
                const authorRank = post.author.rank.find(r => r.queueType === 'RANKED_SOLO_5x5');
                return authorRank && authorRank.tier === rank;
            });
        }

        // 投稿を日付の降順でソート
        filteredPosts.sort((a, b) => b.createdAt - a.createdAt);

        res.json(filteredPosts);
    } catch (error) {
        console.error('投稿一覧取得エラー:', error);
        res.status(500).json({ message: '投稿の取得に失敗しました' });
    }
});

// 投稿作成API
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { title, gameMode, mainLane, description } = req.body;
        const user = await User.findOne({ username: req.user.username });

        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        if (!title || !gameMode || !mainLane) {
            return res.status(400).json({ message: '必須項目が入力されていません' });
        }

        const post = {
            _id: Date.now().toString(),
            title,
            gameMode,
            mainLane,
            description,
            author: {
                _id: user.username,
                displayName: user.displayName,
                summonerInfo: user.summonerInfo,
                rank: user.summonerInfo.ranks
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        posts.set(post._id, post);
        console.log('投稿作成成功:', post);
        res.status(201).json(post);
    } catch (error) {
        console.error('投稿作成エラー:', error);
        res.status(500).json({ message: '投稿の作成に失敗しました' });
    }
});

// 投稿削除API
app.delete('/api/posts/:postId', authenticateToken, (req, res) => {
    try {
        const post = posts.get(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: '投稿が見つかりません' });
        }

        if (post.author._id !== req.user.username) {
            return res.status(403).json({ message: '投稿を削除する権限がありません' });
        }

        posts.delete(req.params.postId);
        res.json({ message: '投稿を削除しました' });
    } catch (error) {
        console.error('投稿削除エラー:', error);
        res.status(500).json({ message: '投稿の削除に失敗しました' });
    }
});

// 申請一覧を取得するエンドポイント
app.get('/api/requests', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username });
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        // 受け取った申請と送信した申請を取得
        const allRequests = Array.from(requests.values());
        const received = allRequests.filter(request => 
            request.post.author._id === user.username
        );
        const sent = allRequests.filter(request => 
            request.applicant._id === user.username
        );

        res.json({ received, sent });
    } catch (error) {
        console.error('申請一覧取得エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// 申請を作成するエンドポイント
app.post('/api/requests', authenticateToken, async (req, res) => {
    try {
        const { postId, preferredLane, message } = req.body;
        const applicant = await User.findOne({ username: req.user.username });

        if (!applicant) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const post = posts.get(postId);
        if (!post) {
            return res.status(404).json({ message: '投稿が見つかりません' });
        }

        // 自分の投稿への申請を防止
        if (post.author._id === applicant.username) {
            return res.status(400).json({ message: '自分の投稿には申請できません' });
        }

        // 重複申請の防止
        const existingRequest = Array.from(requests.values()).find(request =>
            request.post._id === postId &&
            request.applicant._id === applicant.username &&
            request.status === 'pending'
        );

        if (existingRequest) {
            return res.status(400).json({ message: 'すでに申請済みです' });
        }

        // 新しい申請を作成
        const newRequest = {
            _id: Date.now().toString(),
            post,
            applicant: {
                _id: applicant.username,
                displayName: applicant.displayName,
                summonerInfo: applicant.summonerInfo
            },
            preferredLane,
            message,
            status: 'pending',
            createdAt: new Date()
        };

        requests.set(newRequest._id, newRequest);
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('申請作成エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// パーティー情報取得API
app.get('/api/party', authenticateToken, (req, res) => {
    try {
        const username = req.user.username;
        const party = Array.from(parties.values()).find(party =>
            party.members.some(member => member._id === username)
        );

        if (!party) {
            return res.json(null);
        }

        res.json(party);
    } catch (error) {
        console.error('パーティー情報取得エラー:', error);
        res.status(500).json({ message: 'パーティー情報の取得に失敗しました' });
    }
});

// パーティー退出API
app.post('/api/party/leave', authenticateToken, (req, res) => {
    try {
        const username = req.user.username;
        const party = Array.from(parties.values()).find(party =>
            party.members.some(member => member._id === username)
        );

        if (!party) {
            return res.status(404).json({ message: 'パーティーが見つかりません' });
        }

        // メンバーから削除
        party.members = party.members.filter(member => member._id !== username);

        // メンバーが0人になった場合はパーティーを削除
        if (party.members.length === 0) {
            parties.delete(party._id);
        } else {
            party.updatedAt = new Date();
            parties.set(party._id, party);
        }

        res.json({ message: 'パーティーから退出しました' });
    } catch (error) {
        console.error('パーティー退出エラー:', error);
        res.status(500).json({ message: 'パーティーからの退出に失敗しました' });
    }
});

// パーティー解散API
app.post('/api/party/disband', authenticateToken, (req, res) => {
    try {
        const username = req.user.username;
        const party = Array.from(parties.values()).find(party =>
            party.members.some(member => member._id === username)
        );

        if (!party) {
            return res.status(404).json({ message: 'パーティーが見つかりません' });
        }

        // 投稿主かどうかを確認
        if (party.post.author._id !== username) {
            return res.status(403).json({ message: 'パーティーを解散する権限がありません' });
        }

        // パーティーを削除
        parties.delete(party._id);

        res.json({ message: 'パーティーを解散しました' });
    } catch (error) {
        console.error('パーティー解散エラー:', error);
        res.status(500).json({ message: 'パーティーの解散に失敗しました' });
    }
});

// 申請を承認するエンドポイント
app.post('/api/requests/:requestId/accept', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username });
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const request = requests.get(req.params.requestId);
        if (!request) {
            return res.status(404).json({ message: '申請が見つかりません' });
        }

        // 投稿者本人かどうかを確認
        if (request.post.author._id !== user.username) {
            return res.status(403).json({ message: '申請を承認する権限がありません' });
        }

        // 申請のステータスを更新
        request.status = 'accepted';
        request.updatedAt = new Date();
        requests.set(request._id, request);

        // パーティーを作成
        const party = {
            _id: Date.now().toString(),
            post: request.post,
            members: [
                {
                    _id: request.post.author._id,
                    displayName: request.post.author.displayName,
                    summonerName: request.post.author.summonerInfo.name,
                    summonerInfo: request.post.author.summonerInfo
                },
                {
                    _id: request.applicant._id,
                    displayName: request.applicant.displayName,
                    summonerName: request.applicant.summonerInfo.name,
                    summonerInfo: request.applicant.summonerInfo
                }
            ],
            chat: {
                messages: []
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        parties.set(party._id, party);

        // Pusherを使用してリアルタイム通知
        await pusher.trigger(`user-${request.applicant._id}`, 'request-accepted', {
            message: '申請が承認されました',
            party: party
        });

        res.json({ 
            message: '申請を承認しました',
            party: party
        });
    } catch (error) {
        console.error('申請承認エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// 申請を拒否するエンドポイント
app.post('/api/requests/:requestId/reject', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.username });
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const request = requests.get(req.params.requestId);
        if (!request) {
            return res.status(404).json({ message: '申請が見つかりません' });
        }

        // 投稿者本人かどうかを確認
        if (request.post.author._id !== user.username) {
            return res.status(403).json({ message: '申請を拒否する権限がありません' });
        }

        // 申請のステータスを更新
        request.status = 'rejected';
        request.updatedAt = new Date();
        requests.set(request._id, request);

        // Pusherを使用してリアルタイム通知
        await pusher.trigger(`user-${request.applicant._id}`, 'request-rejected', {
            message: '申請が拒否されました'
        });

        res.json({ message: '申請を拒否しました' });
    } catch (error) {
        console.error('申請拒否エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// サーバーを起動
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
}); 