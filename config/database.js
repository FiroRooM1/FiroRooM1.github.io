const { createClient } = require('@supabase/supabase-js');

// 環境変数の設定
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Supabaseクライアント作成（最小構成）
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// データベース接続のテスト関数（簡単版）
async function testConnection() {
    try {
        const { error } = await supabase
            .from('users')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('Supabase connection test failed:', error);
            return false;
        }
        
        console.log('Supabase connection successful');
        return true;
    } catch (error) {
        console.error('Database connection test error:', error);
        return false;
    }
}

module.exports = {
    supabase,
    testConnection
}; 