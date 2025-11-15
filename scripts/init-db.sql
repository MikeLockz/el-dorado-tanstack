-- Initialize El Dorado database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add initial game tables
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add more tables as needed for the game implementation
