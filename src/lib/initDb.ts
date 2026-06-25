// src/lib/initDb.ts
import { pool } from "./db.js";

async function init() {
  const client = await pool.connect();
  try {
    // --- SaaS Multi-Tenant & RBAC Schema Creation ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL,
        role VARCHAR NOT NULL CHECK (role IN ('owner', 'recruiter', 'hiring_manager', 'interviewer')),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR NOT NULL,
        role VARCHAR NOT NULL CHECK (role IN ('owner', 'recruiter', 'hiring_manager', 'interviewer')),
        token VARCHAR UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

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
        education VARCHAR,
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
      ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS current_answers JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS current_question_index INT DEFAULT 0;
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

    // --- KEKA INTEGRATION FOUNDATION TABLES AND ALTERATIONS ---
    console.log("Applying Keka integration foundation schema updates...");
    
    await client.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id VARCHAR;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_system VARCHAR;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills TEXT[];
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_mode VARCHAR;

      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS external_id VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_system VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education VARCHAR;

      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS external_id VARCHAR;
      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS source_system VARCHAR;
      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS sync_status VARCHAR;
      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stages (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        description TEXT,
        order_index INT,
        external_id VARCHAR,
        source_system VARCHAR,
        sync_status VARCHAR,
        last_synced_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        application_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR NOT NULL,
        stage VARCHAR NOT NULL,
        source VARCHAR,
        external_id VARCHAR,
        source_system VARCHAR,
        sync_status VARCHAR,
        last_synced_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        salary VARCHAR NOT NULL,
        joining_date TIMESTAMPTZ,
        status VARCHAR NOT NULL,
        offer_letter_url TEXT,
        external_id VARCHAR,
        source_system VARCHAR,
        sync_status VARCHAR,
        last_synced_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        title VARCHAR NOT NULL,
        file_url TEXT NOT NULL,
        document_type VARCHAR,
        uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        external_id VARCHAR,
        source_system VARCHAR,
        sync_status VARCHAR,
        last_synced_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id VARCHAR PRIMARY KEY,
        event_type VARCHAR NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
        error_message TEXT,
        retry_count INT DEFAULT 0,
        received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMPTZ
      );
    `);
    
    // --- PHASE 2 CORE TABLES & ALTERATIONS ---
    console.log("Applying Phase 2 staffing agency candidate and submission schema updates...");
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_details TEXT;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS github_url VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS work_authorization VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS visa_status VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_salary VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_salary VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS availability_date VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recruiter_owner_id VARCHAR REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_match_score INT;

      ALTER TABLE stages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stages (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        description TEXT,
        order_index INT NOT NULL,
        is_system BOOLEAN DEFAULT FALSE,
        external_id VARCHAR,
        source_system VARCHAR,
        sync_status VARCHAR,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_notes (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        author_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        note_text TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_tags (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        tag_name VARCHAR NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_timeline (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        event_type VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT,
        created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_documents (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        title VARCHAR NOT NULL,
        file_url TEXT NOT NULL,
        document_type VARCHAR NOT NULL,
        version INT NOT NULL DEFAULT 1,
        uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_assignments (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        recruiter_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS client_submissions (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        client_name VARCHAR NOT NULL,
        submitted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        submission_status VARCHAR NOT NULL DEFAULT 'Submitted' CHECK (submission_status IN ('Submitted', 'Under Review', 'Interview Requested', 'Rejected', 'Selected')),
        feedback TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- FUTURE PHASE PREP TABLES (Schema only) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS interview_scorecards (
        id VARCHAR PRIMARY KEY,
        interview_id VARCHAR REFERENCES interviews(id) ON DELETE CASCADE,
        scorer_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        rating INT CHECK (rating >= 1 AND rating <= 5),
        feedback TEXT,
        criteria_ratings JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_communication_history (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        direction VARCHAR NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        from_address VARCHAR NOT NULL,
        to_address VARCHAR NOT NULL,
        subject VARCHAR NOT NULL,
        body TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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

    // --- PHASE 3 ENTERPRISE SCHEMAS ---
    console.log("Applying Phase 3 enterprise schema upgrades...");
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS scoring_weights JSONB DEFAULT '{"skills": 30, "experience": 25, "industry": 15, "education": 15, "location": 15}'::jsonb;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_tier VARCHAR DEFAULT 'free' CHECK (plan_tier IN ('free', 'premium', 'enterprise'));
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS credit_balance INT DEFAULT 100;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_config JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color VARCHAR DEFAULT '#0f172a';
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_footer TEXT;

      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_name VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_name VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS city VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS state VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS country VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS us_citizen BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS green_card BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS h1b BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS opt BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cpt BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ead BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tn_visa BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS requires_sponsorship BOOLEAN DEFAULT FALSE;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_campaign VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_medium VARCHAR;
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_provider VARCHAR;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_inbox (
        id VARCHAR PRIMARY KEY,
        file_name VARCHAR NOT NULL,
        file_url TEXT NOT NULL,
        file_hash VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'Queued',
        error_message TEXT,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE SET NULL,
        overall_confidence NUMERIC(3,2),
        email_confidence NUMERIC(3,2),
        phone_confidence NUMERIC(3,2),
        skills_confidence NUMERIC(3,2),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS duplicate_candidates (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        duplicate_candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        confidence_score NUMERIC(5,2),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_job_matches (
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        match_score INT NOT NULL,
        matched_skills TEXT[],
        missing_skills TEXT[],
        strengths TEXT[],
        concerns TEXT[],
        recommendation_reason TEXT,
        generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (candidate_id, job_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_match_history (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        job_id VARCHAR REFERENCES jobs(id) ON DELETE CASCADE,
        old_score INT NOT NULL,
        new_score INT NOT NULL,
        reason TEXT,
        recalculated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_merge_history (
        id VARCHAR PRIMARY KEY,
        primary_candidate_id VARCHAR REFERENCES candidates(id) ON DELETE CASCADE,
        merged_candidate_id VARCHAR NOT NULL,
        merged_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        merged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        merge_reason TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_processing_logs (
        id VARCHAR PRIMARY KEY,
        inbox_id VARCHAR NOT NULL,
        candidate_id VARCHAR,
        step VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        provider VARCHAR NOT NULL,
        duration_ms INT NOT NULL,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_usage_summary (
        tenant_id VARCHAR REFERENCES tenants(id) ON DELETE CASCADE,
        month VARCHAR NOT NULL,
        resumes_uploaded INT DEFAULT 0,
        ai_screens INT DEFAULT 0,
        emails_sent INT DEFAULT 0,
        ai_tokens_consumed INT DEFAULT 0,
        storage_used BIGINT DEFAULT 0,
        storage_files_count INT DEFAULT 0,
        active_jobs INT DEFAULT 0,
        active_candidates INT DEFAULT 0,
        PRIMARY KEY (tenant_id, month)
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_usage_summary_month ON tenant_usage_summary(month);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storage_audit_logs (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR REFERENCES tenants(id) ON DELETE CASCADE,
        file_key VARCHAR NOT NULL,
        provider VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        deleted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        bytes_freed BIGINT DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        subject VARCHAR NOT NULL,
        html_body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_tenant_template_name UNIQUE (tenant_id, name)
      );
    `);

    await client.query(`
      ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS html_body TEXT;
    `);

    await client.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd JSONB;
    `);

    console.log("Adding tenant_id column and indices to business tables...");
    const scopedTables = [
      "email_templates",
      "resume_texts",
      "candidate_scores",
      "client_usage_logs",
      "candidates",
      "candidate_activity_logs",
      "jobs",
      "assessments",
      "assessment_questions",
      "assessment_attempts",
      "assessment_violations",
      "assessment_sessions",
      "assessment_audit",
      "interviews",
      "stages",
      "applications",
      "offers",
      "documents",
      "webhook_events",
      "candidate_notes",
      "candidate_tags",
      "candidate_timeline",
      "candidate_documents",
      "candidate_assignments",
      "client_submissions",
      "interview_scorecards",
      "email_communication_history",
      "resume_inbox",
      "duplicate_candidates",
      "candidate_job_matches",
      "candidate_match_history",
      "candidate_merge_history",
      "resume_processing_logs",
      "tenant_usage_summary",
      "storage_audit_logs"
    ];

    for (const table of scopedTables) {
      await client.query(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id VARCHAR REFERENCES tenants(id) ON DELETE CASCADE;
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id ON ${table}(tenant_id);
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS license_keys (
        key VARCHAR PRIMARY KEY,
        plan_tier VARCHAR NOT NULL DEFAULT 'premium' CHECK (plan_tier IN ('free', 'premium', 'enterprise')),
        credits INT NOT NULL DEFAULT 100,
        expires_at TIMESTAMPTZ,
        is_used BOOLEAN DEFAULT FALSE,
        used_by_tenant_id VARCHAR REFERENCES tenants(id) ON DELETE SET NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO license_keys (key, plan_tier, credits, expires_at)
      VALUES 
        ('TEST-FREE-KEY', 'free', 100, NOW() + INTERVAL '30 days'),
        ('TEST-PREMIUM-KEY', 'premium', 1000, NOW() + INTERVAL '365 days'),
        ('TEST-ENTERPRISE-KEY', 'enterprise', 10000, NOW() + INTERVAL '365 days')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Ensure critical indexes are created for performance and security
    console.log("Adding missing database performance indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(tenant_id, LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_candidates_job_id ON candidates(job_id);
      CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_id ON candidate_job_matches(job_id);
      CREATE INDEX IF NOT EXISTS idx_resume_inbox_file_hash ON resume_inbox(file_hash, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_assessment_attempts_candidate ON assessment_attempts(candidate_id, assessment_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews(candidate_id);
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
