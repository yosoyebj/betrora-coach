type DebugPayload = {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
};

const ingestUrl = process.env.NEXT_PUBLIC_DEBUG_INGEST_URL;

export function logDebugEvent(payload: DebugPayload) {
  if (!ingestUrl) {
    return;
  }

  const body = {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  };

  fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
