DO $$
DECLARE
    rec RECORD;
    primary_id text;
    dup_id text;
BEGIN
    FOR rec IN 
        SELECT LOWER(email) as email, array_agg(id::text ORDER BY (CASE WHEN assessment_token IS NOT NULL AND assessment_token != '' THEN 0 ELSE 1 END), (CASE WHEN job_id IS NOT NULL THEN 0 ELSE 1 END), score DESC, created_at DESC) as ids
        FROM candidates
        WHERE email IS NOT NULL AND email != ''
        GROUP BY LOWER(email)
        HAVING count(*) > 1
    LOOP
        primary_id := rec.ids[1];
        FOR i IN 2..array_length(rec.ids, 1) LOOP
            dup_id := rec.ids[i];
            UPDATE candidate_documents SET candidate_id = primary_id WHERE candidate_id = dup_id;
            UPDATE candidate_timeline SET candidate_id = primary_id WHERE candidate_id = dup_id;
            UPDATE candidate_activity_logs SET candidate_id = primary_id WHERE candidate_id = dup_id;
            UPDATE candidate_job_matches SET candidate_id = primary_id WHERE candidate_id = dup_id;
            UPDATE candidate_match_history SET candidate_id = primary_id WHERE candidate_id = dup_id;
            UPDATE applications SET candidate_id = primary_id WHERE candidate_id = dup_id;
            DELETE FROM candidates WHERE id::text = dup_id;
        END LOOP;
        RAISE NOTICE 'Merged duplicates for email %, kept primary ID %', rec.email, primary_id;
    END LOOP;
END $$;
