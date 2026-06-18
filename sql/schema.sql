-- sql/schema.sql
-- Database schema for AI Resume Screening Platform
-- This file can be executed with psql -f sql/schema.sql

-- Store raw extracted resume text
CREATE TABLE IF NOT EXISTS resume_texts (
  batch_id UUID PRIMARY KEY,
  s3_key TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Store scoring results per candidate per job
CREATE TABLE IF NOT EXISTS candidate_scores (
  id SERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES resume_texts(batch_id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  overall INT NOT NULL,
  criteria JSONB NOT NULL,
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Jobs table (simplified)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
