import { callDeepSeek } from "./deepseek.js";
import { query } from "./db.js";

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

// Fallback technical questions for SCM Executive (6 questions)
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
    questionText: "In SAP ERP, which module is primarily used for Materials Management and purchasing activities?",
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

// Fallback technical questions for Frontend (6 questions)
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

// Fallback technical questions for DevOps (6 questions)
const DEVOPS_TECHNICAL_QUESTIONS: Question[] = [
  {
    questionText: "What is the primary benefit of infrastructure as code (IaC)?",
    options: [
      "It eliminates the need for any cloud provider accounts",
      "It allows managing and provisioning infrastructure through machine-readable definition files, enabling version control",
      "It automatically optimizes database query speed",
      "It makes physical server hardware redundant"
    ],
    correctAnswer: "It allows managing and provisioning infrastructure through machine-readable definition files, enabling version control",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "Which containerization tool is most widely used to package applications and their dependencies?",
    options: ["Docker", "Kubernetes", "VirtualBox", "Terraform"],
    correctAnswer: "Docker",
    difficulty: "easy",
    topic: "technical"
  },
  {
    questionText: "In Terraform, what is the purpose of the state file (terraform.tfstate)?",
    options: [
      "To store secret environment credentials only",
      "To map real-world resources to your configuration and keep track of metadata",
      "To write bash commands for execution on VMs",
      "To cache downloaded provider binaries"
    ],
    correctAnswer: "To map real-world resources to your configuration and keep track of metadata",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "Which of the following describes the core objective of a CI/CD pipeline?",
    options: [
      "To guarantee 100% server uptime at all times",
      "To automate the building, testing, and deployment of code changes",
      "To write documentation automatically using AI",
      "To screen candidates using automated assessment tests"
    ],
    correctAnswer: "To automate the building, testing, and deployment of code changes",
    difficulty: "medium",
    topic: "technical"
  },
  {
    questionText: "In Kubernetes, which component is responsible for maintaining network rules on nodes, allowing communication to your Pods?",
    options: ["kube-apiserver", "kube-proxy", "kube-scheduler", "etcd"],
    correctAnswer: "kube-proxy",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "In a GitOps workflow utilizing ArgoCD, what happens when a manual change is made directly to a live Kubernetes cluster resource via kubectl?",
    options: [
      "ArgoCD will automatically delete the cluster",
      "ArgoCD will detect a 'OutOfSync' state and, if self-healing is enabled, automatically revert the change to match the Git repository",
      "The Git repository is automatically updated with the manual changes",
      "The cluster crashes immediately due to validation errors"
    ],
    correctAnswer: "ArgoCD will detect a 'OutOfSync' state and, if self-healing is enabled, automatically revert the change to match the Git repository",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback technical questions for Sales/Business (6 questions)
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
    console.warn("⚠️ No active AI provider API key configured or AI_PROVIDER is mock. Falling back to default questions.");
    return selectFallbackQuestions(jobTitle);
  }

  const prompt = `You are a senior domain expert designing a clear, approachable hiring assessment. Analyze the following Job Description and generate exactly 15 practical and relevant Multiple Choice Questions (MCQs). The assessment should test standard candidate competencies for this role.
 
 Job Title: ${jobTitle}
 Job Description:
 ${jobDescription}
 
 Generate exactly 15 questions meeting these requirements:
 - Options: Exactly 4 options per question.
 - Correct Answer: One single correct answer that MUST match one of the 4 options EXACTLY.
 - Core coverage (topics mapping):
   * IQ (Cognitive, logical reasoning, and pattern recognition) (3 questions, topic: 'iq')
   * Technical (Role-based core competencies and knowledge) (6 questions, topic: 'technical')
   * Behavioral (Situational judgment, communication, and interpersonal skills) (3 questions, topic: 'behavioral')
   * Self-introduction (Professional profile matching, background introduction, career motivation/goals) (3 questions, topic: 'self-introduction')
 - Difficulty distribution:
   * Easy (6 questions, covering self-introduction and straightforward IQ/behavioral/technical scenarios)
   * Medium (6 questions, covering standard core concepts)
   * Hard (3 questions, covering slightly more advanced scenarios)
 
 CRITICAL RULES FOR QUESTION & OPTION QUALITY (MOST IMPORTANT):
 1. BALANCED QUESTIONS: Design practical, day-to-day work scenarios and standard job competencies. Do not make the questions excessively complex, tricky, or purely theoretical; they should test general, practical proficiency.
 2. DISTRACTORS MUST BE PLAUSIBLE: Wrong answers must represent common mistakes or plausible misunderstandings.
 3. OPTIONS MUST MATCH IN LENGTH AND TONE: Ensure all 4 options have similar sentence structure, detail level, and length. The correct answer must NOT be longer or more detailed than the distractors.
 4. INCORRECT OPTIONS MUST BE REAL TERMS/CONCEPTS: Never use made-up words or joke choices.
 5. RANDOMIZE CORRECT ANSWER POSITION: The correct answer should appear in different positions (A, B, C, or D) across questions.
 6. NO GIVEAWAY PATTERNS: Do not use words like 'never', 'always', 'all of the above', or 'none of the above' in wrong answers.

CRITICAL RULES FOR JSON VALIDITY:
1. Do NOT use double quotes inside your question texts or options (e.g., instead of "What does "SCM" mean?", write "What does 'SCM' mean?"). If you need quotes inside the text, use single quotes.
2. Return ONLY a valid, parseable JSON object matching the structure below. Do not include markdown code block formatting (such as \`\`\`json), and do not include any text outside of the JSON.

JSON Structure:
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
}

Ensure the questions are highly specific to the requirements mentioned in the Job Description, challenging, and professionally written.`;

  try {
    const rawResponse = await callDeepSeek(prompt, { maxTokens: 3500, temperature: 0.35 });
    let cleaned = rawResponse.trim();
    
    // Clean up code block wraps if any
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Strip trailing commas before closing braces/brackets to prevent JSON parse errors
    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    // Strip comments if any
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");

    const parsed = JSON.parse(cleaned) as { questions: Question[] };
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length === 15) {
      // Basic validation of keys
      const validated = parsed.questions.map(q => {
        const difficulty = ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium";
        const topic = ["iq", "technical", "behavioral", "self-introduction"].includes(q.topic) ? q.topic : "technical";
        
        // Ensure options list has exactly 4 items
        let options = q.options;
        if (!Array.isArray(options) || options.length !== 4) {
          options = ["Option A", "Option B", "Option C", "Option D"];
        }
        
        // Ensure correct answer is exactly one of the options
        let correctAnswer = q.correctAnswer;
        if (!options.includes(correctAnswer)) {
          correctAnswer = options[0];
        }

        // Shuffle options (Fisher-Yates) to randomize correct answer position
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
      return validated;
    } else {
      throw new Error(`AI generated ${parsed?.questions?.length || 0} questions instead of 15`);
    }
  } catch (err: any) {
    console.error("❌ DeepSeek question generation failed, falling back to mock questions:", err.message);
    return selectFallbackQuestions(jobTitle);
  }
}

/**
 * Match a role and select fallback questions
 */
function selectFallbackQuestions(jobTitle: string): Question[] {
  const title = jobTitle.toLowerCase();
  let techQuestions: Question[] = [];

  if (title.includes("scm") || title.includes("procurement") || title.includes("supply chain") || title.includes("operations") || title.includes("logistics") || title.includes("warehouse")) {
    console.log("Using SCM Executive fallback technical questions");
    techQuestions = SCM_TECHNICAL_QUESTIONS;
  } else if (title.includes("frontend") || title.includes("react") || title.includes("web") || title.includes("ui") || title.includes("angular") || title.includes("vue")) {
    console.log("Using Frontend Engineer fallback technical questions");
    techQuestions = FRONTEND_TECHNICAL_QUESTIONS;
  } else if (title.includes("devops") || title.includes("cloud") || title.includes("aws") || title.includes("sre") || title.includes("infrastructure") || title.includes("platform")) {
    console.log("Using DevOps Engineer fallback technical questions");
    techQuestions = DEVOPS_TECHNICAL_QUESTIONS;
  } else if (title.includes("sales") || title.includes("marketing") || title.includes("business") || title.includes("account") || title.includes("automobile") || title.includes("automotive") || title.includes("bdm") || title.includes("bde") || title.includes("hr") || title.includes("recruiter") || title.includes("manager") || title.includes("executive") || title.includes("retail") || title.includes("customer")) {
    console.log("Using Sales/Business fallback technical questions");
    techQuestions = SALES_TECHNICAL_QUESTIONS;
  } else {
    console.log("Using Generic fallback technical questions");
    techQuestions = GENERIC_TECHNICAL_QUESTIONS;
  }

  // Combine to create a full 15 question assessment (3 IQ + 6 Technical + 3 Behavioral + 3 Self-Intro)
  return [
    ...COMMON_IQ_QUESTIONS,
    ...techQuestions,
    ...COMMON_BEHAVIORAL_QUESTIONS,
    ...COMMON_SELF_INTRO_QUESTIONS
  ];
}

/**
 * Creates an assessment for a job if it does not already exist, returning the assessment ID.
 */
export async function ensureJobAssessment(jobId: string, jobTitle: string, jobDescription: string): Promise<string> {
  // Check if assessment already exists
  const existingAssessment = await query(
    `SELECT id FROM assessments WHERE job_id = $1 LIMIT 1;`,
    [jobId]
  );

  if (existingAssessment.rowCount && existingAssessment.rowCount > 0) {
    return existingAssessment.rows[0].id as string;
  }

  // Generate new questions
  const questions = await generateAssessmentQuestions(jobTitle, jobDescription);
  const assessmentId = `assess-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // Save assessment
  await query(
    `INSERT INTO assessments (id, job_id, title) VALUES ($1, $2, $3);`,
    [assessmentId, jobId, `${jobTitle} Assessment`]
  );

  // Save questions
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

  console.log(`✅ Assessment ${assessmentId} created for job ${jobId} (${jobTitle}) with 15 questions.`);
  return assessmentId;
}

/**
 * Regenerates assessment questions for a job by deleting old ones and creating fresh ones.
 * Use when existing questions were generated incorrectly or need to be refreshed.
 */
export async function regenerateJobAssessment(jobId: string, jobTitle: string, jobDescription: string): Promise<string> {
  // Delete existing assessment questions and assessment record for this job
  const existingAssessment = await query(
    `SELECT id FROM assessments WHERE job_id = $1 LIMIT 1;`,
    [jobId]
  );

  if (existingAssessment.rowCount && existingAssessment.rowCount > 0) {
    const oldAssessmentId = existingAssessment.rows[0].id;
    // Delete questions first (FK constraint)
    await query(`DELETE FROM assessment_questions WHERE assessment_id = $1;`, [oldAssessmentId]);
    // Delete assessment
    await query(`DELETE FROM assessments WHERE id = $1;`, [oldAssessmentId]);
    console.log(`🗑️ Deleted old assessment ${oldAssessmentId} for job ${jobId}`);
  }

  // Now create fresh assessment
  return ensureJobAssessment(jobId, jobTitle, jobDescription);
}
