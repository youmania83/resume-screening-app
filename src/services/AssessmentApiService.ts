const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function fetchAssessment(token: string, sessionId: string) {
  const resp = await fetch(`${apiBase}/assessment/${token}?sessionId=${sessionId}`);
  if (!resp.ok) {
    const errData = await resp.json();
    if (resp.status === 403 && (errData.error?.includes("completed") || errData.error?.includes("submitted"))) {
      const resultResp = await fetch(`${apiBase}/assessment/results/get?token=${token}`);
      if (resultResp.ok) {
        return { isCompleted: true, result: await resultResp.json() };
      }
    }
    throw new Error(errData.error || "Failed to load assessment information.");
  }
  return { isCompleted: false, data: await resp.json() };
}

export async function postViolation(token: string, type: string, details: string) {
  const resp = await fetch(`${apiBase}/assessment/violation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, violationType: type, details }),
  });
  if (!resp.ok) throw new Error("Failed to post violation");
  return resp.json();
}

export async function submitAnswers(
  token: string,
  answers: Record<string, string>,
  sessionId: string,
  timeTaken: number
) {
  const resp = await fetch(`${apiBase}/assessment/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, answers, sessionId, timeTaken }),
  });
  if (!resp.ok) throw new Error("Failed to submit assessment answers.");

  const resultResp = await fetch(`${apiBase}/assessment/results/get?token=${token}`);
  if (!resultResp.ok) {
    throw new Error("Assessment submitted successfully, but scorecard failed to load.");
  }
  return resultResp.json();
}

export async function forceResumeSession(token: string, sessionId: string) {
  const resp = await fetch(`${apiBase}/assessment/${token}/force-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldSessionId: sessionId }),
  });
  if (!resp.ok) {
    const errData = await resp.json();
    throw new Error(errData.error || "Failed to resume session.");
  }
  return resp.json();
}

export async function sendHeartbeat(token: string, sessionId: string) {
  try {
    await fetch(`${apiBase}/assessment/${token}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch (err) {
    console.error("Failed to send heartbeat:", err);
  }
}

export async function saveAssessmentProgress(
  token: string,
  answers: Record<string, string>,
  currentQuestionIndex: number
) {
  const resp = await fetch(`${apiBase}/assessment/${token}/save-progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, currentQuestionIndex }),
  });
  if (!resp.ok) throw new Error("Failed to save assessment progress.");
  return resp.json();
}

