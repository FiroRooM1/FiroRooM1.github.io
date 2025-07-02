-- LoL Rally Database Schema for PostgreSQL (Supabase)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar TEXT,
    email VARCHAR(255),
    riot_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recruitment posts table
CREATE TABLE IF NOT EXISTS recruitment_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    rank VARCHAR(50) NOT NULL,
    lane VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES recruitment_posts(id) ON DELETE CASCADE,
    applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    applicant_lane VARCHAR(50) NOT NULL,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, applicant_id)
);

-- Parties table
CREATE TABLE IF NOT EXISTS parties (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES recruitment_posts(id) ON DELETE CASCADE,
    party_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Party members table
CREATE TABLE IF NOT EXISTS party_members (
    id SERIAL PRIMARY KEY,
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    lane VARCHAR(50),
    UNIQUE(party_id, user_id)
);

-- Party messages table
CREATE TABLE IF NOT EXISTS party_messages (
    id SERIAL PRIMARY KEY,
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remember_token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_riot_id ON users(riot_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_posts_user_id ON recruitment_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_posts_created_at ON recruitment_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_post_id ON applications(post_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_parties_post_id ON parties(post_id);
CREATE INDEX IF NOT EXISTS idx_party_members_party_id ON party_members(party_id);
CREATE INDEX IF NOT EXISTS idx_party_members_user_id ON party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_party_messages_party_id ON party_messages(party_id);
CREATE INDEX IF NOT EXISTS idx_party_messages_created_at ON party_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(remember_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Row Level Security (RLS) settings
-- 注意: RLSは現在のユーザーIDの型不一致により無効化
-- Supabase Auth (UUID) vs アプリケーション users.id (INTEGER) の不一致
-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（型不一致により現在は無効）
-- DROP POLICY IF EXISTS user_sessions_policy ON user_sessions;
-- CREATE POLICY user_sessions_policy ON user_sessions
--     FOR ALL USING (user_id = auth.uid()::integer);

-- Function to automatically delete expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql; 