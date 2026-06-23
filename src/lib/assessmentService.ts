import { callDeepSeek } from "./deepseek.js";
import { query } from "./db.js";

export interface Question {
  questionText: string;
  options: string[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  topic: "technical" | "practical" | "role-specific" | "industry";
}

// Fallback questions for SCM Executive
const FALLBACK_SCM_QUESTIONS: Question[] = [
  // Easy
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
    topic: "role-specific"
  },
  {
    questionText: "Which document is created by the buyer to authorize a transaction with a vendor?",
    options: ["Invoice", "Sales Receipt", "Purchase Order", "Bill of Lading"],
    correctAnswer: "Purchase Order",
    difficulty: "easy",
    topic: "industry"
  },
  // Medium
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
    topic: "practical"
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
    topic: "industry"
  },
  {
    questionText: "Which of the following represents a best practice for resolving a shipping delay from a critical vendor?",
    options: [
      "Immediately cancel the contract without contact",
      "Communicate with the vendor, check the buffer stock, and look for secondary suppliers if needed",
      "Wait indefinitely without checking internal inventory",
      "Withhold payments for past unrelated shipments immediately"
    ],
    correctAnswer: "Communicate with the vendor, check the buffer stock, and look for secondary suppliers if needed",
    difficulty: "medium",
    topic: "practical"
  },
  // Hard
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
  },
  {
    questionText: "Under GST regulations in India, what is the primary consequence of a vendor failing to file their GSTR-1 on time?",
    options: [
      "The buyer cannot claim Input Tax Credit (ITC) for that purchase",
      "The buyer's import license is immediately suspended",
      "The vendor is banned from selling goods in all states",
      "The buyer has to pay double tax on the purchase"
    ],
    correctAnswer: "The buyer cannot claim Input Tax Credit (ITC) for that purchase",
    difficulty: "hard",
    topic: "industry"
  },
  {
    questionText: "If a company has an annual demand of 12,000 units, ordering cost of $50/order, and holding cost of $3/unit/year, what is the approximate EOQ?",
    options: ["200 units", "400 units", "600 units", "632 units"],
    correctAnswer: "632 units",
    difficulty: "hard",
    topic: "practical"
  }
];

// Fallback questions for Frontend
const FALLBACK_FRONTEND_QUESTIONS: Question[] = [
  // Easy
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
    topic: "role-specific"
  },
  {
    questionText: "What is the primary benefit of TypeScript over JavaScript?",
    options: [
      "TypeScript compiles faster",
      "TypeScript provides static typing and catch errors at compile-time",
      "TypeScript executes faster in the browser",
      "TypeScript has no strict mode"
    ],
    correctAnswer: "TypeScript provides static typing and catch errors at compile-time",
    difficulty: "easy",
    topic: "technical"
  },
  // Medium
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
    topic: "practical"
  },
  {
    questionText: "Which attribute should you add to script tags to download them asynchronously without blocking HTML parsing?",
    options: ["defer", "async", "preload", "prefetch"],
    correctAnswer: "defer",
    difficulty: "medium",
    topic: "industry"
  },
  {
    questionText: "What is the primary visual symptom of a layout shift that would negatively impact Cumulative Layout Shift (CLS)?",
    options: [
      "A button shifts downwards when an image above it loads without explicit width/height dimensions",
      "The page background color changes suddenly on load",
      "A popup modal displays instantly in the center of the screen",
      "The font color transitions smoothly from black to gray"
    ],
    correctAnswer: "A button shifts downwards when an image above it loads without explicit width/height dimensions",
    difficulty: "medium",
    topic: "practical"
  },
  // Hard
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
    topic: "role-specific"
  },
  {
    questionText: "Which of the following Web APIs is used to observe changes to the size of an element's content box?",
    options: ["MutationObserver", "ResizeObserver", "IntersectionObserver", "PerformanceObserver"],
    correctAnswer: "ResizeObserver",
    difficulty: "hard",
    topic: "technical"
  }
];

// Fallback questions for DevOps
const FALLBACK_DEVOPS_QUESTIONS: Question[] = [
  // Easy
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
    topic: "role-specific"
  },
  {
    questionText: "In git, which command is used to record changes to the local repository?",
    options: ["git push", "git commit", "git pull", "git status"],
    correctAnswer: "git commit",
    difficulty: "easy",
    topic: "industry"
  },
  // Medium
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
    topic: "role-specific"
  },
  {
    questionText: "When planning a disaster recovery strategy, what is the difference between RTO (Recovery Time Objective) and RPO (Recovery Point Objective)?",
    options: [
      "RTO is the maximum tolerable downtime, while RPO is the maximum tolerable data loss duration since the last backup",
      "RTO refers to network latency, while RPO refers to database write speed",
      "RTO measures server hardware lifespan, while RPO measures application code bugs",
      "RTO and RPO are identical metrics used interchangeably"
    ],
    correctAnswer: "RTO is the maximum tolerable downtime, while RPO is the maximum tolerable data loss duration since the last backup",
    difficulty: "medium",
    topic: "practical"
  },
  {
    questionText: "Which AWS service is designed to distribute incoming application traffic across multiple targets like EC2 instances?",
    options: ["Amazon Route 53", "AWS Elastic Load Balancing (ELB)", "Amazon S3", "AWS IAM"],
    correctAnswer: "AWS Elastic Load Balancing (ELB)",
    difficulty: "medium",
    topic: "technical"
  },
  // Hard
  {
    questionText: "In Kubernetes, which component is responsible for maintaining network rules on nodes, allowing communication to your Pods?",
    options: ["kube-apiserver", "kube-proxy", "kube-scheduler", "etcd"],
    correctAnswer: "kube-proxy",
    difficulty: "hard",
    topic: "technical"
  },
  {
    questionText: "What is a major security risk when using wildcards (*) in AWS IAM Policy Resource elements?",
    options: [
      "It causes IAM API requests to time out",
      "It grants permissions to all resources of that type, violating the principle of least privilege",
      "It locks everyone out of the console",
      "It makes the IAM policy incompatible with Terraform"
    ],
    correctAnswer: "It grants permissions to all resources of that type, violating the principle of least privilege",
    difficulty: "hard",
    topic: "practical"
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
    topic: "role-specific"
  }
];

// Fallback questions for General Roles
const FALLBACK_GENERIC_QUESTIONS: Question[] = [
  // Easy
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
    topic: "practical"
  },
  {
    questionText: "In a professional business context, what does the term 'SaaS' stand for?",
    options: ["Software as a Service", "System and Application Software", "Structured Assessment and Scoring", "Security Alert and Auditing System"],
    correctAnswer: "Software as a Service",
    difficulty: "easy",
    topic: "industry"
  },
  // Medium
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
    questionText: "Which of the following describes a 'Phishing' attack?",
    options: [
      "An attacker physical stealing a company laptop",
      "An attacker sending fraudulent messages designed to trick individuals into revealing sensitive information",
      "A server overloading due to too many network requests",
      "A software bug causing data to delete unexpectedly"
    ],
    correctAnswer: "An attacker sending fraudulent messages designed to trick individuals into revealing sensitive information",
    difficulty: "medium",
    topic: "practical"
  },
  {
    questionText: "In project management, what is the significance of the 'Critical Path'?",
    options: [
      "The list of non-essential features that can be cut",
      "The longest sequence of dependent tasks that must be completed to deliver the project on time",
      "The budget allocation for server hosting",
      "The folder path where source code is stored"
    ],
    correctAnswer: "The longest sequence of dependent tasks that must be completed to deliver the project on time",
    difficulty: "medium",
    topic: "role-specific"
  },
  {
    questionText: "Which of the following SQL statements is used to fetch data from a database?",
    options: ["UPDATE", "INSERT", "SELECT", "DELETE"],
    correctAnswer: "SELECT",
    difficulty: "medium",
    topic: "technical"
  },
  // Hard
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
    topic: "industry"
  },
  {
    questionText: "Under GDPR regulations, what is meant by 'the Right to be Forgotten'?",
    options: [
      "An employer can fire an employee without cause",
      "Individuals have the right to request that a business delete their personal data from all records under certain conditions",
      "The website is allowed to clear browser cookies daily",
      "The AI model is retrained and forgets all weights weekly"
    ],
    correctAnswer: "Individuals have the right to request that a business delete their personal data from all records under certain conditions",
    difficulty: "hard",
    topic: "practical"
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

  const prompt = `You are a senior recruiter and domain expert. Analyze the following Job Description and generate a comprehensive assessment of 10 Multiple Choice Questions (MCQs) for this role.

Job Title: ${jobTitle}
Job Description:
${jobDescription}

Generate exactly 10 questions meeting these requirements:
- Options: Exactly 4 options per question.
- Correct Answer: One single correct answer that MUST match one of the 4 options EXACTLY.
- Core coverage:
  * Technical knowledge (3 questions)
  * Practical situations/problem solving (3 questions)
  * Role-specific skills (2 questions)
  * Industry knowledge (2 questions)
- Difficulty distribution:
  * Easy (3 questions)
  * Medium (4 questions)
  * Hard (3 questions)

Return ONLY a valid JSON object matching the following structure. Do not include markdown code block formatting (such as \`\`\`json), and do not include any text outside of the JSON.

JSON Structure:
{
  "questions": [
    {
      "questionText": "What is ...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "difficulty": "easy",
      "topic": "technical"
    }
  ]
}

Ensure the questions are highly specific to the requirements mentioned in the Job Description, challenging but fair, and professionally written.`;

  try {
    const rawResponse = await callDeepSeek(prompt);
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
    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length === 10) {
      // Basic validation of keys
      const validated = parsed.questions.map(q => {
        const difficulty = ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium";
        const topic = ["technical", "practical", "role-specific", "industry"].includes(q.topic) ? q.topic : "technical";
        
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

        return {
          questionText: q.questionText || "What is a key requirement of this role?",
          options,
          correctAnswer,
          difficulty,
          topic
        } as Question;
      });
      return validated;
    } else {
      throw new Error(`AI generated ${parsed?.questions?.length || 0} questions instead of 10`);
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
  if (title.includes("scm") || title.includes("procurement") || title.includes("supply chain") || title.includes("operations")) {
    console.log("Using SCM Executive fallback questions");
    return FALLBACK_SCM_QUESTIONS;
  } else if (title.includes("frontend") || title.includes("react") || title.includes("web") || title.includes("ui")) {
    console.log("Using Frontend Engineer fallback questions");
    return FALLBACK_FRONTEND_QUESTIONS;
  } else if (title.includes("devops") || title.includes("cloud") || title.includes("aws") || title.includes("sre") || title.includes("infrastructure")) {
    console.log("Using DevOps Engineer fallback questions");
    return FALLBACK_DEVOPS_QUESTIONS;
  } else {
    console.log("Using Generic fallback questions");
    return FALLBACK_GENERIC_QUESTIONS;
  }
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

  console.log(`✅ Assessment ${assessmentId} created for job ${jobId} (${jobTitle}) with 10 questions.`);
  return assessmentId;
}
