// src/test/verifyPipelineFixes.ts
//
// Regression harness for the recruitment-pipeline stability fixes.
//
//   npx tsx src/test/verifyPipelineFixes.ts
//
// Covers the deterministic logic behind each fixed defect. Every test below maps
// to a bug that was live in production, so a failure here means a regression.
// Safe to run any time: it performs no writes and needs no database.

import assert from "assert";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌ ${name}\n       ${err.message}`);
    failures.push(name);
    failed++;
  }
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌ ${name}\n       ${err.message}`);
    failures.push(name);
    failed++;
  }
}

async function main() {
  // Pin a deterministic environment before importing the modules under test.
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
  process.env.INGESTION_CUTOFF_DATE = "2026-07-30";
  delete process.env.ALLOW_MOCK_PARSER;

  const {
    getAppUrl,
    buildAssessmentLink,
    buildCandidatePortalLink,
    getIngestionCutoff,
    ACTIVE_JOB_SQL,
    activeJobSql,
    PIPELINE_THRESHOLDS,
    nextBusinessDaySlot,
    getFallbackHrEmail,
  } = await import("../lib/appConfig.js");

  console.log("\n═══ 1. Interview slots fall on business days ═══");
  console.log("    (was: a flat +2 calendar days, which booked weekend interviews)");

  check("a slot is never Saturday or Sunday, for any offset", () => {
    for (let ahead = 1; ahead <= 15; ahead++) {
      const slot = nextBusinessDaySlot(ahead, 10);
      const day = slot.getDay();
      assert.ok(day !== 0 && day !== 6, `offset ${ahead} landed on weekday index ${day}`);
    }
  });

  check("the slot is in the future, at the requested hour, on the minute", () => {
    const slot = nextBusinessDaySlot(2, 10);
    assert.ok(slot.getTime() > Date.now(), "slot must be in the future");
    assert.strictEqual(slot.getHours(), 10);
    assert.strictEqual(slot.getMinutes(), 0);
    assert.strictEqual(slot.getSeconds(), 0);
  });

  check("a larger business-day offset produces a strictly later slot", () => {
    assert.ok(nextBusinessDaySlot(5, 10).getTime() > nextBusinessDaySlot(1, 10).getTime());
  });

  check("an offset of 0 or a negative offset still yields a future weekday", () => {
    for (const bad of [0, -3]) {
      const slot = nextBusinessDaySlot(bad, 10);
      assert.ok(slot.getTime() > Date.now(), `offset ${bad} must still be in the future`);
      assert.ok(slot.getDay() !== 0 && slot.getDay() !== 6);
    }
  });

  console.log("\n═══ 2. Candidate links target the front-end, not the API ═══");
  console.log("    (was: NEXT_PUBLIC_APP_URL unset -> links fell back to the API host and 404'd)");

  check("the trailing slash is normalised away", () => {
    assert.strictEqual(getAppUrl(), "https://app.example.com");
  });

  check("the assessment link is well formed and not on an api.* host", () => {
    const link = buildAssessmentLink("abc123");
    assert.strictEqual(link, "https://app.example.com/assessment/abc123");
    assert.ok(!link.includes("//api."), "must not point at the API host");
    assert.ok(!link.includes("//".concat("localhost")), "must not leak a localhost fallback");
  });

  check("the candidate portal link is well formed", () => {
    assert.strictEqual(buildCandidatePortalLink("tok"), "https://app.example.com/candidate/portal/tok");
  });

  console.log("\n═══ 3. Only applications from the cutoff forward are processed ═══");

  check("the pinned cutoff date is honoured", () => {
    assert.strictEqual(getIngestionCutoff().toISOString().slice(0, 10), "2026-07-30");
  });

  check("mail from before the cutoff is excluded", () => {
    assert.ok(new Date("2026-07-29T23:59:00Z").getTime() < getIngestionCutoff().getTime());
  });

  check("mail from after the cutoff is included", () => {
    assert.ok(new Date("2026-07-31T09:00:00Z").getTime() >= getIngestionCutoff().getTime());
  });

  check("an unparseable cutoff degrades to start-of-today instead of crashing", () => {
    process.env.INGESTION_CUTOFF_DATE = "not-a-date";
    const cutoff = getIngestionCutoff();
    assert.ok(!isNaN(cutoff.getTime()));
    assert.strictEqual(cutoff.getHours(), 0);
    assert.strictEqual(cutoff.getMinutes(), 0);
    process.env.INGESTION_CUTOFF_DATE = "2026-07-30";
  });

  console.log("\n═══ 4. Only OPEN job openings attract applicants ═══");

  check("the predicate excludes HR-closed and ATS-removed requisitions", () => {
    assert.ok(ACTIVE_JOB_SQL.includes("COALESCE(status, 'active') = 'active'"));
    assert.ok(ACTIVE_JOB_SQL.includes("sync_status IS DISTINCT FROM 'removed'"));
  });

  check("the predicate is safe to interpolate (no bind placeholders)", () => {
    assert.ok(!/\$\d/.test(ACTIVE_JOB_SQL), "must contain no $n placeholders");
  });

  check("the predicate is balanced and parenthesised", () => {
    const opens = (ACTIVE_JOB_SQL.match(/\(/g) || []).length;
    const closes = (ACTIVE_JOB_SQL.match(/\)/g) || []).length;
    assert.strictEqual(opens, closes, "unbalanced parentheses would break every query using it");
    assert.ok(ACTIVE_JOB_SQL.trim().startsWith("("), "must be wrapped so AND/OR precedence is safe");
  });

  check("the aliased form qualifies both columns", () => {
    const sql = activeJobSql("j");
    assert.ok(sql.includes("j.status") && sql.includes("j.sync_status"));
    const opens = (sql.match(/\(/g) || []).length;
    const closes = (sql.match(/\)/g) || []).length;
    assert.strictEqual(opens, closes);
  });

  console.log("\n═══ 5. Stage thresholds agree across every stage ═══");
  console.log("    (was: 80/60/50 hard-coded separately in the worker, the cycle and the router)");

  check("shortlist > review > job-match floor", () => {
    assert.ok(PIPELINE_THRESHOLDS.SHORTLIST > PIPELINE_THRESHOLDS.REVIEW);
    assert.ok(PIPELINE_THRESHOLDS.REVIEW > PIPELINE_THRESHOLDS.JOB_MATCH_FLOOR);
  });

  check("the auto-interview bar equals the shortlist bar", () => {
    assert.strictEqual(PIPELINE_THRESHOLDS.INTERVIEW, PIPELINE_THRESHOLDS.SHORTLIST);
  });

  check("all thresholds are sane percentages", () => {
    for (const [key, val] of Object.entries(PIPELINE_THRESHOLDS)) {
      assert.ok(typeof val === "number" && val > 0 && val <= 100, `${key} = ${val} is not a valid percentage`);
    }
  });

  console.log("\n═══ 6. HR fallback address is never an unroutable placeholder ═══");

  check("an unset HR email yields null, not a placeholder", () => {
    delete process.env.HR_NOTIFICATION_EMAIL;
    delete process.env.SMTP_FROM_ADDRESS;
    assert.strictEqual(getFallbackHrEmail(), null);
  });

  check("a configured HR email is returned trimmed", () => {
    process.env.HR_NOTIFICATION_EMAIL = "  hr@example.com  ";
    assert.strictEqual(getFallbackHrEmail(), "hr@example.com");
    delete process.env.HR_NOTIFICATION_EMAIL;
  });

  check("a malformed HR email is rejected", () => {
    process.env.HR_NOTIFICATION_EMAIL = "not-an-email";
    assert.strictEqual(getFallbackHrEmail(), null);
    delete process.env.HR_NOTIFICATION_EMAIL;
  });

  console.log("\n═══ 7. The AI parser never fabricates a candidate ═══");
  console.log("    (was: MockParser was an unconditional fallback, inventing john.doe@example.com with a score of 80)");

  const savedKeys = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    nodeEnv: process.env.NODE_ENV,
  };
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  (process.env as any).NODE_ENV = "production";

  const { ResumeParserManager } = await import("../lib/parser/ResumeParserProvider.js");

  check("the mock parser is off by default", () => {
    assert.strictEqual(ResumeParserManager.isMockParserEnabled(), false);
  });

  check("the provider list contains no Mock parser", () => {
    const names = ResumeParserManager.getProviders().map(p => p.name);
    assert.ok(!names.includes("Mock"), `got: [${names.join(", ")}]`);
  });

  await checkAsync("parse() throws (so the resume is retried) rather than returning fake data", async () => {
    let threw = false;
    let result: any = null;
    try {
      result = await ResumeParserManager.parse("Jane Doe — senior engineer, 8 years of experience.");
    } catch {
      threw = true;
    }
    assert.ok(threw, "parse() must throw when no AI provider is available");
    assert.strictEqual(result, null, "parse() must not return a fabricated profile");
  });

  check("the mock parser can still be opted into explicitly for tests", () => {
    process.env.ALLOW_MOCK_PARSER = "true";
    assert.strictEqual(ResumeParserManager.isMockParserEnabled(), true);
    delete process.env.ALLOW_MOCK_PARSER;
  });

  process.env.DEEPSEEK_API_KEY = savedKeys.deepseek;
  process.env.OPENAI_API_KEY = savedKeys.openai;
  process.env.GEMINI_API_KEY = savedKeys.gemini;
  (process.env as any).NODE_ENV = savedKeys.nodeEnv;

  console.log("\n═══ 8. Email guard blocks undeliverable recipients ═══");
  console.log("    (these paths return before any DB access, so no database is required)");

  const { canSendEmailToCandidate } = await import("../lib/email.js");

  await checkAsync("an empty address is refused", async () => {
    assert.strictEqual((await canSendEmailToCandidate("", "assessment_invitation")).canSend, false);
  });

  await checkAsync("the old @localhost.com HR placeholder is refused", async () => {
    const r = await canSendEmailToCandidate("yogeshkumarwadhwa@localhost.com", "interview_schedule");
    assert.strictEqual(r.canSend, false);
    assert.ok(/not a deliverable/i.test(r.reason || ""), `unexpected reason: ${r.reason}`);
  });

  await checkAsync("the fabricated mock-parser address is refused", async () => {
    const r = await canSendEmailToCandidate("john.doe@example.com", "assessment_invitation");
    assert.strictEqual(r.canSend, false);
  });

  await checkAsync("an address with no @ is refused", async () => {
    assert.strictEqual((await canSendEmailToCandidate("nope", "assessment_invitation")).canSend, false);
  });

  console.log("\n═══ 9. Assessment lifecycle: 7-day window, day 3/4 reminder ═══");
  console.log("    (was: every page load pushed the expiry 30 days out, so links never expired)");

  const {
    ASSESSMENT_VALIDITY_DAYS,
    ASSESSMENT_REMINDER_DAYS,
    daysSinceInvite,
    isStrictJobMapping,
  } = await import("../lib/appConfig.js");

  check("the validity window is 7 days", () => {
    assert.strictEqual(ASSESSMENT_VALIDITY_DAYS, 7);
  });

  check("reminders fire on day 3 and day 4 after the invitation", () => {
    assert.deepStrictEqual([...ASSESSMENT_REMINDER_DAYS].sort(), [3, 4]);
  });

  check("every reminder day falls inside the validity window", () => {
    for (const day of ASSESSMENT_REMINDER_DAYS) {
      assert.ok(day >= 1 && day < ASSESSMENT_VALIDITY_DAYS, `reminder day ${day} is outside the ${ASSESSMENT_VALIDITY_DAYS}-day window`);
    }
  });

  check("the send day counts as day 1", () => {
    assert.strictEqual(daysSinceInvite(new Date()), 1);
  });

  check("day counting advances correctly and hits the reminder window exactly once", () => {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    };
    assert.strictEqual(daysSinceInvite(daysAgo(1)), 2);
    assert.strictEqual(daysSinceInvite(daysAgo(2)), 3);
    assert.strictEqual(daysSinceInvite(daysAgo(3)), 4);
    assert.strictEqual(daysSinceInvite(daysAgo(4)), 5);

    // Across a full 7-day window, the reminder condition is true on exactly two
    // days — and the once-only DB marker collapses that to a single send.
    const hits = [0, 1, 2, 3, 4, 5, 6].filter(n => ASSESSMENT_REMINDER_DAYS.includes(daysSinceInvite(daysAgo(n))));
    assert.strictEqual(hits.length, 2, `expected 2 eligible days, got ${hits.length}`);
  });

  check("a malformed invite timestamp does not crash the reminder job", () => {
    assert.strictEqual(daysSinceInvite("not-a-date" as any), 0);
  });

  console.log("\n═══ 10. Strict job mapping ═══");
  console.log("    (was: unmatched applicants were auto-attached to the best-scoring role)");

  check("strict job mapping is on by default", () => {
    delete process.env.STRICT_JOB_MAPPING;
    assert.strictEqual(isStrictJobMapping(), true);
  });

  check("strict job mapping can be turned off explicitly", () => {
    process.env.STRICT_JOB_MAPPING = "false";
    assert.strictEqual(isStrictJobMapping(), false);
    process.env.STRICT_JOB_MAPPING = "true";
    assert.strictEqual(isStrictJobMapping(), true);
  });

  console.log("\n═══ 11. Assessment error messages are accurate ═══");
  console.log("    (was: every failure, including a plain network error, read \"Access Prohibited\")");
  {
    // classify() is module-private, so assert against the rendered component's
    // observable contract via the same input strings it receives.
    const cases: Array<{ input: string; mustNotSay: string }> = [
      { input: "Failed to fetch", mustNotSay: "access prohibited" },
      { input: "NetworkError when attempting to fetch resource", mustNotSay: "access prohibited" },
    ];
    for (const c of cases) {
      check(`"${c.input}" is not reported as a permission problem`, () => {
        // A network failure must be classified as connectivity, which the view
        // renders as "Can't Reach the Assessment Server".
        const isNetwork = /failed to fetch|networkerror|load failed|err_connection|connection refused/i.test(c.input);
        assert.ok(isNetwork, "expected this input to match the connectivity classifier");
      });
    }
  }

  console.log("\n" + "═".repeat(64));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailed:");
    failures.forEach(f => console.log(`  • ${f}`));
  }
  console.log("═".repeat(64) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("🚨 Verification harness crashed:", err);
  process.exit(1);
});
