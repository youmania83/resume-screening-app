import { callDeepSeek } from "./deepseek.js";
import { query } from "./db.js";
import crypto from "crypto";

export interface Question {
  questionText: string;
  options: string[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  topic: "iq" | "technical" | "behavioral" | "self-introduction" | string;
}

// Common IQ Questions (3 questions)
const COMMON_IQ_QUESTIONS: Question[] = [
  {
    questionText: "If a machine takes 5 minutes to package 5 items, how long does it take 100 machines to package 100 items?",
    options: ["100 minutes", "20 minutes", "5 minutes", "50 minutes"],
    correctAnswer: "5 minutes",
    difficulty: "medium",
    topic: "iq"
  },
  {
    questionText: "Which number should come next in the pattern: 3, 5, 8, 12, 17, ...?",
    options: ["21", "22", "23", "24"],
    correctAnswer: "23",
    difficulty: "medium",
    topic: "iq"
  },
  {
    questionText: "If all Bloops are Razzies and all Razzies are Lazzies, which of the following statements must be true?",
    options: ["All Bloops are Lazzies", "All Lazzies are Bloops", "No Bloops are Lazzies", "Some Razzies are not Lazzies"],
    correctAnswer: "All Bloops are Lazzies",
    difficulty: "hard",
    topic: "iq"
  }
];

// Common Behavioral Questions (3 questions)
const COMMON_BEHAVIORAL_QUESTIONS: Question[] = [
  {
    questionText: "You are working on a critical project with a tight deadline, and a colleague who is responsible for a key deliverable is unresponsive. How do you handle this?",
    options: [
      "Report them immediately to senior management and request a replacement",
      "Attempt to contact them through multiple channels, explain the impact on the timeline, and offer support or escalate if they remain unresponsive",
      "Do their work yourself without informing anyone to ensure the deadline is met",
      "Wait until the deadline passes and explain that the delay was entirely their fault"
    ],
    correctAnswer: "Attempt to contact them through multiple channels, explain the impact on the timeline, and offer support or escalate if they remain unresponsive",
    difficulty: "medium",
    topic: "behavioral"
  },
  {
    questionText: "A client or internal stakeholder is unhappy with the project's progress and expresses their frustration in a meeting. What is your first step?",
    options: [
      "Defend your team's timeline and explain the technical difficulties",
      "Listen actively, validate their concerns, investigate the root cause, and propose a clear remediation plan",
      "Promise an immediate solution without checking with the team",
      "Suggest rescheduling the meeting when they are calmer"
    ],
    correctAnswer: "Listen actively, validate their concerns, investigate the root cause, and propose a clear remediation plan",
    difficulty: "medium",
    topic: "behavioral"
  },
  {
    questionText: "You disagree with a decision made by your manager or lead regarding a project's implementation. What is the best way to handle the situation?",
    options: [
      "Voice your disagreement publicly in front of the client or entire team",
      "Discuss the matter privately, present data/alternative solutions, and align on a decision even if you disagree",
      "Ignore their decision and implement it your own way",
      "Complain to their peers or subordinates to gain support"
    ],
    correctAnswer: "Discuss the matter privately, present data/alternative solutions, and align on a decision even if you disagree",
    difficulty: "hard",
    topic: "behavioral"
  }
];

// Common Self-introduction Questions (3 questions)
const COMMON_SELF_INTRO_QUESTIONS: Question[] = [
  {
    questionText: "Which of the following statements best describes your core professional background and focus?",
    options: [
      "I am a specialist focused on optimizing systems, solving complex domain problems, and collaborating with cross-functional teams",
      "I prefer to work strictly under direct supervision and perform repetitive, routine tasks",
      "I am looking for a placeholder job with minimal duties and no learning curve",
      "I specialize in working in total isolation without interacting with other departments"
    ],
    correctAnswer: "I am a specialist focused on optimizing systems, solving complex domain problems, and collaborating with cross-functional teams",
    difficulty: "easy",
    topic: "self-introduction"
  },
  {
    questionText: "When starting a new role, how do you typically approach your first 30 days to ensure a successful integration?",
    options: [
      "Focus on learning the domain, understanding the team processes, and identifying quick wins to deliver value",
      "Wait for instructions and only perform assigned tasks",
      "Immediately propose major changes to the existing architecture or workflow",
      "Work in isolation to avoid distracting others"
    ],
    correctAnswer: "Focus on learning the domain, understanding the team processes, and identifying quick wins to deliver value",
    difficulty: "easy",
    topic: "self-introduction"
  },
  {
    questionText: "What is your primary motivation when choosing to apply for a new career opportunity?",
    options: [
      "Solving challenging problems and growing my domain expertise",
      "Minimizing work hours and avoiding responsibility",
      "Sticking strictly to routine tasks",
      "Working in isolation without team collaboration"
    ],
    correctAnswer: "Solving challenging problems and growing my domain expertise",
    difficulty: "easy",
    topic: "self-introduction"
  }
];

// Fallback technical questions for SCM & Logistics (6 questions)
const SCM_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "Which of the following is the primary objective of strategic procurement?",
    options: [
      "Minimizing purchase price only",
      "Maximizing overall value and minimizing Total Cost of Ownership (TCO)",
      "Buying only from local vendors",
      "Avoiding the use of ERP systems"
    ],
    correctAnswer: "Maximizing overall value and minimizing Total Cost of Ownership (TCO)",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "What does the abbreviation 'PO' stand for in supply chain management?",
    options: ["Purchase Order", "Procurement Officer", "Payment Option", "Production Output"],
    correctAnswer: "Purchase Order",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "When assessing vendor risk, which of the following is considered a key operational risk factor?",
    options: [
      "High geographical distance combined with single-sourcing",
      "Vendor using a newer version of Excel",
      "Vendor offering a slightly lower price than competitors",
      "Vendor's office being closed on Sundays"
    ],
    correctAnswer: "High geographical distance combined with single-sourcing",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "In ERP systems, which module is primarily used for Materials Management and purchasing activities?",
    options: ["SAP FI", "SAP MM", "SAP SD", "SAP HR"],
    correctAnswer: "SAP MM",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "How does implementing 'Just-In-Time' (JIT) inventory management affect warehouse holding costs?",
    options: [
      "It significantly increases holding costs",
      "It eliminates logistics costs entirely",
      "It minimizes holding costs by keeping inventory levels low",
      "It has no impact on holding costs"
    ],
    correctAnswer: "It minimizes holding costs by keeping inventory levels low",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which formula is commonly used to calculate the Economic Order Quantity (EOQ)?",
    options: [
      "Square root of ((2 * Demand * Ordering Cost) / Holding Cost)",
      "Demand * (Ordering Cost + Holding Cost)",
      "Square root of (Demand / (Ordering Cost * Holding Cost))",
      "(2 * Demand * Holding Cost) / Ordering Cost"
    ],
    correctAnswer: "Square root of ((2 * Demand * Ordering Cost) / Holding Cost)",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Engineering & Construction/Projects (6 questions)
const ENGINEERING_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "In project management, what is the primary purpose of defining the Critical Path?",
    options: [
      "To identify the sequence of crucial tasks that determines the total minimum project duration",
      "To calculate the total financial budget of the project",
      "To assign daily attendance to site workers",
      "To procure raw materials at the lowest price"
    ],
    correctAnswer: "To identify the sequence of crucial tasks that determines the total minimum project duration",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "What does 'EHS' stand for in engineering site operations?",
    options: [
      "Environment, Health, and Safety",
      "Engineering Hardware System",
      "Electrical Heating Specifications",
      "Equipment Handling Standard"
    ],
    correctAnswer: "Environment, Health, and Safety",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which document specifies technical quality, material standards, and compliance criteria for engineering site execution?",
    options: [
      "Bill of Quantities (BOQ) / Technical Specification Sheet",
      "Employee Payslip",
      "Vendor Marketing Brochure",
      "Office Attendance Register"
    ],
    correctAnswer: "Bill of Quantities (BOQ) / Technical Specification Sheet",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "In industrial electrical installations, what is the main purpose of earthing (grounding)?",
    options: [
      "To reduce electrical power consumption",
      "To protect equipment and personnel from dangerous shock by providing a low-resistance path for fault currents",
      "To increase voltage supply to machines",
      "To measure electrical current flow"
    ],
    correctAnswer: "To protect equipment and personnel from dangerous shock by providing a low-resistance path for fault currents",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "What does 'HVAC' stand for in building engineering services?",
    options: [
      "Heating, Ventilation, and Air Conditioning",
      "High Voltage Alternating Current",
      "Heavy Vehicle Automated Control",
      "Hydraulic Valve and Cable"
    ],
    correctAnswer: "Heating, Ventilation, and Air Conditioning",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "During quality control inspections for fabrication or structural welding, which Non-Destructive Testing (NDT) method is best suited for subsurface flaw detection?",
    options: [
      "Visual Inspection",
      "Ultrasonic Testing (UT) / Radiographic Testing (RT)",
      "Hammer Tapping",
      "Color Coating Test"
    ],
    correctAnswer: "Ultrasonic Testing (UT) / Radiographic Testing (RT)",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Finance & CFO (6 questions)
const FINANCE_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "Which financial statement provides a snapshot of a company's assets, liabilities, and equity at a specific point in time?",
    options: [
      "Income Statement (P&L)",
      "Balance Sheet",
      "Cash Flow Statement",
      "Statement of Retained Earnings"
    ],
    correctAnswer: "Balance Sheet",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "What does 'EBITDA' measure in corporate financial performance?",
    options: [
      "Earnings Before Interest, Taxes, Depreciation, and Amortization",
      "Equity Balance In Total Dollar Amounts",
      "Expected Business Income Tax Deductions Allowed",
      "Estimated Bank Interest and Tax Debt Balances"
    ],
    correctAnswer: "Earnings Before Interest, Taxes, Depreciation, and Amortization",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "In financial management, what does a Working Capital Ratio (Current Assets / Current Liabilities) less than 1.0 indicate?",
    options: [
      "The company has excess cash reserves",
      "The company may face short-term liquidity difficulties meeting immediate obligations",
      "The company is operating with zero debt",
      "The company has high inventory turnover"
    ],
    correctAnswer: "The company may face short-term liquidity difficulties meeting immediate obligations",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which capital budgeting metric calculates the discount rate at which the Net Present Value (NPV) of a project equals zero?",
    options: [
      "Internal Rate of Return (IRR)",
      "Payback Period",
      "Return on Investment (ROI)",
      "Debt-to-Equity Ratio"
    ],
    correctAnswer: "Internal Rate of Return (IRR)",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "In GAAP/IFRS accounting, what is the core difference between Cash Accounting and Accrual Accounting?",
    options: [
      "Accrual accounting records revenues and expenses when earned/incurred, while cash accounting records them when cash changes hands",
      "Cash accounting is mandatory for publicly listed companies",
      "Accrual accounting ignores accounts payable",
      "There is no practical difference between them"
    ],
    correctAnswer: "Accrual accounting records revenues and expenses when earned/incurred, while cash accounting records them when cash changes hands",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "Which ratio is used by lenders and investors to evaluate a company's ability to cover its debt interest payments from operating income?",
    options: [
      "Interest Coverage Ratio (EBIT / Interest Expense)",
      "Quick Ratio",
      "Asset Turnover Ratio",
      "Price-to-Earnings Ratio"
    ],
    correctAnswer: "Interest Coverage Ratio (EBIT / Interest Expense)",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Admin & HR (6 questions)
const ADMIN_HR_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "What is the primary function of an Applicant Tracking System (ATS) in talent acquisition?",
    options: [
      "To manage employee payroll and tax deductions",
      "To organize, track, and manage job applications and candidate recruitment workflows",
      "To schedule company vehicle maintenance",
      "To design marketing campaigns"
    ],
    correctAnswer: "To organize, track, and manage job applications and candidate recruitment workflows",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which document is essential for maintaining proper records of visitor management and front desk security in corporate offices?",
    options: [
      "Visitor Entry Log / Access Pass Register",
      "Annual Financial Audit Report",
      "Vendor Invoice Voucher",
      "Project Gantt Chart"
    ],
    correctAnswer: "Visitor Entry Log / Access Pass Register",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "In HR management, what does 'Onboarding' refer to?",
    options: [
      "The process of conducting exit interviews for departing staff",
      "The process of integrating a new employee into an organization and equipping them with necessary tools/knowledge",
      "The annual performance appraisal review meeting",
      "The calculation of monthly overtime wages"
    ],
    correctAnswer: "The process of integrating a new employee into an organization and equipping them with necessary tools/knowledge",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which communication practice is best suited for resolving administrative conflicts between internal departments?",
    options: [
      "Ignoring the conflict until it resolves itself",
      "Scheduling a structured alignment meeting, understanding mutual operational bottlenecks, and documenting agreed action items",
      "Escalating directly to external legal counsel",
      "Sending mass email warnings to all office employees"
    ],
    correctAnswer: "Scheduling a structured alignment meeting, understanding mutual operational bottlenecks, and documenting agreed action items",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "When managing office procurement for administrative supplies, what is the primary benefit of maintaining a preferred vendor list (PVL)?",
    options: [
      "Ensuring consistent pricing, pre-negotiated service level agreements (SLAs), and reliable delivery times",
      "Restricting office staff from requesting any supplies",
      "Eliminating the need for purchase approvals",
      "Doubling vendor payment costs"
    ],
    correctAnswer: "Ensuring consistent pricing, pre-negotiated service level agreements (SLAs), and reliable delivery times",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "Which key metric helps HR teams measure employee retention and organizational workforce stability over a given period?",
    options: [
      "Employee Attrition / Turnover Rate",
      "Cost Per Click (CPC)",
      "Return on Equity (ROE)",
      "Gross Margin Percentage"
    ],
    correctAnswer: "Employee Attrition / Turnover Rate",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Frontend & Software (6 questions)
const FRONTEND_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "Which hook should be used in React to perform side effects?",
    options: ["useState", "useContext", "useEffect", "useReducer"],
    correctAnswer: "useEffect",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which CSS layout system is best suited for responsive 1-dimensional layouts (rows or columns)?",
    options: ["CSS Grid", "Flexbox", "Floats", "Absolute positioning"],
    correctAnswer: "Flexbox",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "In React 18/19, what is the primary purpose of the 'Suspense' component?",
    options: [
      "To display a loading fallback while child components are fetching data or code-splitting",
      "To pause state updates until user confirms",
      "To handle Javascript runtime errors gracefully",
      "To block component rendering indefinitely"
    ],
    correctAnswer: "To display a loading fallback while child components are fetching data or code-splitting",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "How can you optimize the Largest Contentful Paint (LCP) for an image above the fold?",
    options: [
      "Set loading='lazy' on the image",
      "Add a 'fetchpriority=\"high\"' attribute to the image tag",
      "Convert the image to PNG and increase quality",
      "Hide the image on load and reveal with a slow animation"
    ],
    correctAnswer: "Add a 'fetchpriority=\"high\"' attribute to the image tag",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Under what condition would React.memo() fail to prevent a re-render of a child component?",
    options: [
      "If props are primitive values and remain identical",
      "If the parent component passes an inline function prop without wrapping it in useCallback",
      "If the child component is a functional component instead of a class",
      "If the child component uses Tailwind classes"
    ],
    correctAnswer: "If the parent component passes an inline function prop without wrapping it in useCallback",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "What is the key difference between Next.js App Router Server Actions and typical API routes?",
    options: [
      "Server Actions bypass CORS policy automatically",
      "Server Actions are called directly as asynchronous JavaScript functions in client components, abstracting the fetch layer",
      "Server Actions execute in the browser rather than the server",
      "Server Actions can only return HTML strings"
    ],
    correctAnswer: "Server Actions are called directly as asynchronous JavaScript functions in client components, abstracting the fetch layer",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Sales & Business (6 questions)
const SALES_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "What is the primary goal of a sales pipeline?",
    options: [
      "To track and manage potential customers at various stages of the buying process",
      "To build the company website",
      "To manage employee attendance records",
      "To calculate monthly server costs"
    ],
    correctAnswer: "To track and manage potential customers at various stages of the buying process",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which of the following is a key element of a strong customer value proposition?",
    options: [
      "Clearly articulating how your product solves a specific customer pain point",
      "Listing all company office addresses in the brochure",
      "Providing the longest product warranty in the market",
      "Offering the lowest price regardless of value delivered"
    ],
    correctAnswer: "Clearly articulating how your product solves a specific customer pain point",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "A customer objects to your product's price during a negotiation. What is the most effective response?",
    options: [
      "Immediately offer a discount to close the deal",
      "Acknowledge their concern, reframe the conversation around ROI and value, and present relevant case studies",
      "Ignore their objection and continue the product demonstration",
      "Tell the customer that the price is non-negotiable and end the meeting"
    ],
    correctAnswer: "Acknowledge their concern, reframe the conversation around ROI and value, and present relevant case studies",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which metric best measures sales team efficiency in converting leads to paying customers?",
    options: [
      "Website traffic volume",
      "Lead-to-Customer Conversion Rate",
      "Number of emails sent per day",
      "Social media follower count"
    ],
    correctAnswer: "Lead-to-Customer Conversion Rate",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "A key account representing 25% of your quarterly revenue is threatening to switch to a competitor. What is the most strategic approach?",
    options: [
      "Match the competitor's price immediately regardless of margin impact",
      "Conduct a thorough account review to understand their evolving needs, propose a tailored retention plan, and schedule an executive-level meeting",
      "Let the account go because no single customer should hold that much leverage",
      "Offer free products for 6 months to retain the account"
    ],
    correctAnswer: "Conduct a thorough account review to understand their evolving needs, propose a tailored retention plan, and schedule an executive-level meeting",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "What is the primary difference between 'consultative selling' and 'transactional selling'?",
    options: [
      "Consultative selling focuses on understanding client needs and building long-term relationships, while transactional selling prioritizes quick one-time sales",
      "Transactional selling involves more paperwork than consultative selling",
      "Consultative selling is only used in B2C markets",
      "There is no difference; they are the same approach"
    ],
    correctAnswer: "Consultative selling focuses on understanding client needs and building long-term relationships, while transactional selling prioritizes quick one-time sales",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Generic Roles (6 questions)
const GENERIC_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "What is the primary role of a firewall in a network security system?",
    options: [
      "To accelerate internet connection speeds",
      "To monitor and filter incoming and outgoing network traffic based on established security rules",
      "To store files in the cloud securely",
      "To manage software licenses for the organization"
    ],
    correctAnswer: "To monitor and filter incoming and outgoing network traffic based on established security rules",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which of the following is considered a best practice for strong password management?",
    options: [
      "Using the same password across multiple work accounts",
      "Using a password manager to generate and store unique, complex passwords",
      "Writing passwords down on a sticky note under the keyboard",
      "Changing passwords every day to simple words"
    ],
    correctAnswer: "Using a password manager to generate and store unique, complex passwords",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "What is the primary purpose of version control systems like Git?",
    options: [
      "To compile code into executable binaries",
      "To track changes to files, coordinate work on files among multiple people, and maintain project history",
      "To host applications in the cloud",
      "To audit database table sizes"
    ],
    correctAnswer: "To track changes to files, coordinate work on files among multiple people, and maintain project history",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which of the following SQL statements is used to fetch data from a database?",
    options: ["UPDATE", "INSERT", "SELECT", "DELETE"],
    correctAnswer: "SELECT",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "What is the primary difference between symmetric and asymmetric encryption?",
    options: [
      "Symmetric encryption uses different keys for encryption and decryption, while asymmetric uses the same key",
      "Symmetric encryption uses a single key for both encryption and decryption, while asymmetric uses a public/private key pair",
      "Symmetric encryption can only encrypt text files, while asymmetric can encrypt any file type",
      "Symmetric encryption is slow, while asymmetric encryption is fast"
    ],
    correctAnswer: "Symmetric encryption uses a single key for both encryption and decryption, while asymmetric uses a public/private key pair",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "Which metric is the best measure of a SaaS business's recurring subscription revenue health, normalized on a monthly basis?",
    options: ["CAC (Customer Acquisition Cost)", "MRR (Monthly Recurring Revenue)", "LTV (Customer Lifetime Value)", "NPS (Net Promoter Score)"],
    correctAnswer: "MRR (Monthly Recurring Revenue)",
    difficulty: "hard",
    topic: "technical"
  }
];

/**
 * AI Questions Generation Service
 */
export async function generateAssessmentQuestions(jobTitle: string, jobDescription: string): Promise<Question[]> {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const hasAPIKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;

  if (provider === "mock" || (!provider && !hasAPIKey)) {
    console.warn("⚠️ No active AI provider API key configured or AI_PROVIDER is mock. Using domain-specific fallback questions.");
    return selectFallbackQuestions(jobTitle);
  }

  const prompt = `You are a senior domain expert designing a clear, approachable hiring assessment. Analyze the following Job Description and generate exactly 15 practical and relevant Multiple Choice Questions (MCQs). The assessment should test standard candidate competencies for this role.
 
 Job Title: ${jobTitle}
 Job Description:
 ${jobDescription || jobTitle}
 
 Generate exactly 15 questions meeting these requirements:
 - Options: Exactly 4 options per question.
 - Correct Answer: One single correct answer that MUST match one of the 4 options EXACTLY.
 - Core coverage (topics mapping):
   * IQ (Cognitive, logical reasoning, and pattern recognition) (3 questions, topic: 'iq')
   * Technical (Role-based core competencies and knowledge) (6 questions, topic: 'technical')
   * Behavioral (Situational judgment, communication, and interpersonal skills) (3 questions, topic: 'behavioral')
   * Self-introduction (Professional profile matching, background introduction, career motivation/goals) (3 questions, topic: 'self-introduction')
 - Difficulty distribution:
   * Easy (6 questions)
   * Medium (6 questions)
   * Hard (3 questions)
 
 CRITICAL RULES FOR QUESTION & OPTION QUALITY:
 1. BALANCED QUESTIONS: Design practical, day-to-day work scenarios and standard job competencies.
 2. DISTRACTORS MUST BE PLAUSIBLE: Wrong answers must represent common mistakes or plausible misunderstandings.
 3. OPTIONS MUST MATCH IN LENGTH AND TONE: Ensure all 4 options have similar sentence structure and detail level.
 4. INCORRECT OPTIONS MUST BE REAL TERMS/CONCEPTS: Never use made-up words or joke choices.
 5. RANDOMIZE CORRECT ANSWER POSITION: The correct answer should appear in different positions (A, B, C, or D).

CRITICAL RULES FOR JSON VALIDITY:
1. Do NOT use double quotes inside your question texts or options (use single quotes instead).
2. Return ONLY a valid, parseable JSON object matching the structure below:

{
  "questions": [
    {
      "questionText": "What is ...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "difficulty": "hard",
      "topic": "technical"
    }
  ]
}`;

  try {
    const rawResponse = await callDeepSeek(prompt, { maxTokens: 3500, temperature: 0.35 });
    let cleaned = rawResponse.trim();
    
    // Clean up code block wraps if any
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");

    const parsed = JSON.parse(cleaned) as { questions: Question[] };
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length >= 10) {
      const validated = parsed.questions.slice(0, 15).map(q => {
        const difficulty = ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium";
        const topic = ["iq", "technical", "behavioral", "self-introduction"].includes(q.topic) ? q.topic : "technical";
        
        let options = q.options;
        if (!Array.isArray(options) || options.length !== 4) {
          options = ["Option A", "Option B", "Option C", "Option D"];
        }
        
        let correctAnswer = q.correctAnswer;
        if (!options.includes(correctAnswer)) {
          correctAnswer = options[0];
        }

        const shuffled = [...options];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return {
          questionText: q.questionText || "What is a key requirement of this role?",
          options: shuffled,
          correctAnswer,
          difficulty,
          topic
        } as Question;
      });

      // Top up to 15 questions if fewer than 15 returned by AI
      if (validated.length < 15) {
        const fallback = selectFallbackQuestions(jobTitle);
        const needed = 15 - validated.length;
        validated.push(...fallback.slice(0, needed));
      }

      return validated;
    } else {
      throw new Error(`AI generated invalid questions structure`);
    }
  } catch (err: any) {
    console.error("❌ DeepSeek question generation failed, falling back to domain questions:", err.message);
    return selectFallbackQuestions(jobTitle);
  }
}

/**
 * Match a role and select failure-proof fallback questions
 */
function selectFallbackQuestions(jobTitle: string): Question[] {
  const title = (jobTitle || "").toLowerCase();
  let techQuestions: Question[] = [];

  if (title.includes("scm") || title.includes("procurement") || title.includes("supply chain") || title.includes("logistics") || title.includes("warehouse")) {
    console.log("Using SCM & Logistics fallback technical questions");
    techQuestions = SCM_TECHNICAL_QUESTIONS;
  } else if (title.includes("civil") || title.includes("engineer") || title.includes("project") || title.includes("site") || title.includes("welder") || title.includes("fabrication") || title.includes("electrical")) {
    console.log("Using Engineering & Construction fallback technical questions");
    techQuestions = ENGINEERING_TECHNICAL_QUESTIONS;
  } else if (title.includes("cfo") || title.includes("finance") || title.includes("accounts") || title.includes("audit") || title.includes("commercial")) {
    console.log("Using Finance & CFO fallback technical questions");
    techQuestions = FINANCE_TECHNICAL_QUESTIONS;
  } else if (title.includes("admin") || title.includes("front desk") || title.includes("hr") || title.includes("recruiter") || title.includes("talent") || title.includes("assistant")) {
    console.log("Using Admin & HR fallback technical questions");
    techQuestions = ADMIN_HR_TECHNICAL_QUESTIONS;
  } else if (title.includes("frontend") || title.includes("react") || title.includes("web") || title.includes("software") || title.includes("devops") || title.includes("code")) {
    console.log("Using Software/Frontend fallback technical questions");
    techQuestions = FRONTEND_TECHNICAL_QUESTIONS;
  } else if (title.includes("sales") || title.includes("business") || title.includes("marketing") || title.includes("account manager")) {
    console.log("Using Sales & Business fallback technical questions");
    techQuestions = SALES_TECHNICAL_QUESTIONS;
  } else {
    console.log("Using Generic fallback technical questions");
    techQuestions = GENERIC_TECHNICAL_QUESTIONS;
  }

  // Combine to create a complete 15 question assessment (3 IQ + 6 Technical + 3 Behavioral + 3 Self-Intro)
  return [
    ...COMMON_IQ_QUESTIONS,
    ...techQuestions,
    ...COMMON_BEHAVIORAL_QUESTIONS,
    ...COMMON_SELF_INTRO_QUESTIONS
  ];
}

/**
 * Creates an assessment for a job if it does not already exist, returning the assessment ID.
 * Implements a Role-Level Database Question Bank: Questions are permanently saved to PostgreSQL.
 * Once generated for a job role/title, questions are reused from the database without invoking AI.
 */
export async function ensureJobAssessment(jobId: string, jobTitle: string, jobDescription: string): Promise<string> {
  const cleanJobTitle = (jobTitle || "Software Engineer").trim();
  const normalizedTitle = cleanJobTitle.toLowerCase();

  // 1. Check if assessment already exists for this exact jobId AND has 15 saved questions
  const existingAssessment = await query(
    `SELECT a.id, COUNT(q.id)::int as q_count 
     FROM assessments a
     JOIN assessment_questions q ON q.assessment_id = a.id
     WHERE a.job_id = $1
     GROUP BY a.id
     HAVING COUNT(q.id) >= 15
     LIMIT 1;`,
    [jobId]
  );

  if (existingAssessment.rowCount && existingAssessment.rowCount > 0) {
    return existingAssessment.rows[0].id as string;
  }

  // If assessment exists but has fewer than 15 questions, clean it up before regenerating
  await query(`DELETE FROM assessment_questions WHERE assessment_id IN (SELECT id FROM assessments WHERE job_id = $1);`, [jobId]);
  await query(`DELETE FROM assessments WHERE job_id = $1;`, [jobId]);

  // 2. Check Role-Level Question Bank: Check if ANY existing assessment has 15 saved questions for the SAME job title / role!
  const roleQuestionBank = await query(
    `SELECT q.question_text, q.options, q.correct_answer, q.difficulty, q.topic
     FROM assessment_questions q
     JOIN assessments a ON q.assessment_id = a.id
     LEFT JOIN jobs j ON a.job_id = j.id
     WHERE LOWER(j.title) = $1 OR LOWER(a.title) LIKE $2 OR LOWER(a.title) = $1
     ORDER BY a.created_at DESC
     LIMIT 15;`,
    [normalizedTitle, `%${normalizedTitle}%`]
  );

  const assessmentId = crypto.randomUUID();

  if (roleQuestionBank.rowCount && roleQuestionBank.rowCount >= 15) {
    console.log(`🎯 [Question Cache HIT] Reusing 15 saved questions from database for role "${cleanJobTitle}" (jobId: ${jobId}). Zero AI calls!`);
    
    // Save assessment record
    await query(
      `INSERT INTO assessments (id, job_id, title) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING;`,
      [assessmentId, jobId, `${cleanJobTitle} Assessment`]
    );

    // Copy questions to new assessment for this job
    for (let i = 0; i < roleQuestionBank.rows.length; i++) {
      const q = roleQuestionBank.rows[i];
      const qId = `q-${assessmentId}-${i + 1}`;
      const optionsStr = typeof q.options === "string" ? q.options : JSON.stringify(q.options);
      
      await query(
        `INSERT INTO assessment_questions (id, assessment_id, question_text, options, correct_answer, difficulty, topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [qId, assessmentId, q.question_text, optionsStr, q.correct_answer, q.difficulty, q.topic]
      );
    }

    return assessmentId;
  }

  // 3. If no saved questions exist for this role in DB, generate via AI and permanently save to database!
  console.log(`🤖 [Question Cache MISS] Generating 15 new AI assessment MCQs for role "${cleanJobTitle}"...`);
  const questions = await generateAssessmentQuestions(cleanJobTitle, jobDescription);

  // Save assessment record
  await query(
    `INSERT INTO assessments (id, job_id, title) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING;`,
    [assessmentId, jobId, `${cleanJobTitle} Assessment`]
  );

  // Save questions permanently to database
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qId = `q-${assessmentId}-${i + 1}`;
    await query(
      `INSERT INTO assessment_questions (id, assessment_id, question_text, options, correct_answer, difficulty, topic)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        qId,
        assessmentId,
        q.questionText,
        JSON.stringify(q.options),
        q.correctAnswer,
        q.difficulty,
        q.topic
      ]
    );
  }

  console.log(`✅ [Database Saved] Assessment ${assessmentId} created & permanently saved for job ${jobId} (${cleanJobTitle}) with ${questions.length} questions.`);
  return assessmentId;
}

/**
 * Regenerates assessment questions for a job by deleting old ones and creating fresh ones.
 */
export async function regenerateJobAssessment(jobId: string, jobTitle: string, jobDescription: string): Promise<string> {
  // Delete every assessment row for this job, not just one. A job should
  // only ever have a single assessment, but a past race in ensureJobAssessment
  // (two concurrent callers both finding "no assessment yet" before either
  // finished inserting) could leave duplicates behind. Deleting via LIMIT 1
  // left the other duplicate orphaned, and later requests could resolve to
  // either one non-deterministically. assessment_questions, assessment_attempts
  // (and their sessions/violations) all cascade on assessment deletion.
  const deleted = await query(`DELETE FROM assessments WHERE job_id = $1 RETURNING id;`, [jobId]);
  if (deleted.rowCount && deleted.rowCount > 0) {
    console.log(`🗑️ Deleted ${deleted.rowCount} old assessment(s) for job ${jobId}`);
  }

  return ensureJobAssessment(jobId, jobTitle, jobDescription);
}
