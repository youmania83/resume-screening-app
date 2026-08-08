import { pool } from '../lib/db.js';
import { RealZohoMailAdapter } from '../integrations/zoho/adapters/RealZohoMailAdapter.js';
import dotenv from 'dotenv';
dotenv.config();

async function createAssessmentForAvdhoot() {
  const tenantRes = await pool.query('SELECT id FROM tenants LIMIT 1;');
  const tenantId = tenantRes.rows[0]?.id || '87b949cb-2c0d-44ca-a6f5-a025ec43e6a5';

  const candRes = await pool.query(`
    SELECT c.id, c.name, c.email, c.job_id, j.title as job_title 
    FROM candidates c 
    LEFT JOIN jobs j ON c.job_id = j.id 
    WHERE c.email = 'avdhootkeware@gmail.com';
  `);
  
  if (candRes.rowCount === 0) {
    console.error('Candidate avdhootkeware@gmail.com not found');
    await pool.end();
    return;
  }

  const cand = candRes.rows[0];
  console.log('Found candidate:', cand);

  // Get or create assessment for job
  let assRes = await pool.query('SELECT id FROM assessments WHERE job_id = $1 LIMIT 1;', [cand.job_id]);
  let assessmentId = assRes.rows[0]?.id;

  if (!assessmentId) {
    const newAss = await pool.query(
      'INSERT INTO assessments (id, tenant_id, job_id, title) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id;',
      [tenantId, cand.job_id, cand.job_title || 'Technical Assessment']
    );
    assessmentId = newAss.rows[0].id;
  }

  const token = 'token-' + cand.id.slice(0, 8);
  const attemptRes = await pool.query(`
    INSERT INTO assessment_attempts (id, tenant_id, candidate_id, assessment_id, status, session_id)
    VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4)
    RETURNING *;
  `, [tenantId, cand.id, assessmentId, token]);

  console.log('Created Assessment Attempt:', attemptRes.rows[0]);

  // Send invitation email via Zoho Mail
  const zoho = new RealZohoMailAdapter();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://api.risonaitech.com';
  const inviteLink = `${appUrl}/assessment/${token}`;

  await zoho.sendEmail(cand.email, `Assessment Invitation: ${cand.job_title || 'Technical Assessment'} - Techsol Engineers`, `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${cand.name},</h2>
      <p>You have been shortlisted for the <strong>${cand.job_title || 'Technical Assessment'}</strong> position at Techsol Engineers.</p>
      <p>Please click the button below to start your online technical assessment:</p>
      <p><a href="${inviteLink}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Start Assessment</a></p>
      <p>Or copy this link into your browser: <br/><a href="${inviteLink}">${inviteLink}</a></p>
    </div>
  `);

  console.log('✅ Sent Assessment Invitation email to:', cand.email);
  await pool.end();
}

createAssessmentForAvdhoot().catch(console.error);
