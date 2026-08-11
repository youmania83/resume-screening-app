// src/lib/initDb.ts
import { pool } from "./db.js";
import { isNonResumeFile } from "./fileFilters.js";

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
      INSERT INTO tenants (id, name)
      VALUES ('87b949cb-2c0d-44ca-a6f5-a025ec43e6a5', 'Rison Scheduling Inc')
      ON CONFLICT (id) DO NOTHING;
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

    const defaultUserRes = await client.query("SELECT id FROM users WHERE id = 'd96c9d53-7870-4d07-894c-586497544f8d' LIMIT 1;");
    if (defaultUserRes.rowCount === 0) {
      const { hashPassword } = await import("./auth.js");
      const passwordHash = await hashPassword("admin123");
      await client.query(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role)
        VALUES ('d96c9d53-7870-4d07-894c-586497544f8d', '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5', 'Yogesh Wadhwa', 'yogesh@isonscheduling.com', $1, 'owner')
        ON CONFLICT (email) DO NOTHING;
      `, [passwordHash]);
    }

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
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_code VARCHAR;
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

    // Create email_logs table for email sending queue and event tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id VARCHAR PRIMARY KEY,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE SET NULL,
        recipient VARCHAR NOT NULL,
        subject VARCHAR NOT NULL,
        template VARCHAR NOT NULL,
        sent_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        delivery_status VARCHAR NOT NULL DEFAULT 'pending',
        error_message TEXT,
        retry_count INT DEFAULT 0,
        opened_at TIMESTAMPTZ,
        clicked_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_candidate ON email_logs(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(delivery_status);
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
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cal_link VARCHAR;
      ALTER TABLE interviews ADD COLUMN IF NOT EXISTS meeting_link VARCHAR;
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

    // Ensure single-tenant deployment consistency across all data tables
    await client.query(`
      UPDATE candidates SET tenant_id = '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5' WHERE tenant_id IS NULL OR tenant_id != '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5';
      UPDATE resume_inbox SET tenant_id = '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5' WHERE tenant_id IS NULL OR tenant_id != '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5';
      UPDATE jobs SET tenant_id = '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5' WHERE tenant_id IS NULL OR tenant_id != '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5';
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
      "email_logs",
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR REFERENCES tenants(id) ON DELETE CASCADE,
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        candidate_id VARCHAR REFERENCES candidates(id) ON DELETE SET NULL,
        name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        subject VARCHAR NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        priority VARCHAR NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        source VARCHAR NOT NULL DEFAULT 'recruiter' CHECK (source IN ('recruiter', 'candidate', 'anonymous')),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_id ON support_tickets(tenant_id);
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
      CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_candidate_timeline_event ON candidate_timeline(tenant_id, event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_candidates_source ON candidates(tenant_id, source);
      CREATE INDEX IF NOT EXISTS idx_candidate_assignments_recruiter ON candidate_assignments(tenant_id, recruiter_id);
      CREATE INDEX IF NOT EXISTS idx_client_submissions_submitted_by ON client_submissions(tenant_id, submitted_by);
      CREATE INDEX IF NOT EXISTS idx_candidates_job_eval ON candidates(job_id, external_id) WHERE score > 0 OR recommendation IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_candidates_tenant_job_score ON candidates(tenant_id, job_id, score DESC);
      CREATE INDEX IF NOT EXISTS idx_assessment_attempts_cand_status ON assessment_attempts(candidate_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_tenant_sync ON jobs(tenant_id, sync_status, created_at DESC);
    `);

    // ─── Pipeline stability schema (workflow correctness guarantees) ───────────
    console.log("Applying recruitment pipeline stability schema updates...");

    await client.query(`
      -- Explicit open/closed state for a requisition. Previously the only signal
      -- was sync_status='removed' (set by the ATS sync), so there was no way for
      -- HR to close a job and stop it attracting new applicants.
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';

      -- Exactly-once marker for the assessment invitation. Without this the
      -- 30-minute autonomous cycle re-selected every 'pending' candidate and
      -- re-sent the invitation email on every run.
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assessment_invited_at TIMESTAMPTZ;

      -- Exactly-once marker for the assessment reminder (day 3-4 after invite).
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assessment_reminder_sent_at TIMESTAMPTZ;
    `);

    await client.query(`UPDATE jobs SET status = 'active' WHERE status IS NULL;`);

    // Backfill the invite marker for candidates who already received an
    // invitation, so the fix does not re-mail the existing pipeline.
    await client.query(`
      UPDATE candidates c
         SET assessment_invited_at = COALESCE(
               (SELECT MIN(l.sent_time) FROM email_logs l
                 WHERE l.candidate_id = c.id AND l.template = 'assessment_invitation' AND l.delivery_status = 'sent'),
               (SELECT MIN(a.logged_at) FROM candidate_activity_logs a
                 WHERE a.candidate_id = c.id AND a.event_type = 'assessment_invited'),
               c.created_at
             )
       WHERE c.assessment_invited_at IS NULL
         AND c.assessment_token IS NOT NULL;
    `).catch((err: any) => {
      console.warn("[initDb] Could not backfill assessment_invited_at (non-fatal):", err.message);
    });

    // Revoke assessment tokens query removed to protect 7-day validity and candidate access.

    // PERMANENT DATABASE ENGINE GUARANTEE:
    // Create a PostgreSQL BEFORE INSERT OR UPDATE trigger on candidates.
    //
    // IMPORTANT: this trigger fires the score-based stage assignment
    // exactly ONCE per candidate -- the moment they transition out of
    // "unscreened" (status NULL or 'applied'). It is gated on
    // `OLD.status IS NULL OR OLD.status = 'applied'` (true on INSERT too,
    // since OLD doesn't exist there). After that one-time assignment,
    // `status` and the assessment token belong exclusively to explicit
    // application/HR logic (assessment submission, interview scheduling,
    // manual HR change) and this trigger never touches them again.
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_enforce_candidate_pipeline_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.score IS NOT NULL
           AND NEW.score > 0
           AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status = 'applied')
           AND (NEW.status IS NULL OR NEW.status = 'applied')
           AND COALESCE(NEW.assessment_status, '') != 'passed'
           AND NEW.interview_scheduled_date IS NULL
           AND (NEW.keka_status IS NULL OR NEW.keka_status NOT ILIKE '%interview%') THEN
          IF NEW.score >= 80 THEN
            NEW.status := 'shortlisted';
          ELSIF NEW.score >= 60 THEN
            NEW.status := 'Review';
          ELSE
            NEW.status := 'rejected';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_candidate_pipeline_integrity ON candidates;

      CREATE TRIGGER trg_candidate_pipeline_integrity
      BEFORE INSERT OR UPDATE ON candidates
      FOR EACH ROW
      EXECUTE FUNCTION fn_enforce_candidate_pipeline_integrity();
    `).catch((err: any) => {
      console.warn("[initDb] Could not create PostgreSQL pipeline trigger (non-fatal):", err.message);
    });

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_tenant_active ON jobs(tenant_id, status, sync_status);
      CREATE INDEX IF NOT EXISTS idx_candidates_invite_pending
        ON candidates(tenant_id, status, assessment_status, assessment_invited_at);
      CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_resume_inbox_status_created ON resume_inbox(tenant_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_email_logs_dedup
        ON email_logs(candidate_id, template, delivery_status, sent_time DESC);
      CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_template
        ON email_logs(LOWER(recipient), template, delivery_status);
    `);

    // A candidate may hold at most one live interview booking. This makes
    // double-booking impossible even if two cron cycles race.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_interviews_active_candidate
        ON interviews(candidate_id)
        WHERE status IN ('scheduled', 'completed');
    `).catch(async (err: any) => {
      console.warn(
        "[initDb] Could not create uniq_interviews_active_candidate — duplicate live interviews already exist. " +
        "Resolve duplicates and re-run init-db. Details:", err.message
      );
    });

    // A candidate may hold at most one attempt per assessment. Without this,
    // two near-simultaneous GET /api/assessment/:token requests (e.g. a
    // double-mount or a fast retry) can both pass the "no existing attempt"
    // check before either INSERT lands, creating duplicate attempts/sessions
    // for the same candidate+assessment and corrupting submit/scoring logic.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_attempts_candidate_assessment
        ON assessment_attempts(candidate_id, assessment_id);
    `).catch(async (err: any) => {
      console.warn(
        "[initDb] Could not create uniq_assessment_attempts_candidate_assessment — duplicate attempts already exist. " +
        "Resolve duplicates and re-run init-db. Details:", err.message
      );
    });

    // Alter experience_years to NUMERIC(4,1) to support fractional experience years (e.g. 0.5, 1.5)
    await client.query("ALTER TABLE candidates ALTER COLUMN experience_years TYPE NUMERIC(4,1);");

    // Clean up existing candidates' weaknesses to remove any US-centric points (e.g. US visa, work auth, or US market exposure)
    console.log("Cleaning up US work authorization and visa references from existing candidates' weaknesses...");
    const candidatesRes = await client.query(`
      SELECT id, weaknesses FROM candidates WHERE weaknesses IS NOT NULL;
    `);
    for (const row of candidatesRes.rows) {
      if (Array.isArray(row.weaknesses) && row.weaknesses.length > 0) {
        const filtered = row.weaknesses.filter((w: string) => {
          const lower = w.toLowerCase();
          return !(
            lower.includes("us ") ||
            lower.includes(" us") ||
            lower.includes(" visa") ||
            lower.includes("sponsorship") ||
            lower.includes("work authorization") ||
            lower.includes("market exposure")
          );
        });
        if (filtered.length !== row.weaknesses.length) {
          await client.query(`
            UPDATE candidates SET weaknesses = $1 WHERE id = $2;
          `, [filtered, row.id]);
          console.log(`Updated weaknesses for candidate ${row.id}`);
        }
      }
    }

    // Purge failed / junk inbox items and unknown candidates
    console.log("Purging failed/junk inbox items and unknown candidates...");
    const inboxRes = await client.query(`
      SELECT ri.id, ri.candidate_id, ri.file_name, ri.status, ri.created_at, c.name as candidate_name
      FROM resume_inbox ri
      LEFT JOIN candidates c ON c.id = ri.candidate_id;
    `);

    const junkInboxIds: string[] = [];
    const junkCandidateIds: string[] = [];

    for (const row of inboxRes.rows) {
      const fileName = row.file_name || "";
      const status = row.status;
      const candidateName = row.candidate_name;
      // A row still lacking a resolved candidate name may simply be mid-processing
      // (parsing/AI extraction not finished yet) rather than genuinely junk. Only
      // treat the "unknown name" signal as junk once it's old enough to no longer
      // plausibly be in flight; a bad filename or an explicit "Failed" status are
      // definitive regardless of age.
      const isOldEnough = row.created_at && (Date.now() - new Date(row.created_at).getTime() > 2 * 60 * 60 * 1000);

      let isJunk = false;
      if (isNonResumeFile(fileName)) {
        isJunk = true;
      }
      if (status === "Failed") {
        isJunk = true;
      }
      if (isOldEnough && candidateName && (candidateName === "Unknown Candidate" || candidateName.toLowerCase().includes("unknown"))) {
        isJunk = true;
      }

      if (isJunk) {
        junkInboxIds.push(row.id);
        if (row.candidate_id) {
          junkCandidateIds.push(row.candidate_id);
        }
      }
    }

    // Also search for candidates named 'Unknown Candidate' or whose name contains 'unknown' that might not be in resume_inbox.
    //
    // This purge runs unconditionally on every server boot (crash-restart,
    // deploy, PM2 restart, etc). A brand-new candidate row can legitimately
    // sit with no name for a brief window between being created and the AI
    // parser filling it in from the resume -- a restart landing in that
    // window would otherwise delete an in-flight, real application before
    // it ever finished processing. Only records old enough that they can no
    // longer be "still processing" are eligible for this cleanup.
    const orphanUnknownRes = await client.query(`
      SELECT id FROM candidates
      WHERE (name = 'Unknown Candidate'
         OR name ILIKE '%unknown%'
         OR name IS NULL
         OR name = '')
        AND created_at < NOW() - INTERVAL '2 hours';
    `);
    for (const row of orphanUnknownRes.rows) {
      if (!junkCandidateIds.includes(row.id)) {
        junkCandidateIds.push(row.id);
      }
    }

    if (junkCandidateIds.length > 0) {
      await client.query("DELETE FROM candidate_timeline WHERE candidate_id = ANY($1);", [junkCandidateIds]);
      await client.query("DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1);", [junkCandidateIds]);
      await client.query("DELETE FROM candidates WHERE id = ANY($1);", [junkCandidateIds]);
      console.log(`Purged ${junkCandidateIds.length} unknown/junk candidate records.`);
    }

    // Synchronize and reset all auto-increment sequences to prevent ID conflicts
    await client.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) AS seq
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_default LIKE 'nextval%'
        LOOP
          IF r.seq IS NOT NULL THEN
            EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 1))', r.seq, r.column_name, r.table_name);
          END IF;
        END LOOP;
      END $$;
    `);

    // Repair orphaned resume_inbox items by linking them to their corresponding candidate records
    await client.query(`
      UPDATE resume_inbox ri
      SET candidate_id = sub.candidate_id
      FROM (
        SELECT DISTINCT ON (ri_inner.id) ri_inner.id as inbox_id, cd.candidate_id as candidate_id
        FROM resume_inbox ri_inner
        JOIN candidate_documents cd ON (cd.title = ri_inner.file_name OR cd.file_url = ri_inner.file_url)
        WHERE ri_inner.candidate_id IS NULL AND cd.candidate_id IS NOT NULL
      ) sub
      WHERE ri.id = sub.inbox_id AND ri.candidate_id IS NULL;
    `);

    // Merge duplicate candidate records across all ingestion sources (Keka API, Mailbox/Zoho, Uploads) by email
    await client.query(`
      DO $$
      DECLARE
          rec RECORD;
          primary_id text;
          dup_id text;
      BEGIN
          FOR rec IN 
              SELECT LOWER(email) as email, array_agg(id::text ORDER BY (CASE WHEN assessment_token IS NOT NULL AND assessment_token != '' THEN 0 ELSE 1 END), (CASE WHEN job_id IS NOT NULL THEN 0 ELSE 1 END), score DESC, created_at DESC) as ids
              FROM candidates
              WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%'
              GROUP BY LOWER(email)
              HAVING count(*) > 1
          LOOP
              primary_id := rec.ids[1];
              FOR i IN 2..array_length(rec.ids, 1) LOOP
                  dup_id := rec.ids[i];
                  
                  -- Transfer candidate details and tokens if primary is missing them
                  UPDATE candidates p
                  SET assessment_token = COALESCE(p.assessment_token, d.assessment_token),
                      assessment_token_expiry = COALESCE(p.assessment_token_expiry, d.assessment_token_expiry),
                      assessment_status = COALESCE(p.assessment_status, d.assessment_status),
                      assessment_invited_at = COALESCE(p.assessment_invited_at, d.assessment_invited_at),
                      assessment_completed_at = COALESCE(p.assessment_completed_at, d.assessment_completed_at),
                      assessment_score = COALESCE(p.assessment_score, d.assessment_score),
                      final_score = COALESCE(p.final_score, d.final_score),
                      job_id = COALESCE(p.job_id, d.job_id),
                      score = GREATEST(p.score, d.score)
                  FROM candidates d
                  WHERE p.id::text = primary_id AND d.id::text = dup_id;

                  -- Re-link all child table relations to primary_id to preserve complete candidate history
                  UPDATE assessment_attempts SET candidate_id = primary_id WHERE candidate_id = dup_id AND NOT EXISTS (SELECT 1 FROM assessment_attempts a2 WHERE a2.candidate_id = primary_id AND a2.assessment_id = assessment_attempts.assessment_id);
                  UPDATE assessment_sessions SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE assessment_violations SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE interviews SET candidate_id = primary_id WHERE candidate_id = dup_id AND NOT EXISTS (SELECT 1 FROM interviews i2 WHERE i2.candidate_id = primary_id AND i2.scheduled_date = interviews.scheduled_date);
                  UPDATE applications SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE client_submissions SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_notes SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_tags SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_assignments SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_documents SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_timeline SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_activity_logs SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE candidate_job_matches SET candidate_id = primary_id WHERE candidate_id = dup_id AND NOT EXISTS (SELECT 1 FROM candidate_job_matches m2 WHERE m2.candidate_id = primary_id AND m2.job_id = candidate_job_matches.job_id);
                  UPDATE candidate_match_history SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE email_logs SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE email_communication_history SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE support_tickets SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  UPDATE resume_inbox SET candidate_id = primary_id WHERE candidate_id = dup_id;
                  DELETE FROM duplicate_candidates WHERE candidate_id = dup_id OR duplicate_candidate_id = dup_id;
                  DELETE FROM candidates WHERE id::text = dup_id;
              END LOOP;
          END LOOP;
      END $$;
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
