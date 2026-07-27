const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const tenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
  
  try {
    console.log("🚀 Setting up assessment & completed test for RAJESHH SHARMA...");

    // 1. Ensure Job Exists
    const jobTitle = "Chief Financial Officer (CFO)";
    const jobDesc = "Chief Financial Officer (CFO) based in Bengaluru. Responsible for financial strategy, capital allocation, treasury & cash flow management, investor relations, financial compliance (IndAS/IFRS), M&A valuation, risk governance, and ERP integration for corporate growth.";
    
    let jobId;
    const checkJob = await pool.query("SELECT id FROM jobs WHERE title = $1 AND tenant_id = $2 LIMIT 1", [jobTitle, tenantId]);
    if (checkJob.rowCount > 0) {
      jobId = checkJob.rows[0].id;
    } else {
      jobId = "job-cfo-bengaluru-001";
      await pool.query(
        "INSERT INTO jobs (id, title, description, tenant_id, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (id) DO NOTHING",
        [jobId, jobTitle, jobDesc, tenantId]
      );
    }

    // 2. Ensure Candidate Exists
    const candName = "RAJESHH SHARMA";
    const candEmail = "rajeshh.sharma@hotmail.com";
    const candPhone = "+91 98450 12345";
    const token = "cfo-rajeshh-sharma-token-2026";
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    let candidateId;
    const checkCand = await pool.query("SELECT id FROM candidates WHERE email ILIKE $1 LIMIT 1", [candEmail]);
    if (checkCand.rowCount > 0) {
      candidateId = checkCand.rows[0].id;
      await pool.query(
        `UPDATE candidates 
         SET name = $1, role = $2, job_id = $3, assessment_token = $4, assessment_token_expiry = $5, assessment_status = 'passed', assessment_score = 93
         WHERE id = $6`,
        [candName, jobTitle, jobId, token, expiry, candidateId]
      );
    } else {
      candidateId = "cand-cfo-rajeshh-001";
      await pool.query(
        `INSERT INTO candidates (
          id, tenant_id, name, email, phone, role, score, match_percent, experience_years, 
          status, application_source, assessment_score, assessment_status, assessment_token, assessment_token_expiry, 
          job_id, source_system, applied_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 92, 92, 18, 'shortlisted', 'Direct Application', 93, 'passed', $7, $8, $9, 'System', NOW(), NOW())`,
        [candidateId, tenantId, candName, candEmail, candPhone, jobTitle, token, expiry, jobId]
      );
    }

    // 3. Ensure Assessment & Questions Exist
    let assessmentId = "assess-cfo-bengaluru-001";
    const checkAssess = await pool.query("SELECT id FROM assessments WHERE job_id = $1 LIMIT 1", [jobId]);
    if (checkAssess.rowCount > 0) {
      assessmentId = checkAssess.rows[0].id;
    } else {
      await pool.query(
        "INSERT INTO assessments (id, job_id, title, tenant_id, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (id) DO NOTHING",
        [assessmentId, jobId, `AI Executive Assessment - ${jobTitle}`, tenantId]
      );
    }

    // Define 15 Questions for CFO Role
    const cfoQuestions = [
      // IQ Questions (3)
      {
        id: "q-cfo-iq-1",
        text: "If a company's revenue doubles every 3 years, by what percentage does it grow over a 6-year period?",
        options: ["100%", "200%", "300%", "400%"],
        correct: "300%",
        difficulty: "medium",
        topic: "iq",
        candAns: "300%"
      },
      {
        id: "q-cfo-iq-2",
        text: "Which number logically completes the financial growth sequence: 10, 15, 25, 40, 60, ...?",
        options: ["80", "85", "90", "95"],
        correct: "85",
        difficulty: "medium",
        topic: "iq",
        candAns: "85"
      },
      {
        id: "q-cfo-iq-3",
        text: "If Project Alpha has a higher NPV than Project Beta under all discount rates above 8%, which statement must be true?",
        options: [
          "Project Alpha has a lower initial capital requirement",
          "Project Alpha yields greater net discounted value than Beta at market discount rate of 10%",
          "Project Beta has a shorter payback period",
          "Both projects have identical IRRs"
        ],
        correct: "Project Alpha yields greater net discounted value than Beta at market discount rate of 10%",
        difficulty: "hard",
        topic: "iq",
        candAns: "Project Alpha yields greater net discounted value than Beta at market discount rate of 10%"
      },

      // Self-Introduction & Leadership Profile (3)
      {
        id: "q-cfo-intro-1",
        text: "Which statement best summarizes your executive leadership strategy as CFO?",
        options: [
          "Driving long-term enterprise value through rigorous capital allocation, robust treasury management, and strategic M&A execution",
          "Focusing exclusively on manual book-keeping and monthly reporting",
          "Delegating all executive financial strategy to external audit firms",
          "Avoiding cross-functional collaboration with operations and technology leadership"
        ],
        correct: "Driving long-term enterprise value through rigorous capital allocation, robust treasury management, and strategic M&A execution",
        difficulty: "easy",
        topic: "self-introduction",
        candAns: "Driving long-term enterprise value through rigorous capital allocation, robust treasury management, and strategic M&A execution"
      },
      {
        id: "q-cfo-intro-2",
        text: "How do you align corporate finance functions with digital business transformation?",
        options: [
          "By deploying automated AI financial analytics, real-time cash flow forecasting, and modern cloud ERP platforms",
          "By maintaining legacy paper ledger systems to minimize software expense",
          "By restricting finance access to IT team members",
          "By relying solely on end-of-year accounting audits"
        ],
        correct: "By deploying automated AI financial analytics, real-time cash flow forecasting, and modern cloud ERP platforms",
        difficulty: "easy",
        topic: "self-introduction",
        candAns: "By deploying automated AI financial analytics, real-time cash flow forecasting, and modern cloud ERP platforms"
      },
      {
        id: "q-cfo-intro-3",
        text: "What guides your approach when evaluating capital expenditure (CapEx) proposals for high-growth initiatives?",
        options: [
          "Evaluating hurdle rates, Risk-Adjusted Return on Capital (RAROC), strategic fit, and impact on Free Cash Flow",
          "Approving proposals based strictly on department senior manager seniority",
          "Funding all CapEx proposals equally without hurdle rate benchmarking",
          "Deferring all expansion decisions until economic cycles end"
        ],
        correct: "Evaluating hurdle rates, Risk-Adjusted Return on Capital (RAROC), strategic fit, and impact on Free Cash Flow",
        difficulty: "easy",
        topic: "self-introduction",
        candAns: "Evaluating hurdle rates, Risk-Adjusted Return on Capital (RAROC), strategic fit, and impact on Free Cash Flow"
      },

      // Behavioral & Executive Leadership (3)
      {
        id: "q-cfo-beh-1",
        text: "During macroeconomic volatility or sudden liquidity crunches, how do you steer executive leadership decision-making?",
        options: [
          "Enforce zero-based budgeting, preserve liquidity reserves, stress-test working capital, and maintain open investor communications",
          "Halt all operations immediately without analyzing cash burn rates",
          "Increase short-term unhedged leverage to cover operational shortfalls",
          "Blame external market conditions without presenting contingency scenarios"
        ],
        correct: "Enforce zero-based budgeting, preserve liquidity reserves, stress-test working capital, and maintain open investor communications",
        difficulty: "medium",
        topic: "behavioral",
        candAns: "Enforce zero-based budgeting, preserve liquidity reserves, stress-test working capital, and maintain open investor communications"
      },
      {
        id: "q-cfo-beh-2",
        text: "When facing a conflict between aggressive revenue growth targets from sales leadership and conservative risk limits from risk management, how do you resolve it?",
        options: [
          "Convene executive stakeholders, evaluate risk-adjusted margins, establish clear credit control guardrails, and align incentives around profitable growth",
          "Side exclusively with sales and remove all credit risk guidelines",
          "Veto all sales expansion plans permanently",
          "Escalate to the board without offering a CFO recommendation"
        ],
        correct: "Convene executive stakeholders, evaluate risk-adjusted margins, establish clear credit control guardrails, and align incentives around profitable growth",
        difficulty: "medium",
        topic: "behavioral",
        candAns: "Convene executive stakeholders, evaluate risk-adjusted margins, establish clear credit control guardrails, and align incentives around profitable growth"
      },
      {
        id: "q-cfo-beh-3",
        text: "An internal financial audit flags an accounting discrepancy in a subsidiary's revenue recognition. What is your immediate protocol?",
        options: [
          "Initiate an independent internal investigation, report transparently to the Audit Committee, issue restatements if material, and remediate internal controls",
          "Cover up the discrepancy until the external annual audit begins",
          "Blame the junior accounting staff publicly without investigating systemic controls",
          "Ignore the finding if the discrepancy is under 5% of sub revenue"
        ],
        correct: "Initiate an independent internal investigation, report transparently to the Audit Committee, issue restatements if material, and remediate internal controls",
        difficulty: "hard",
        topic: "behavioral",
        candAns: "Initiate an independent internal investigation, report transparently to the Audit Committee, issue restatements if material, and remediate internal controls"
      },

      // Technical CFO Domain Questions (6)
      {
        id: "q-cfo-tech-1",
        text: "Which formula accurately computes the Weighted Average Cost of Capital (WACC)?",
        options: [
          "WACC = (E/V * Re) + (D/V * Rd * (1 - Tc))",
          "WACC = (E/D * Re) + (D/E * Rd)",
          "WACC = Re + Rd * (1 + Tc)",
          "WACC = (V/E * Re) + (V/D * Rd)"
        ],
        correct: "WACC = (E/V * Re) + (D/V * Rd * (1 - Tc))",
        difficulty: "easy",
        topic: "technical",
        candAns: "WACC = (E/V * Re) + (D/V * Rd * (1 - Tc))"
      },
      {
        id: "q-cfo-tech-2",
        text: "Under Ind AS 116 / IFRS 16 (Leases), how are operating leases presented on the corporate balance sheet?",
        options: [
          "As Right-of-Use (ROU) Assets and corresponding Lease Liabilities",
          "As off-balance-sheet notes only",
          "As pure operating expenses in SG&A without balance sheet recognition",
          "As short-term trade payables"
        ],
        correct: "As Right-of-Use (ROU) Assets and corresponding Lease Liabilities",
        difficulty: "medium",
        topic: "technical",
        candAns: "As Right-of-Use (ROU) Assets and corresponding Lease Liabilities"
      },
      {
        id: "q-cfo-tech-3",
        text: "What is the primary objective of managing the Cash Conversion Cycle (CCC)?",
        options: [
          "Optimizing Days Sales Outstanding (DSO) + Days Inventory Outstanding (DIO) - Days Payable Outstanding (DPO) to maximize operational liquidity",
          "Increasing Days Inventory Outstanding to stockpile raw materials",
          "Reducing Days Payable Outstanding to pay vendors immediately regardless of credit terms",
          "Eliminating working capital requirements entirely"
        ],
        correct: "Optimizing Days Sales Outstanding (DSO) + Days Inventory Outstanding (DIO) - Days Payable Outstanding (DPO) to maximize operational liquidity",
        difficulty: "medium",
        topic: "technical",
        candAns: "Optimizing Days Sales Outstanding (DSO) + Days Inventory Outstanding (DIO) - Days Payable Outstanding (DPO) to maximize operational liquidity"
      },
      {
        id: "q-cfo-tech-4",
        text: "In M&A valuation, how does Enterprise Value (EV) relate to Equity Value?",
        options: [
          "Enterprise Value = Equity Value + Total Debt - Cash & Cash Equivalents + Preferred Stock + Minority Interest",
          "Enterprise Value = Equity Value - Total Debt + Cash & Cash Equivalents",
          "Enterprise Value = Net Income * P/E Ratio",
          "Enterprise Value = Total Assets - Total Liabilities"
        ],
        correct: "Enterprise Value = Equity Value + Total Debt - Cash & Cash Equivalents + Preferred Stock + Minority Interest",
        difficulty: "medium",
        topic: "technical",
        candAns: "Enterprise Value = Equity Value + Total Debt - Cash & Cash Equivalents + Preferred Stock + Minority Interest"
      },
      {
        id: "q-cfo-tech-5",
        text: "Which interest rate risk management strategy is commonly utilized by CFOs to swap floating-rate debt for fixed-rate obligations?",
        options: [
          "Interest Rate Swaps (IRS)",
          "Equity Rights Issue",
          "Factoring Accounts Receivable",
          "Reverse Stock Split"
        ],
        correct: "Interest Rate Swaps (IRS)",
        difficulty: "hard",
        topic: "technical",
        candAns: "Interest Rate Swaps (IRS)"
      },
      {
        id: "q-cfo-tech-6",
        text: "Which valuation methodology is most appropriate for a early-stage pre-revenue subsidiary expansion where cash flows are highly uncertain?",
        options: [
          "Discounted Cash Flow (DCF) with sensitivity analysis and Real Options Valuation",
          "Book Value of Fixed Assets",
          "Historical Dividend Discount Model",
          "Trailing 12-Month P/E Multiple"
        ],
        correct: "Discounted Cash Flow (DCF) with sensitivity analysis and Real Options Valuation",
        difficulty: "hard",
        topic: "technical",
        candAns: "Book Value of Fixed Assets"
      }
    ];

    // Store questions into assessment_questions table
    await pool.query("DELETE FROM assessment_questions WHERE assessment_id = $1", [assessmentId]);
    for (let i = 0; i < cfoQuestions.length; i++) {
      const q = cfoQuestions[i];
      await pool.query(
        `INSERT INTO assessment_questions (id, assessment_id, question_text, options, correct_answer, difficulty, topic, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text, options = EXCLUDED.options, correct_answer = EXCLUDED.correct_answer`,
        [q.id, assessmentId, q.text, JSON.stringify(q.options), q.correct, q.difficulty, q.topic, tenantId]
      );
    }

    // 4. Create Completed Assessment Attempt Record
    const attemptId = "attempt-cfo-rajeshh-2026";
    const sessionId = "session-cfo-rajeshh-998877";

    const candAnswersObj = {};
    let correctCount = 0;
    cfoQuestions.forEach(q => {
      candAnswersObj[q.id] = q.candAns;
      if (q.candAns === q.correct) {
        correctCount++;
      }
    });

    const scorePct = Math.round((correctCount / cfoQuestions.length) * 100); // 93%

    await pool.query("DELETE FROM assessment_attempts WHERE candidate_id = $1", [candidateId]);
    await pool.query(
      `INSERT INTO assessment_attempts (
        id, candidate_id, assessment_id, status, correct_answers, incorrect_answers, 
        score, time_taken, violation_count, session_id, started_at, completed_at, 
        tenant_id, current_answers, current_question_index
      ) VALUES (
        $1, $2, $3, 'completed', $4, $5, $6, 860, 0, $7, NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '10 minutes',
        $8, $9, 14
      )`,
      [
        attemptId, candidateId, assessmentId, correctCount, cfoQuestions.length - correctCount,
        scorePct, sessionId, tenantId, JSON.stringify(candAnswersObj)
      ]
    );

    // Update candidate score
    await pool.query(
      `UPDATE candidates 
       SET assessment_score = $1, assessment_status = 'passed', status = 'shortlisted' 
       WHERE id = $2`,
      [scorePct, candidateId]
    );

    console.log(`✅ Completed test record for RAJESHH SHARMA saved successfully in DB! Score: ${scorePct}% (${correctCount}/15)`);
  } catch (err) {
    console.error("❌ Error in main script:", err);
  } finally {
    await pool.end();
  }
}

main();
