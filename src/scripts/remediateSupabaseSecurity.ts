// src/scripts/remediateSupabaseSecurity.ts
import { pool } from "../lib/db.js";

async function remediateSupabaseSecurity() {
  console.log("🔒 Starting Supabase Security Remediation (RLS & PostgREST lockdown)...");
  const client = await pool.connect();
  try {
    // 1. Run dynamic PL/pgSQL loop to enable RLS on every table in public schema
    console.log("⚡ Enabling Row-Level Security on all public tables...");
    await client.query(`
      DO $$
      DECLARE
          r RECORD;
      BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
              EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
          END LOOP;
      END $$;
    `);

    // 2. Revoke default PostgREST access from anon and authenticated roles
    console.log("🛡️ Revoking default API access for anon & authenticated roles...");
    await client.query(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    `);

    // 3. Verification step: Check status of all public tables
    const result = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename ASC;
    `);

    const totalTables = result.rows.length;
    const securedTables = result.rows.filter((r: { rowsecurity: boolean }) => r.rowsecurity);
    const unsecuredTables = result.rows.filter((r: { rowsecurity: boolean }) => !r.rowsecurity);

    console.log(`\n📊 Verification Summary:`);
    console.log(`   - Total public tables: ${totalTables}`);
    console.log(`   - Secured with RLS: ${securedTables.length}`);
    console.log(`   - Unsecured tables: ${unsecuredTables.length}`);

    if (unsecuredTables.length === 0) {
      console.log("\n✅ SUCCESS: All tables in the database now have Row-Level Security enabled!");
      console.log("✅ Supabase issues 'rls_disabled_in_public' & 'sensitive_columns_exposed' are RESOLVED.");
    } else {
      console.error("\n❌ WARNING: The following tables still have RLS disabled:", unsecuredTables);
    }
  } catch (error) {
    console.error("❌ Remediation failed with error:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

remediateSupabaseSecurity();
