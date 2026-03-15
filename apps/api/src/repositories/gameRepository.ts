import { randomUUID } from "node:crypto";

import { Pool, PoolClient } from "pg";

import { ClipSummary, ConfusionEdge, LanguageSummary, LeaderboardEntry, ProfileResponse, RoundOption, ScoreBreakdown } from "@language-arcade/shared";

export interface CatalogSnapshot {
  languages: LanguageSummary[];
  clips: ClipSummary[];
  confusionEdges: ConfusionEdge[];
}

export interface PlayerSummary {
  id: string;
  displayName: string | null;
  guest: boolean;
}

export interface SessionRecord {
  player: PlayerSummary;
  tokenHash: string;
}

export interface RunRecord {
  id: string;
  playerId: string;
  status: "active" | "completed" | "abandoned";
  score: number;
  streak: number;
  livesRemaining: number;
  currentRoundNumber: number;
  completedRounds: number;
  seasonId: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface RunRoundRecord {
  id: string;
  runId: string;
  roundNumber: number;
  languageIsoCode: string;
  clipId: string;
  difficulty: "easy" | "medium" | "hard";
  options: RoundOption[];
  hintTypes: string[];
  familyRegionUsed: boolean;
  longerClipUsed: boolean;
  startedAt: string;
  answeredAt: string | null;
  answerIsoCode: string | null;
  correct: boolean | null;
  scoreDelta: ScoreBreakdown | null;
}

export interface SeasonRecord {
  id: string;
  name: string;
  startedAt: string;
  endsAt: string | null;
}

export class GameRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createGuestSession(tokenHash: string): Promise<PlayerSummary> {
    return this.withTransaction(async (client) => {
      const playerRow = await client.query<{
        id: string;
        display_name: string | null;
        is_guest: boolean;
      }>(
        `insert into players (display_name, is_guest)
         values (null, true)
         returning id, display_name, is_guest`
      );
      const player = playerRow.rows[0];

      await client.query(
        `insert into guest_sessions (player_id, session_token_hash)
         values ($1, $2)`,
        [player.id, tokenHash]
      );

      return {
        id: player.id,
        displayName: player.display_name,
        guest: player.is_guest
      };
    });
  }

  async findPlayerBySessionToken(tokenHash: string): Promise<PlayerSummary | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string | null;
      is_guest: boolean;
    }>(
      `select p.id, p.display_name, p.is_guest
       from guest_sessions gs
       join players p on p.id = gs.player_id
       where gs.session_token_hash = $1`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    await this.pool.query(
      `update guest_sessions set last_seen_at = now() where session_token_hash = $1`,
      [tokenHash]
    );

    return {
      id: row.id,
      displayName: row.display_name,
      guest: row.is_guest
    };
  }

  async getActiveSeason(): Promise<SeasonRecord> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      started_at: string;
      ends_at: string | null;
    }>(
      `select id, name, started_at, ends_at
       from leaderboard_seasons
       where ends_at is null or ends_at > now()
       order by started_at desc
       limit 1`
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("No active leaderboard season found.");
    }

    return {
      id: row.id,
      name: row.name,
      startedAt: row.started_at,
      endsAt: row.ends_at
    };
  }

  async getCatalogSnapshot(): Promise<CatalogSnapshot> {
    const [languagesResult, clipsResult, confusionResult] = await Promise.all([
      this.pool.query<{
        iso_code: string;
        common_name: string;
        native_name: string;
        family: string[];
        region: string;
        main_countries: string[];
        enabled: boolean;
      }>(
        `select iso_code, common_name, native_name, family, region, main_countries, enabled
         from languages
         where enabled = true
         order by common_name asc`
      ),
      this.pool.query<{
        id: string;
        language_iso_code: string;
        preview_url: string;
        full_url: string;
        preview_duration_ms: number;
        full_duration_ms: number;
        speaker_id: string;
        transcript: string;
        review_status: "approved" | "rejected" | "pending";
        content_version_id: string;
        active: boolean;
      }>(
        `select id, language_iso_code, preview_url, full_url, preview_duration_ms, full_duration_ms,
                speaker_id, transcript, review_status, content_version_id, active
         from clips
         where active = true`
      ),
      this.pool.query<{
        source_iso_code: string;
        target_iso_code: string;
        weight: number;
      }>(
        `select source_iso_code, target_iso_code, weight
         from confusion_edges`
      )
    ]);

    return {
      languages: languagesResult.rows.map((row) => ({
        isoCode: row.iso_code,
        commonName: row.common_name,
        nativeName: row.native_name,
        family: row.family,
        region: row.region,
        mainCountries: row.main_countries,
        enabled: row.enabled
      })),
      clips: clipsResult.rows.map((row) => ({
        id: row.id,
        languageIsoCode: row.language_iso_code,
        previewUrl: row.preview_url,
        fullUrl: row.full_url,
        previewDurationMs: row.preview_duration_ms,
        fullDurationMs: row.full_duration_ms,
        speakerId: row.speaker_id,
        transcript: row.transcript,
        reviewStatus: row.review_status,
        contentVersion: row.content_version_id,
        active: row.active
      })),
      confusionEdges: confusionResult.rows.map((row) => ({
        sourceIsoCode: row.source_iso_code,
        targetIsoCode: row.target_iso_code,
        weight: row.weight
      }))
    };
  }

  async createRun(playerId: string, seasonId: string): Promise<RunRecord> {
    const result = await this.pool.query<{
      id: string;
      player_id: string;
      status: "active";
      score: number;
      streak: number;
      lives_remaining: number;
      current_round_number: number;
      completed_rounds: number;
      season_id: string;
      created_at: string;
      finished_at: string | null;
    }>(
      `insert into runs (player_id, status, season_id)
       values ($1, 'active', $2)
       returning id, player_id, status, score, streak, lives_remaining,
                 current_round_number, completed_rounds, season_id, created_at, finished_at`,
      [playerId, seasonId]
    );

    return mapRun(result.rows[0]);
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const result = await this.pool.query<{
      id: string;
      player_id: string;
      status: "active" | "completed" | "abandoned";
      score: number;
      streak: number;
      lives_remaining: number;
      current_round_number: number;
      completed_rounds: number;
      season_id: string;
      created_at: string;
      finished_at: string | null;
    }>(
      `select id, player_id, status, score, streak, lives_remaining,
              current_round_number, completed_rounds, season_id, created_at, finished_at
       from runs
       where id = $1`,
      [runId]
    );

    return result.rows[0] ? mapRun(result.rows[0]) : null;
  }

  async listRunRounds(runId: string): Promise<RunRoundRecord[]> {
    const result = await this.pool.query<{
      id: string;
      run_id: string;
      round_number: number;
      language_iso_code: string;
      clip_id: string;
      difficulty: "easy" | "medium" | "hard";
      options: RoundOption[];
      hint_types: string[];
      family_region_used: boolean;
      longer_clip_used: boolean;
      started_at: string;
      answered_at: string | null;
      answer_iso_code: string | null;
      correct: boolean | null;
      score_delta: ScoreBreakdown | null;
    }>(
      `select id, run_id, round_number, language_iso_code, clip_id, difficulty, options,
              hint_types, family_region_used, longer_clip_used, started_at, answered_at,
              answer_iso_code, correct, score_delta
       from run_rounds
       where run_id = $1
       order by round_number asc`,
      [runId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      roundNumber: row.round_number,
      languageIsoCode: row.language_iso_code,
      clipId: row.clip_id,
      difficulty: row.difficulty,
      options: row.options,
      hintTypes: row.hint_types,
      familyRegionUsed: row.family_region_used,
      longerClipUsed: row.longer_clip_used,
      startedAt: row.started_at,
      answeredAt: row.answered_at,
      answerIsoCode: row.answer_iso_code,
      correct: row.correct,
      scoreDelta: row.score_delta
    }));
  }

  async insertRunRound(input: {
    runId: string;
    roundNumber: number;
    languageIsoCode: string;
    clipId: string;
    difficulty: "easy" | "medium" | "hard";
    options: RoundOption[];
  }): Promise<RunRoundRecord> {
    const result = await this.pool.query<{
      id: string;
      run_id: string;
      round_number: number;
      language_iso_code: string;
      clip_id: string;
      difficulty: "easy" | "medium" | "hard";
      options: RoundOption[];
      hint_types: string[];
      family_region_used: boolean;
      longer_clip_used: boolean;
      started_at: string;
      answered_at: string | null;
      answer_iso_code: string | null;
      correct: boolean | null;
      score_delta: ScoreBreakdown | null;
    }>(
      `insert into run_rounds (run_id, round_number, language_iso_code, clip_id, difficulty, options)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       returning id, run_id, round_number, language_iso_code, clip_id, difficulty, options,
                 hint_types, family_region_used, longer_clip_used, started_at, answered_at,
                 answer_iso_code, correct, score_delta`,
      [
        input.runId,
        input.roundNumber,
        input.languageIsoCode,
        input.clipId,
        input.difficulty,
        JSON.stringify(input.options)
      ]
    );

    return this.listRunRounds(input.runId).then((rounds) => rounds.at(-1)!);
  }

  async updateRunProgress(input: {
    runId: string;
    score: number;
    streak: number;
    livesRemaining: number;
    currentRoundNumber: number;
    completedRounds: number;
    status: "active" | "completed";
  }): Promise<void> {
    await this.pool.query(
      `update runs
       set score = $2,
           streak = $3,
           lives_remaining = $4,
           current_round_number = $5,
           completed_rounds = $6,
           status = $7,
           finished_at = case when $7 = 'completed' then now() else finished_at end
       where id = $1`,
      [
        input.runId,
        input.score,
        input.streak,
        input.livesRemaining,
        input.currentRoundNumber,
        input.completedRounds,
        input.status
      ]
    );
  }

  async markRoundAnswered(input: {
    roundId: string;
    answerIsoCode: string;
    correct: boolean;
    scoreDelta: ScoreBreakdown;
    hintTypes: string[];
  }): Promise<void> {
    await this.pool.query(
      `update run_rounds
       set answered_at = now(),
           answer_iso_code = $2,
           correct = $3,
           score_delta = $4::jsonb,
           hint_types = $5::jsonb
       where id = $1`,
      [
        input.roundId,
        input.answerIsoCode,
        input.correct,
        JSON.stringify(input.scoreDelta),
        JSON.stringify(input.hintTypes)
      ]
    );
  }

  async applyHint(roundId: string, hintType: "family_region" | "longer_clip"): Promise<void> {
    if (hintType === "family_region") {
      await this.pool.query(
        `update run_rounds
         set family_region_used = true,
             hint_types = (hint_types || '["family_region"]'::jsonb)
         where id = $1 and family_region_used = false`,
        [roundId]
      );
      return;
    }

    await this.pool.query(
      `update run_rounds
       set longer_clip_used = true,
           hint_types = (hint_types || '["longer_clip"]'::jsonb)
       where id = $1 and longer_clip_used = false`,
      [roundId]
    );
  }

  async getClipById(clipId: string): Promise<ClipSummary | null> {
    const result = await this.pool.query<{
      id: string;
      language_iso_code: string;
      preview_url: string;
      full_url: string;
      preview_duration_ms: number;
      full_duration_ms: number;
      speaker_id: string;
      transcript: string;
      review_status: "approved" | "rejected" | "pending";
      content_version_id: string;
      active: boolean;
    }>(
      `select id, language_iso_code, preview_url, full_url, preview_duration_ms, full_duration_ms,
              speaker_id, transcript, review_status, content_version_id, active
       from clips
       where id = $1`,
      [clipId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      languageIsoCode: row.language_iso_code,
      previewUrl: row.preview_url,
      fullUrl: row.full_url,
      previewDurationMs: row.preview_duration_ms,
      fullDurationMs: row.full_duration_ms,
      speakerId: row.speaker_id,
      transcript: row.transcript,
      reviewStatus: row.review_status,
      contentVersion: row.content_version_id,
      active: row.active
    };
  }

  async getLanguageByIsoCode(isoCode: string): Promise<LanguageSummary | null> {
    const result = await this.pool.query<{
      iso_code: string;
      common_name: string;
      native_name: string;
      family: string[];
      region: string;
      main_countries: string[];
      enabled: boolean;
    }>(
      `select iso_code, common_name, native_name, family, region, main_countries, enabled
       from languages
       where iso_code = $1`,
      [isoCode]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      isoCode: row.iso_code,
      commonName: row.common_name,
      nativeName: row.native_name,
      family: row.family,
      region: row.region,
      mainCountries: row.main_countries,
      enabled: row.enabled
    };
  }

  async getProfile(playerId: string): Promise<ProfileResponse> {
    const [playerResult, statsResult, recentRunsResult] = await Promise.all([
      this.pool.query<{ id: string; display_name: string | null; is_guest: boolean }>(
        `select id, display_name, is_guest from players where id = $1`,
        [playerId]
      ),
      this.pool.query<{
        personal_best: number | null;
        runs_played: string;
        average_score: string | null;
      }>(
        `select max(score) as personal_best,
                count(*)::text as runs_played,
                avg(score)::text as average_score
         from runs
         where player_id = $1 and status = 'completed'`,
        [playerId]
      ),
      this.pool.query<{
        id: string;
        score: number;
        created_at: string;
        completed_rounds: number;
      }>(
        `select id, score, created_at, completed_rounds
         from runs
         where player_id = $1
         order by created_at desc
         limit 10`,
        [playerId]
      )
    ]);

    const player = playerResult.rows[0];
    const stats = statsResult.rows[0];

    return {
      player: {
        id: player.id,
        displayName: player.display_name,
        guest: player.is_guest
      },
      stats: {
        personalBest: stats.personal_best ?? 0,
        runsPlayed: Number(stats.runs_played ?? 0),
        averageScore: Math.round(Number(stats.average_score ?? 0))
      },
      recentRuns: recentRunsResult.rows.map((row) => ({
        id: row.id,
        score: row.score,
        createdAt: row.created_at,
        completedRounds: row.completed_rounds
      }))
    };
  }

  async getLeaderboard(window: "weekly" | "all_time", seasonId: string): Promise<LeaderboardEntry[]> {
    const query =
      window === "weekly"
        ? `select p.id as player_id, p.display_name, max(r.score) as score, max(r.finished_at) as achieved_at
           from runs r
           join players p on p.id = r.player_id
           where r.status = 'completed'
             and r.season_id = $1
             and p.display_name is not null
           group by p.id, p.display_name
           order by score desc, achieved_at asc
           limit 25`
        : `select p.id as player_id, p.display_name, max(r.score) as score, max(r.finished_at) as achieved_at
           from runs r
           join players p on p.id = r.player_id
           where r.status = 'completed'
             and p.display_name is not null
           group by p.id, p.display_name
           order by score desc, achieved_at asc
           limit 25`;
    const params = window === "weekly" ? [seasonId] : [];
    const result = await this.pool.query<{
      player_id: string;
      display_name: string;
      score: number;
      achieved_at: string;
    }>(query, params);

    return result.rows.map((row, index) => ({
      rank: index + 1,
      playerId: row.player_id,
      displayName: row.display_name,
      score: row.score,
      achievedAt: row.achieved_at
    }));
  }

  async logEvent(input: {
    playerId?: string;
    runId?: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `insert into game_events (player_id, run_id, event_type, payload)
       values ($1, $2, $3, $4::jsonb)`,
      [input.playerId ?? null, input.runId ?? null, input.eventType, JSON.stringify(input.payload)]
    );
  }

  async publishContentVersion(versionName: string): Promise<void> {
    const versionResult = await this.pool.query<{ id: string }>(
      `update content_versions
       set published_at = now()
       where version_name = $1
       returning id`,
      [versionName]
    );
    const version = versionResult.rows[0];
    if (!version) {
      throw new Error(`Unknown content version: ${versionName}`);
    }

    await this.pool.query(
      `update languages
       set enabled = true
       where content_version_id = $1`,
      [version.id]
    );
  }

  async disableClip(clipId: string): Promise<void> {
    await this.pool.query(
      `update clips set active = false where id = $1`,
      [clipId]
    );
  }

  async upsertDisplayName(playerId: string, displayName: string): Promise<void> {
    await this.pool.query(
      `update players set display_name = $2 where id = $1`,
      [playerId, displayName]
    );
  }
}

function mapRun(row: {
  id: string;
  player_id: string;
  status: "active" | "completed" | "abandoned";
  score: number;
  streak: number;
  lives_remaining: number;
  current_round_number: number;
  completed_rounds: number;
  season_id: string;
  created_at: string;
  finished_at: string | null;
}): RunRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    status: row.status,
    score: row.score,
    streak: row.streak,
    livesRemaining: row.lives_remaining,
    currentRoundNumber: row.current_round_number,
    completedRounds: row.completed_rounds,
    seasonId: row.season_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}
