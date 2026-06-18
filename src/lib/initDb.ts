// src/lib/initDb.ts
import { pool } from "./db.js";

async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_texts (
        batch_id VARCHAR PRIMARY KEY,
        s3_key VARCHAR,
        raw_text TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_scores (
        batch_id VARCHAR NOT NULL,
        job_id VARCHAR NOT NULL,
        overall INT NOT NULL,
        criteria JSONB NOT NULL,
        PRIMARY KEY (batch_id, job_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_usage_logs (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        credits_used INT NOT NULL,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        phone VARCHAR,
        role VARCHAR NOT NULL,
        score INT NOT NULL,
        match_percent INT NOT NULL,
        experience_years INT NOT NULL,
        experience_match TEXT,
        recommendation TEXT,
        confidence VARCHAR,
        risk_level VARCHAR,
        strengths TEXT[],
        weaknesses TEXT[],
        missing_skills TEXT[],
        matched_skills TEXT[],
        skills TEXT[],
        certifications TEXT[],
        projects TEXT[],
        keywords TEXT[],
        status VARCHAR DEFAULT 'applied',
        application_source VARCHAR NOT NULL,
        assessment_score INT,
        assessment_status VARCHAR,
        interview_scheduled_date TIMESTAMP,
        interview_feedback TEXT,
        keka_status VARCHAR,
        applied_date VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_activity_logs (
        id SERIAL PRIMARY KEY,
        candidate_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        message TEXT NOT NULL,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // --- NEW TABLES FOR ASSESSMENT MODULE ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR PRIMARY KEY,
        title VARCHAR NOT NULL,
        description TEXT NOT NULL,
        department VARCHAR,
        location VARCHAR,
        experience_required VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_id VARCHAR REFERENCES jobs(id) ON DELETE SET NULL;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS final_score NUMERIC(5,2);
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS violation_count INT DEFAULT 0;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMPTZ;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assessment_token VARCHAR UNIQUE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assessment_token_expiry TIMESTAMPTZ;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id VARCHAR PRIMARY KEY,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        title VARCHAR NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_questions (
        id VARCHAR PRIMARY KEY,
        assessment_id VARCHAR REFERENCES assessments(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer VARCHAR NOT NULL,
        difficulty VARCHAR NOT NULL,
        topic VARCHAR,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_attempts (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        assessment_id VARCHAR REFERENCES assessments(id) ON DELETE CASCADE,
        status VARCHAR NOT NULL,
        correct_answers INT DEFAULT 0,
        incorrect_answers INT DEFAULT 0,
        score INT DEFAULT 0,
        time_taken INT DEFAULT 0,
        violation_count INT DEFAULT 0,
        session_id VARCHAR,
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_violations (
        id SERIAL PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        attempt_id VARCHAR REFERENCES assessment_attempts(id) ON DELETE CASCADE,
        violation_type VARCHAR NOT NULL,
        details TEXT NOT NULL,
        logged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_sessions (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        assessment_id VARCHAR REFERENCES assessments(id) ON DELETE CASCADE,
        attempt_id VARCHAR REFERENCES assessment_attempts(id) ON DELETE CASCADE,
        status VARCHAR NOT NULL CHECK (status IN ('active','completed','abandoned','force_resumed')),
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        browser_fingerprint TEXT,
        ip_address VARCHAR,
        metadata JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_audit (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR REFERENCES assessment_sessions(id) ON DELETE CASCADE,
        event_type VARCHAR NOT NULL,
        event_payload JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_assessment_sessions_candidate_active ON assessment_sessions(candidate_id, status) WHERE status = 'active';
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS interviews (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        scheduled_date TIMESTAMPTZ NOT NULL,
        status VARCHAR DEFAULT 'scheduled',
        feedback TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log("Altering columns to TIMESTAMPTZ for timezone compatibility...");
    await client.query(`
      ALTER TABLE candidates ALTER COLUMN assessment_completed_at TYPE TIMESTAMPTZ;
      ALTER TABLE candidates ALTER COLUMN assessment_token_expiry TYPE TIMESTAMPTZ;
      ALTER TABLE candidates ALTER COLUMN interview_scheduled_date TYPE TIMESTAMPTZ;
      ALTER TABLE assessment_attempts ALTER COLUMN started_at TYPE TIMESTAMPTZ;
      ALTER TABLE assessment_attempts ALTER COLUMN completed_at TYPE TIMESTAMPTZ;
      ALTER TABLE assessment_sessions ALTER COLUMN started_at TYPE TIMESTAMPTZ;
      ALTER TABLE assessment_sessions ALTER COLUMN last_heartbeat TYPE TIMESTAMPTZ;
      ALTER TABLE assessment_sessions ALTER COLUMN completed_at TYPE TIMESTAMPTZ;
      ALTER TABLE interviews ALTER COLUMN scheduled_date TYPE TIMESTAMPTZ;
    `);
    
    console.log("✅ Database tables and schema alterations ensured.");
  } finally {
    client.release();
  }
}

init().catch(err => {
  console.error("❌ DB init failed:", err);
  process.exit(1);
});
