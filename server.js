const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const validator = require('validator');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { supabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// 環境変数の必須チェック
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!RIOT_API_KEY) {
    console.error('ERROR: RIOT_API_KEY環境変数が設定されていません');
    process.exit(1);
}

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.error('ERROR: Discord OAuth環境変数が設定されていません');
    process.exit(1);
}

if (!SESSION_SECRET) {
    console.error('ERROR: SESSION_SECRET環境変数が設定されていません');
    process.exit(1);
}

// =======セキュリティ設定=======

// HTTPSリダイレクト（本番環境のみ）
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

// セキュリティヘッダー設定
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "cdn.communitydragon.org"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false
}));

// グローバルレート制限
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 1000, // リクエスト制限
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

// セキュリティ関数
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    // HTMLタグを除去し、特殊文字をエスケープ
    return validator.escape(input.trim());
}

function validateRiotId(riotId) {
    if (!riotId || typeof riotId !== 'string') return false;
    // Riot ID形式: 名前#タグ (タグは3-5文字の英数字)
    const riotIdRegex = /^[a-zA-Z0-9 ]{1,16}#[a-zA-Z0-9]{3,5}$/;
    return riotIdRegex.test(riotId);
}

function validatePostData(data) {
    const { title, mode, rank, lane, description } = data;
    
    if (!title || title.length < 1 || title.length > 100) {
        return { valid: false, message: 'タイトルは1-100文字で入力してください' };
    }
    
    const validModes = ['ランク', 'ノーマル', 'ARAM', 'フレックス', 'カスタム'];
    if (!validModes.includes(mode)) {
        return { valid: false, message: '無効なゲームモードです' };
    }
    
    const validRanks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger', 'Unranked'];
    if (!validRanks.includes(rank)) {
        return { valid: false, message: '無効なランクです' };
    }
    
    const validLanes = ['TOP', 'JG', 'MID', 'BOT', 'SUP', 'AUTOFILL'];
    if (!validLanes.includes(lane)) {
        return { valid: false, message: '無効なレーンです' };
    }
    
    if (description && description.length > 500) {
        return { valid: false, message: '詳細は500文字以内で入力してください' };
    }
    
    return { valid: true };
}

// レート制限ヘルパー関数
function createRateLimit(windowMs, max, message = 'レート制限に達しました。しばらくお待ちください。') {
    return rateLimit({
        windowMs,
        max,
        message: { 
            success: false, 
            message 
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
}

// 基本的なエラーハンドリング
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Discord OAuth設定
const getCallbackURL = () => {
    // 環境変数で明示的に設定されている場合はそれを使用
    if (process.env.DISCORD_CALLBACK_URL) {
        return process.env.DISCORD_CALLBACK_URL;
    }
    
    // Vercel環境の場合は動的に生成
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}/auth/discord/callback`;
    }
    
    // 本番環境のデフォルト
    if (process.env.NODE_ENV === 'production') {
        return 'https://rally-klcgxtwvl-firorooms-projects.vercel.app/auth/discord/callback';
    }
    
    // ローカル開発環境
    return 'http://localhost:3000/auth/discord/callback';
};

const DISCORD_CONFIG = {
    clientId: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: getCallbackURL()
};

// 基本ミドルウェア
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// セッション設定（Vercel最適化版）
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Vercelでの認証問題を回避するためfalseに設定
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365日間（1年間）に延長
        sameSite: 'lax' // CSRF攻撃対策
    },
    name: 'rally-session', // セッション名を短縮
    rolling: true, // セッションの有効期限を延長
    proxy: true // Vercel プロキシ環境での trust proxy 設定
}));

// Passport初期化
app.use(passport.initialize());
app.use(passport.session());

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// Passport Discord戦略設定
passport.use(new DiscordStrategy({
    clientID: DISCORD_CONFIG.clientId,
    clientSecret: DISCORD_CONFIG.clientSecret,
    callbackURL: DISCORD_CONFIG.callbackURL,
    scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const discordId = profile.id;
        const username = profile.username;
        const displayName = profile.global_name || profile.username;
        const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null;
        const email = profile.email;

        // 既存ユーザーをチェック
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('*')
            .eq('discord_id', discordId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            return done(selectError);
        }

        if (existingUser) {
            // 既存ユーザーのログイン時刻を更新
            await supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('discord_id', discordId);
            return done(null, existingUser);
        } else {
            // 新規ユーザー作成
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([{ discord_id: discordId, username, display_name: displayName, avatar, email }])
                .select()
                .single();

            if (insertError) {
                return done(insertError);
            }
            return done(null, newUser);
        }
    } catch (error) {
        return done(error);
    }
}));

// Passportシリアライゼーション
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    console.log('Deserializing user with ID:', id);
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) {
            console.error('User deserialization error:', error);
            done(error, null);
        } else {
            console.log('User deserialized successfully:', user?.username);
            done(null, user);
        }
    } catch (error) {
        console.error('User deserialization exception:', error);
        done(error, null);
    }
});

// 認証チェックミドルウェア
function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ success: false, message: 'ログインが必要です' });
}

// Riot ID設定チェックミドルウェア
function requireRiotId(req, res, next) {
    if (req.user && req.user.riot_id) {
        return next();
    }
    res.status(400).json({ success: false, message: 'Riot IDの設定が必要です', needRiotId: true });
}

// ホームページのルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェックエンドポイント（デバッグ用）
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        version: '1.0.0'
    });
});

// 画像配信用の明示的なルート
app.get('/rankIMG/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'rankIMG', filename);
    
    console.log('ランクアイコン配信リクエスト:', filename);
    console.log('ファイルパス:', filePath);
    
    // ファイルが存在するかチェック
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        console.log('ランクアイコン配信成功:', filename);
    } else {
        console.log('ランクアイコンファイルが見つかりません:', filename);
        res.status(404).json({ error: 'Image not found' });
    }
});

app.get('/positionIMG/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'positionIMG', filename);
    
    console.log('ポジションアイコン配信リクエスト:', filename);
    console.log('ファイルパス:', filePath);
    
    // ファイルが存在するかチェック
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        console.log('ポジションアイコン配信成功:', filename);
    } else {
        console.log('ポジションアイコンファイルが見つかりません:', filename);
        res.status(404).json({ error: 'Image not found' });
    }
});

// API情報エンドポイント（デバッグ用）
app.get('/api/info', (req, res) => {
    res.json({
        status: 'API Working',
        endpoints: [
            'GET /health',
            'GET /api/info', 
            'GET /auth/discord',
            'GET /auth/user',
            'POST /auth/logout'
        ],
        timestamp: new Date().toISOString()
    });
});

// Discord OAuth認証開始
app.get('/auth/discord', (req, res, next) => {
    console.log('Discord OAuth認証を開始します');
    passport.authenticate('discord')(req, res, next);
});

// Discord OAuth認証コールバック
app.get('/auth/discord/callback', (req, res, next) => {
    console.log('Discord OAuth認証コールバックを受信しました');
    console.log('Query params:', req.query);
    console.log('Session before auth:', req.sessionID);
    
    // Discordからエラーが返された場合
    if (req.query.error) {
        console.log('Discord認証エラー:', req.query.error);
        return res.redirect('/?error=discord_denied');
    }
    
    passport.authenticate('discord', { 
        failureRedirect: '/?error=auth_failed',
        failureMessage: true
    })(req, res, (err) => {
        if (err) {
            console.error('認証エラー:', err);
            return res.redirect('/?error=auth_failed');
        }
        
        if (!req.user) {
            console.error('認証後にユーザー情報がありません');
            return res.redirect('/?error=auth_failed');
        }
        
        console.log('認証成功！ユーザー:', req.user);
        console.log('セッションID:', req.sessionID);
        
        // セッションを手動で保存（より確実な方法）
        req.session.passport = { user: req.user.id };
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('セッション保存エラー:', saveErr);
                return res.redirect('/?error=session_failed');
            }
            
            console.log('セッション保存成功 - ユーザーID:', req.user.id);
            
            // 成功時は単純にホームページにリダイレクト（エラーパラメータなし）
            setTimeout(() => {
                res.redirect('/');
            }, 100);
        });
    });
});

// 現在のユーザー情報取得
app.get('/auth/user', async (req, res) => {
    console.log('=== /auth/user リクエスト ===');
    console.log('SessionID:', req.sessionID);
    console.log('Session data:', req.session);
    console.log('req.isAuthenticated():', req.isAuthenticated());
    console.log('req.user:', req.user);
    console.log('Passport session:', req.session.passport);
    
    // キャッシュ無効化ヘッダーを設定
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    if (!req.isAuthenticated()) {
        console.log('認証されていないため401を返します');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userInfo = {
        id: req.user.id,
        discord_id: req.user.discord_id,
        username: req.user.username,
        display_name: req.user.display_name,
        avatar_url: req.user.avatar,
        riot_id: req.user.riot_id,
        hasRiotId: !!req.user.riot_id
    };
    
    // Riot IDが設定されている場合はRiot API情報も取得
    if (req.user.riot_id) {
        console.log('Riot ID設定済み、API情報を取得中:', req.user.riot_id);
        try {
            const riotInfo = await getRiotAccountInfo(req.user.riot_id);
            if (riotInfo.success) {
                console.log('Riot API情報取得成功');
                userInfo.riot_account_info = {
                    name: riotInfo.data.summonerName,
                    summonerName: riotInfo.data.summonerName,
                    summonerLevel: riotInfo.data.summonerLevel,
                    rankedSolo: riotInfo.data.rankedSolo,
                    rankedFlex: riotInfo.data.rankedFlex
                };
            }
        } catch (error) {
            console.error('Riot API情報取得エラー:', error);
        }
    }
    
    console.log('ユーザー情報を返します:', userInfo);
    res.json(userInfo);
});

// ログアウト
app.post('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'ログアウトに失敗しました' });
        }
        res.json({ success: true, message: 'ログアウトしました' });
    });
});

// Riot ID設定API
app.post('/auth/set-riot-id', createRateLimit(60000, 5), requireAuth, async (req, res) => {
    const { riot_id } = req.body;
    
    console.log('=== Riot ID設定リクエスト ===');
    console.log('User:', req.user.username);
    console.log('Riot ID:', riot_id);
    
    // 入力値検証
    if (!riot_id || riot_id.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Riot IDを入力してください' 
        });
    }
    
    // Riot ID形式検証
    if (!validateRiotId(riot_id.trim())) {
        return res.status(400).json({ 
            success: false, 
            message: 'Riot IDは「ユーザー名#タグ」の形式で入力してください（タグは3-5文字の英数字）' 
        });
    }
    
    // 入力値サニタイゼーション
    const sanitizedRiotId = sanitizeInput(riot_id.trim());
    
    // 既に同じRiot IDが使用されていないかチェック
    const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('riot_id', sanitizedRiotId)
        .neq('id', req.user.id)
        .single();
    
    if (existingUser) {
        return res.status(400).json({ 
            success: false, 
            message: 'このRiot IDは既に他のユーザーによって使用されています' 
        });
    }
    
    try {
        console.log('Riot API確認中:', sanitizedRiotId);
        
        // Riot APIで有効性確認
        const riotInfo = await getRiotAccountInfo(sanitizedRiotId);
        if (!riotInfo.success) {
            console.log('Riot API確認失敗:', riotInfo.error);
            return res.status(400).json({ 
                success: false, 
                message: 'Riot IDが見つかりません。正しいRiot IDを入力してください。' 
            });
        }
        
        console.log('Riot API確認成功、データベース更新中...');
        
        // Supabaseでデータベース更新
        const { data, error } = await supabase
            .from('users')
            .update({ riot_id: sanitizedRiotId })
            .eq('id', req.user.id)
            .select()
            .single();
        
        if (error) {
            console.error('データベース更新エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'データベース更新中にエラーが発生しました' 
            });
        }
        
        console.log('データベース更新成功');
        
        // セッションのユーザー情報を更新
        req.user.riot_id = sanitizedRiotId;
        
        res.json({ 
            success: true, 
            message: 'Riot IDを設定しました'
        });
        
    } catch (error) {
        console.error('Riot ID設定エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Riot ID確認中にエラーが発生しました' 
        });
    }
});

// アカウント更新API
app.put('/auth/update-account', createRateLimit(60000, 5), requireAuth, async (req, res) => {
    console.log('=== アカウント更新リクエスト ===');
    console.log('User:', req.user.username);
    console.log('Request body:', req.body);
    
    const { display_name, riot_id } = req.body;
    
    // 入力値検証
    if (!display_name || display_name.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: '表示名を入力してください' 
        });
    }
    
    if (display_name.trim().length > 50) {
        return res.status(400).json({ 
            success: false, 
            error: '表示名は50文字以内で入力してください' 
        });
    }
    
    if (riot_id && !validateRiotId(riot_id.trim())) {
        return res.status(400).json({ 
            success: false, 
            error: 'Riot IDは「ユーザー名#タグ」の形式で入力してください（タグは3-5文字の英数字）' 
        });
    }
    
    // 入力値サニタイゼーション
    const sanitizedDisplayName = sanitizeInput(display_name.trim());
    const sanitizedRiotId = riot_id ? sanitizeInput(riot_id.trim()) : null;
    
    // Riot IDの重複チェック（変更された場合のみ）
    if (sanitizedRiotId && sanitizedRiotId !== req.user.riot_id) {
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('riot_id', sanitizedRiotId)
            .neq('id', req.user.id)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'このRiot IDは既に他のユーザーによって使用されています' 
            });
        }
    }
    
    try {
        // Riot IDが変更された場合は有効性確認
        if (sanitizedRiotId && sanitizedRiotId !== req.user.riot_id) {
            console.log('Riot API確認中:', sanitizedRiotId);
            const riotInfo = await getRiotAccountInfo(sanitizedRiotId);
            if (!riotInfo.success) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Riot IDが見つかりません。正しいRiot IDを入力してください。' 
                });
            }
        }
        
        // Supabaseでデータベース更新
        const { data, error } = await supabase
            .from('users')
            .update({ 
                display_name: sanitizedDisplayName,
                riot_id: sanitizedRiotId
            })
            .eq('id', req.user.id)
            .select()
            .single();
        
        if (error) {
            console.error('データベース更新エラー:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'データベース更新中にエラーが発生しました' 
            });
        }
        
        console.log('データベース更新成功');
        
        // セッションのユーザー情報を更新
        req.user.display_name = sanitizedDisplayName;
        req.user.riot_id = sanitizedRiotId;
        
        res.json({ 
            success: true, 
            message: 'アカウント情報を更新しました'
        });
        
    } catch (error) {
        console.error('アカウント更新エラー:', error);
        res.status(500).json({ 
            success: false, 
            error: 'アカウント更新中にエラーが発生しました' 
        });
    }
});

// ======= 募集掲示板機能 =======

// 募集投稿一覧取得
app.get('/posts', requireAuth, requireRiotId, async (req, res) => {
    try {
        const { rank, mode } = req.query;
        
        let query = supabase
            .from('recruitment_posts')
            .select(`
                *,
                users (id, username, display_name, riot_id)
            `)
            .order('created_at', { ascending: false });
        
        if (rank) {
            query = query.eq('rank', rank);
        }
        if (mode) {
            query = query.eq('mode', mode);
        }
        
        const { data: posts, error } = await query;
        
        if (error) {
            console.error('投稿取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: '投稿の取得に失敗しました' 
            });
        }
        
        // 各投稿に対して追加情報を取得
        const enhancedPosts = await Promise.all((posts || []).map(async (post) => {
            // 投稿者のランク情報を取得（自分の投稿でない場合のみ）
            let authorRankInfo = null;
            if (post.user_id !== req.user.id && post.users.riot_id) {
                try {
                    const riotInfo = await getRiotAccountInfo(post.users.riot_id);
                    if (riotInfo.success) {
                        authorRankInfo = {
                            rankedSolo: riotInfo.data.rankedSolo,
                            rankedFlex: riotInfo.data.rankedFlex
                        };
                    }
                } catch (error) {
                    console.error('投稿者ランク情報取得エラー:', error);
                }
            }
            
            // 現在のユーザーが承認済みかチェック
            let userApprovedApplication = false;
            if (post.user_id !== req.user.id) {
                const { data: approvedApp, error: appError } = await supabase
                    .from('applications')
                    .select('id')
                    .eq('post_id', post.id)
                    .eq('user_id', req.user.id)
                    .eq('status', 'accepted')
                    .single();
                
                userApprovedApplication = !!approvedApp;
            }
            
            return {
                ...post,
                author_rank_info: authorRankInfo,
                user_approved_application: userApprovedApplication
            };
        }));
        
        res.json({ success: true, posts: enhancedPosts });
    } catch (error) {
        console.error('投稿取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: '投稿の取得中にエラーが発生しました' 
        });
    }
});

// 自分の投稿一覧取得
app.get('/my-posts', requireAuth, requireRiotId, async (req, res) => {
    try {
        const { data: posts, error } = await supabase
            .from('recruitment_posts')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('自分の投稿取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: '投稿の取得に失敗しました' 
            });
        }
        
        res.json({ success: true, posts: posts || [] });
    } catch (error) {
        console.error('自分の投稿取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: '投稿の取得中にエラーが発生しました' 
        });
    }
});

// 申請一覧取得
app.get('/applications', requireAuth, requireRiotId, async (req, res) => {
    try {
        // 自分の投稿への申請を取得
        const { data: applications, error } = await supabase
            .from('applications')
            .select(`
                *,
                recruitment_posts!inner (title, user_id),
                users (id, username, display_name, riot_id)
            `)
            .eq('recruitment_posts.user_id', req.user.id)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('申請取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: '申請の取得に失敗しました' 
            });
        }
        
        // 各申請に申請者のランク情報を追加
        const enhancedApplications = await Promise.all((applications || []).map(async (app) => {
            let applicantRankInfo = null;
            
            // 申請者のRiot IDがある場合、ランク情報を取得
            if (app.users?.riot_id) {
                try {
                    const riotInfo = await getRiotAccountInfo(app.users.riot_id);
                    if (riotInfo.success) {
                        applicantRankInfo = {
                            rankedSolo: riotInfo.data.rankedSolo,
                            rankedFlex: riotInfo.data.rankedFlex
                        };
                    }
                } catch (error) {
                    console.error('申請者ランク情報取得エラー:', error);
                }
            }
            
            return {
                ...app,
                applicant_rank_info: applicantRankInfo
            };
        }));
        
        res.json({ success: true, applications: enhancedApplications });
    } catch (error) {
        console.error('申請取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: '申請の取得中にエラーが発生しました' 
        });
    }
});

// パーティー一覧取得
app.get('/parties', requireAuth, requireRiotId, async (req, res) => {
    try {
        console.log('パーティー一覧取得開始 - ユーザーID:', req.user.id);
        
        const { data: parties, error } = await supabase
            .from('party_members')
            .select(`
                parties!inner(
                    id,
                    post_id,
                    party_name,
                    created_at,
                    recruitment_posts!inner(
                        mode,
                        rank,
                        title
                    )
                ),
                role
            `)
            .eq('user_id', req.user.id)
            .order('joined_at', { ascending: false });
        
        if (error) {
            console.error('パーティー取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'パーティーの取得に失敗しました',
                debug: error.message
            });
        }
        
        console.log('取得したパーティーデータ:', JSON.stringify(parties, null, 2));
        
        const formattedParties = (parties || []).map(item => {
            const party = item.parties;
            const post = party.recruitment_posts;
            
            // メンバー数を取得（後で実装）
            return {
                id: party.id,
                name: party.party_name,
                mode: post?.mode || 'Unknown',
                rank: post?.rank || 'Unknown',
                user_role: item.role,
                member_count: 1, // 仮の値
                created_at: party.created_at
            };
        });
        
        console.log('整形後のパーティーデータ:', JSON.stringify(formattedParties, null, 2));
        
        res.json({ success: true, parties: formattedParties });
    } catch (error) {
        console.error('パーティー取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: 'パーティーの取得中にエラーが発生しました',
            debug: error.message
        });
    }
});

// パーティーメンバー取得
app.get('/parties/:id/members', requireAuth, requireRiotId, async (req, res) => {
    try {
        const partyId = req.params.id;
        console.log('パーティーメンバー取得開始 - パーティーID:', partyId);
        
        const { data: members, error } = await supabase
            .from('party_members')
            .select(`
                *,
                users (id, display_name, username, avatar, riot_id)
            `)
            .eq('party_id', partyId);
        
        if (error) {
            console.error('パーティーメンバー取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'メンバー情報の取得に失敗しました',
                debug: error.message
            });
        }
        
        console.log('取得したメンバーデータ:', JSON.stringify(members, null, 2));
        
        // 各メンバーのRiot API情報を取得
        const membersWithRiotInfo = await Promise.all((members || []).map(async (member) => {
            const user = member.users;
            let riotInfo = null;
            
            if (user.riot_id) {
                try {
                    riotInfo = await getRiotAccountInfo(user.riot_id);
                } catch (error) {
                    console.warn(`Riot API情報取得失敗 (${user.riot_id}):`, error.message);
                }
            }
            
            return {
                id: user.id,
                display_name: user.display_name,
                username: user.username,
                avatar: user.avatar,
                riot_id: user.riot_id,
                role: member.role,
                lane: member.lane,
                riotInfo: riotInfo
            };
        }));
        
        console.log('整形後のメンバーデータ:', JSON.stringify(membersWithRiotInfo, null, 2));
        
        res.json({ success: true, members: membersWithRiotInfo });
    } catch (error) {
        console.error('パーティーメンバー取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: 'メンバー情報の取得中にエラーが発生しました',
            debug: error.message
        });
    }
});

// パーティーメッセージ取得
app.get('/parties/:id/messages', requireAuth, requireRiotId, async (req, res) => {
    try {
        const partyId = req.params.id;
        console.log('パーティーメッセージ取得開始 - パーティーID:', partyId);
        
        const { data: messages, error } = await supabase
            .from('party_messages')
            .select(`
                *,
                users (display_name, avatar)
            `)
            .eq('party_id', partyId)
            .order('created_at', { ascending: true });
        
        if (error) {
            console.error('パーティーメッセージ取得エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'メッセージの取得に失敗しました',
                debug: error.message
            });
        }
        
        console.log('取得したメッセージ数:', (messages || []).length);
        
        // メッセージデータを整形
        const formattedMessages = (messages || []).map(msg => ({
            id: msg.id,
            content: msg.message,
            user_id: msg.user_id,
            display_name: msg.users?.display_name || 'Unknown',
            avatar_url: msg.users?.avatar || null,
            created_at: msg.created_at
        }));
        
        res.json({ success: true, messages: formattedMessages });
    } catch (error) {
        console.error('パーティーメッセージ取得エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: 'メッセージの取得中にエラーが発生しました',
            debug: error.message
        });
    }
});

// パーティーメッセージ送信
app.post('/parties/:id/messages', createRateLimit(60000, 20), requireAuth, requireRiotId, async (req, res) => {
    try {
        const partyId = req.params.id;
        const { message } = req.body;
        console.log('メッセージ送信開始 - パーティーID:', partyId, 'メッセージ:', message);
        
        // 入力値検証
        if (!message || !message.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'メッセージを入力してください' 
            });
        }
        
        if (message.length > 500) {
            return res.status(400).json({ 
                success: false, 
                message: 'メッセージは500文字以内で入力してください' 
            });
        }
        
        // 入力値サニタイゼーション
        const sanitizedMessage = sanitizeInput(message);
        
        // パーティーメンバーシップ確認
        const { data: membership, error: membershipError } = await supabase
            .from('party_members')
            .select('id')
            .eq('party_id', partyId)
            .eq('user_id', req.user.id)
            .single();
        
        if (membershipError || !membership) {
            return res.status(403).json({ 
                success: false, 
                message: 'このパーティーにメッセージを送信する権限がありません' 
            });
        }
        
        const { data: newMessage, error } = await supabase
            .from('party_messages')
            .insert([{
                party_id: partyId,
                user_id: req.user.id,
                message: sanitizedMessage
            }])
            .select()
            .single();
        
        if (error) {
            console.error('メッセージ送信エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'メッセージの送信に失敗しました',
                debug: error.message
            });
        }
        
        console.log('メッセージ送信成功:', newMessage);
        
        res.json({ success: true, message: newMessage });
    } catch (error) {
        console.error('メッセージ送信エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: 'メッセージ送信中にエラーが発生しました',
            debug: error.message
        });
    }
});

// 募集投稿作成
app.post('/posts', createRateLimit(60000, 5), requireAuth, requireRiotId, async (req, res) => {
    try {
        const { title, mode, rank, lane, description } = req.body;
        
        // 入力値検証
        const validation = validatePostData({ title, mode, rank, lane, description });
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.message 
            });
        }
        
        // 入力値サニタイゼーション
        const sanitizedData = {
            title: sanitizeInput(title),
            mode: mode, // 選択肢なのでサニタイズ不要
            rank: rank, // 選択肢なのでサニタイズ不要
            lane: lane, // 選択肢なのでサニタイズ不要
            description: description ? sanitizeInput(description) : null
        };
        
        // 1日の投稿制限チェック（ユーザーあたり5投稿まで）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data: todayPosts, error: countError } = await supabase
            .from('recruitment_posts')
            .select('id')
            .eq('user_id', req.user.id)
            .gte('created_at', today.toISOString());
        
        if (countError) {
            console.error('投稿数確認エラー:', countError);
        } else if (todayPosts && todayPosts.length >= 5) {
            return res.status(429).json({ 
                success: false, 
                error: '1日の投稿制限に達しました（5投稿/日）' 
            });
        }
        
        const { data: post, error } = await supabase
            .from('recruitment_posts')
            .insert([{
                user_id: req.user.id,
                title: sanitizedData.title,
                mode: sanitizedData.mode,
                rank: sanitizedData.rank,
                lane: sanitizedData.lane,
                description: sanitizedData.description
            }])
            .select()
            .single();
        
        if (error) {
            console.error('投稿作成エラー:', error);
            return res.status(500).json({ 
                success: false, 
                error: '投稿の作成に失敗しました' 
            });
        }
        
        res.json({ success: true, post });
    } catch (error) {
        console.error('投稿作成エラー:', error);
        res.status(500).json({ 
            success: false, 
            error: '投稿作成中にエラーが発生しました' 
        });
    }
});

// 投稿削除
app.delete('/posts/:id', requireAuth, async (req, res) => {
    try {
        const postId = req.params.id;
        
        // 投稿の所有者確認
        const { data: post, error: selectError } = await supabase
            .from('recruitment_posts')
            .select('user_id')
            .eq('id', postId)
            .single();
        
        if (selectError || !post) {
            return res.status(404).json({ 
                success: false, 
                error: '投稿が見つかりません' 
            });
        }
        
        if (post.user_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: '投稿を削除する権限がありません' 
            });
        }
        
        const { error: deleteError } = await supabase
            .from('recruitment_posts')
            .delete()
            .eq('id', postId);
        
        if (deleteError) {
            console.error('投稿削除エラー:', deleteError);
            return res.status(500).json({ 
                success: false, 
                error: '投稿の削除に失敗しました' 
            });
        }
        
        res.json({ success: true, message: '投稿を削除しました' });
    } catch (error) {
        console.error('投稿削除エラー:', error);
        res.status(500).json({ 
            success: false, 
            error: '投稿削除中にエラーが発生しました' 
        });
    }
});

// 参加申請送信
app.post('/applications', createRateLimit(60000, 10), requireAuth, requireRiotId, async (req, res) => {
    try {
        const { postId, lane, message } = req.body;
        
        // 入力値検証
        if (!postId || !lane) {
            return res.status(400).json({ 
                success: false, 
                message: '必須項目が不足しています' 
            });
        }
        
        const validLanes = ['TOP', 'JG', 'MID', 'BOT', 'SUP', 'AUTOFILL'];
        if (!validLanes.includes(lane)) {
            return res.status(400).json({ 
                success: false, 
                message: '無効なレーンが選択されています' 
            });
        }
        
        if (message && message.length > 500) {
            return res.status(400).json({ 
                success: false, 
                message: 'メッセージは500文字以内で入力してください' 
            });
        }
        
        // 入力値サニタイゼーション
        const sanitizedMessage = message ? sanitizeInput(message) : null;
        
        // 投稿の存在確認と自分の投稿への申請防止
        const { data: post, error: postError } = await supabase
            .from('recruitment_posts')
            .select('user_id')
            .eq('id', postId)
            .single();
        
        if (postError || !post) {
            return res.status(404).json({ 
                success: false, 
                message: '募集投稿が見つかりません' 
            });
        }
        
        if (post.user_id === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                message: '自分の投稿には申請できません' 
            });
        }
        
        // 重複申請チェック
        const { data: existingApp, error: checkError } = await supabase
            .from('applications')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', req.user.id)
            .single();
        
        if (existingApp) {
            return res.status(400).json({ 
                success: false, 
                message: 'すでに申請済みです' 
            });
        }
        
        const { data: application, error } = await supabase
            .from('applications')
            .insert([{
                post_id: postId,
                user_id: req.user.id,
                lane,
                message: sanitizedMessage,
                status: 'pending'
            }])
            .select()
            .single();
        
        if (error) {
            console.error('申請送信エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: '申請の送信に失敗しました' 
            });
        }
        
        res.json({ success: true, message: '参加申請を送信しました！' });
    } catch (error) {
        console.error('申請送信エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: '申請送信中にエラーが発生しました' 
        });
    }
});

// 申請処理（承認・拒否）
app.put('/applications/:id', requireAuth, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const { status } = req.body;
        console.log('申請処理開始 - 申請ID:', applicationId, 'ステータス:', status);
        
        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: '無効なステータスです' 
            });
        }
        
        // 申請情報を取得（投稿情報も含む）
        const { data: applicationData, error: getError } = await supabase
            .from('applications')
            .select(`
                *,
                recruitment_posts!inner(
                    id,
                    user_id,
                    title,
                    mode,
                    rank,
                    lane
                )
            `)
            .eq('id', applicationId)
            .single();
        
        if (getError || !applicationData) {
            console.error('申請情報取得エラー:', getError);
            return res.status(404).json({ 
                success: false, 
                message: '申請が見つかりません' 
            });
        }
        
        // 投稿者が処理権限を持っているかチェック
        if (applicationData.recruitment_posts.user_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: '申請を処理する権限がありません' 
            });
        }
        
        const { data: application, error } = await supabase
            .from('applications')
            .update({ status })
            .eq('id', applicationId)
            .select()
            .single();
        
        if (error) {
            console.error('申請処理エラー:', error);
            return res.status(500).json({ 
                success: false, 
                message: '申請処理に失敗しました' 
            });
        }
        
        let partyId = null;
        
        // 承認の場合はパーティーを作成
        if (status === 'accepted') {
            console.log('パーティー作成開始');
            
            // パーティー名を生成
            const partyName = `${applicationData.recruitment_posts.title} - パーティー`;
            
            // パーティーを作成
            const { data: party, error: partyError } = await supabase
                .from('parties')
                .insert([{
                    post_id: applicationData.post_id,
                    party_name: partyName
                }])
                .select()
                .single();
            
            if (partyError) {
                console.error('パーティー作成エラー:', partyError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'パーティーの作成に失敗しました' 
                });
            }
            
            partyId = party.id;
            console.log('パーティー作成成功 - ID:', partyId);
            
            // パーティーメンバーを追加（投稿者 = リーダー、申請者 = メンバー）
            const membersToAdd = [
                {
                    party_id: partyId,
                    user_id: applicationData.recruitment_posts.user_id, // 投稿者
                    role: 'leader',
                    lane: applicationData.recruitment_posts.lane
                },
                {
                    party_id: partyId,
                    user_id: applicationData.user_id, // 申請者（applicant_id）
                    role: 'member',
                    lane: applicationData.lane // applicant_lane
                }
            ];
            
            const { error: membersError } = await supabase
                .from('party_members')
                .insert(membersToAdd);
            
            if (membersError) {
                console.error('パーティーメンバー追加エラー:', membersError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'パーティーメンバーの追加に失敗しました' 
                });
            }
            
            console.log('パーティーメンバー追加成功');
        }
        
        const actionText = status === 'accepted' ? '承認' : '拒否';
        const responseMessage = status === 'accepted' 
            ? `申請を${actionText}し、パーティーを作成しました！` 
            : `申請を${actionText}しました`;
        
        res.json({ 
            success: true, 
            message: responseMessage,
            party_id: partyId
        });
    } catch (error) {
        console.error('申請処理エラー:', error);
        res.status(500).json({ 
            success: false, 
            message: '申請処理中にエラーが発生しました',
            debug: error.message
        });
    }
});

// セッション状態確認エンドポイント（デバッグ用）
app.get('/api/session-debug', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        isAuthenticated: req.isAuthenticated(),
        session: {
            passport: req.session.passport,
            cookie: req.session.cookie,
            maxAge: req.session.cookie?.maxAge,
            expires: req.session.cookie?.expires
        },
        user: req.user ? {
            id: req.user.id,
            username: req.user.username,
            discord_id: req.user.discord_id,
            hasRiotId: !!req.user.riot_id
        } : null,
        timestamp: new Date().toISOString()
    });
});

// セッション延長エンドポイント
app.post('/api/refresh-session', requireAuth, (req, res) => {
    // セッションを保存して延長
    req.session.save((err) => {
        if (err) {
            console.error('セッション保存エラー:', err);
            return res.status(500).json({ success: false, message: 'セッション延長に失敗しました' });
        }
        
        console.log('セッション延長成功 - ユーザーID:', req.user.id);
        res.json({ 
            success: true, 
            message: 'セッションを延長しました',
            expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString()
        });
    });
});

// 記憶ログイン（オプション）- データベースベースのセッション管理
app.post('/api/remember-login', requireAuth, async (req, res) => {
    try {
        const { remember } = req.body;
        const userId = req.user.id;
        
        if (remember) {
            // 1年間有効な記憶トークンを生成
            const rememberToken = require('crypto').randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1年後
            
            // データベースに記憶トークンを保存
            const { error } = await supabase
                .from('user_sessions')
                .upsert([
                    {
                        user_id: userId,
                        remember_token: rememberToken,
                        expires_at: expiresAt.toISOString(),
                        created_at: new Date().toISOString()
                    }
                ], { onConflict: 'user_id' });
            
            if (error) {
                console.error('記憶トークン保存エラー:', error);
                return res.status(500).json({ success: false, message: '記憶機能の保存に失敗しました' });
            }
            
            // HTTPOnlyクッキーとして記憶トークンを設定
            res.cookie('remember_token', rememberToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 365 * 24 * 60 * 60 * 1000, // 1年間
                sameSite: 'lax'
            });
            
            console.log('記憶ログインを有効化 - ユーザーID:', userId);
            res.json({ success: true, message: 'ログイン状態を記憶しました' });
        } else {
            // 記憶機能をオフにする
            await supabase
                .from('user_sessions')
                .delete()
                .eq('user_id', userId);
            
            res.clearCookie('remember_token');
            res.json({ success: true, message: 'ログイン記憶を無効化しました' });
        }
    } catch (error) {
        console.error('記憶ログイン処理エラー:', error);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// 記憶トークンによる自動ログイン機能
async function checkRememberToken(req, res, next) {
    // 既に認証済みの場合はスキップ
    if (req.isAuthenticated()) {
        return next();
    }
    
    const rememberToken = req.cookies.remember_token;
    if (!rememberToken) {
        return next();
    }
    
    try {
        // データベースから記憶トークンを確認
        const { data: sessionData, error } = await supabase
            .from('user_sessions')
            .select(`
                *,
                users (*)
            `)
            .eq('remember_token', rememberToken)
            .gt('expires_at', new Date().toISOString())
            .single();
        
        if (error || !sessionData) {
            // 無効なトークンの場合はクッキーを削除
            res.clearCookie('remember_token');
            return next();
        }
        
        // ユーザーを自動ログイン
        req.login(sessionData.users, (err) => {
            if (err) {
                console.error('自動ログインエラー:', err);
                res.clearCookie('remember_token');
                return next();
            }
            
            console.log('記憶トークンによる自動ログイン成功 - ユーザー:', sessionData.users.username);
            next();
        });
    } catch (error) {
        console.error('記憶トークン確認エラー:', error);
        res.clearCookie('remember_token');
        next();
    }
}

// エラーハンドリングミドルウェア
app.use((error, req, res, next) => {
    console.error('サーバーエラー:', error);
    res.status(500).json({ 
        success: false, 
        message: process.env.NODE_ENV === 'production' 
            ? 'サーバーエラーが発生しました' 
            : error.message 
    });
});

// 404ハンドラー
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'ページが見つかりません' 
    });
});

// サーバー起動（ローカル環境のみ）
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`サーバーがポート${PORT}で起動しました`);
    });
}

// Riot API関数
async function getRiotAccountInfo(riotId) {
    try {
        const [gameName, tagLine] = riotId.split('#');
        
        // API呼び出し設定（タイムアウトを短く）
        const axiosConfig = {
            headers: {
                'X-Riot-Token': RIOT_API_KEY
            },
            timeout: 8000 // 8秒タイムアウト
        };
        
        // Account APIでPUUIDを取得
        const accountResponse = await axios.get(
            `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
            axiosConfig
        );
        
        const puuid = accountResponse.data.puuid;
        
        // 並列実行でAPIコールを最適化
        const [summonerResponse, rankedResponse] = await Promise.all([
            // Summoner APIでサマナー情報を取得（PUUIDベース）
            axios.get(
                `https://jp1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                axiosConfig
            ),
            // League APIでランク情報を取得（PUUIDベース - 新しいエンドポイント）
            axios.get(
                `https://jp1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
                axiosConfig
            )
        ]);
        
        // ランク情報を整理
        const rankedSolo = rankedResponse.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
        const rankedFlex = rankedResponse.data.find(entry => entry.queueType === 'RANKED_FLEX_SR');
        
        return {
            success: true,
            data: {
                summonerName: summonerResponse.data.name,
                summonerLevel: summonerResponse.data.summonerLevel,
                rankedSolo: rankedSolo ? {
                    tier: rankedSolo.tier,
                    rank: rankedSolo.rank,
                    leaguePoints: rankedSolo.leaguePoints,
                    wins: rankedSolo.wins,
                    losses: rankedSolo.losses
                } : null,
                rankedFlex: rankedFlex ? {
                    tier: rankedFlex.tier,
                    rank: rankedFlex.rank,
                    leaguePoints: rankedFlex.leaguePoints,
                    wins: rankedFlex.wins,
                    losses: rankedFlex.losses
                } : null
            }
        };
    } catch (error) {
        console.error('Riot API エラー:', error.response?.data || error.message);
        
        // タイムアウトエラーの場合は特別なハンドリング
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: 'Riot API timeout - サービスが混雑している可能性があります'
            };
        }
        
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

// エクスポート（Vercel対応）
module.exports = app; 
