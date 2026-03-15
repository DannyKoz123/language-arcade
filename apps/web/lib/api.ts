import {
  AnswerResponse,
  BootstrapResponse,
  CreateRunResponse,
  HintResponse,
  LeaderboardEntry,
  ProfileResponse
} from "@language-arcade/shared";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function ensureGuestSession() {
  return request<{ player: { id: string; displayName: string | null; guest: boolean } }>(
    "/v1/sessions/guest",
    { method: "POST" }
  );
}

export async function fetchBootstrap() {
  return request<BootstrapResponse>("/v1/bootstrap");
}

export async function createRun() {
  return request<CreateRunResponse>("/v1/runs", { method: "POST" });
}

export async function submitAnswer(runId: string, payload: { roundId: string; guessIsoCode: string }) {
  return request<AnswerResponse>(`/v1/runs/${runId}/answers`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function useHint(
  runId: string,
  payload: { roundId: string; hintType: "family_region" | "longer_clip" }
) {
  return request<HintResponse>(`/v1/runs/${runId}/hints`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchProfile() {
  return request<ProfileResponse>("/v1/profile");
}

export async function updateDisplayName(displayName: string) {
  return request<void>("/v1/profile/display-name", {
    method: "POST",
    body: JSON.stringify({ displayName })
  });
}

export async function fetchLeaderboard(window: "weekly" | "all_time") {
  return request<{ entries: LeaderboardEntry[] }>(
    `/v1/leaderboards/arcade?window=${window}`
  );
}
