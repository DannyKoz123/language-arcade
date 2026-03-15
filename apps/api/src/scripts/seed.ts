import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import {
  demoChecksumForLanguage,
  demoClipIdForLanguage,
  demoConfusionPairs,
  demoFullPath,
  demoLanguages,
  demoPreviewPath
} from "../demo/catalog.js";
import { closePool, getPool } from "../db/pool.js";

async function seed(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`
      truncate table game_events, run_rounds, runs, confusion_edges, clip_reviews,
        clips, languages, content_versions, leaderboard_seasons, guest_sessions, players
      restart identity cascade
    `);

    const versionResult = await client.query<{ id: string }>(
      `insert into content_versions (version_name, notes, published_at)
       values ('demo-fleurs-v1', 'Synthetic local demo content shaped like a FLEURS import.', now())
       returning id`
    );
    const versionId = versionResult.rows[0].id;

    const seasonResult = await client.query<{ id: string }>(
      `insert into leaderboard_seasons (name, started_at, ends_at)
       values ('Launch Season', now(), null)
       returning id`
    );
    const seasonId = seasonResult.rows[0].id;

    for (const language of demoLanguages) {
      await client.query(
        `insert into languages
          (iso_code, common_name, native_name, family, region, main_countries, enabled, content_version_id)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, true, $7)`,
        [
          language.isoCode,
          language.commonName,
          language.nativeName,
          JSON.stringify(language.family),
          language.region,
          JSON.stringify(language.mainCountries),
          versionId
        ]
      );

      const clipId = demoClipIdForLanguage(language.isoCode);
      await client.query(
        `insert into clips
          (id, language_iso_code, preview_url, full_url, preview_duration_ms, full_duration_ms,
           speaker_id, transcript, review_status, content_version_id, active, checksum, source_dataset)
         values ($1, $2, $3, $4, 6000, 8000, $5, $6, 'approved', $7, true, $8, 'FLEURS-demo')`,
        [
          clipId,
          language.isoCode,
          `${config.PUBLIC_API_URL}${demoPreviewPath(language.isoCode)}`,
          `${config.PUBLIC_API_URL}${demoFullPath(language.isoCode)}`,
          `speaker-${language.isoCode}`,
          `${language.commonName} synthetic demo transcript`,
          versionId,
          demoChecksumForLanguage(language.isoCode)
        ]
      );

      await client.query(
        `insert into clip_reviews (clip_id, reviewer, status, notes)
         values ($1, 'system-demo-seed', 'approved', 'Synthetic local demo clip')`,
        [clipId]
      );
    }

    for (const [left, right, weight] of demoConfusionPairs) {
      await client.query(
        `insert into confusion_edges (source_iso_code, target_iso_code, weight, source)
         values ($1, $2, $3, 'great-language-game-seed')
         on conflict (source_iso_code, target_iso_code) do update set weight = excluded.weight`,
        [left, right, weight]
      );
      await client.query(
        `insert into confusion_edges (source_iso_code, target_iso_code, weight, source)
         values ($1, $2, $3, 'great-language-game-seed')
         on conflict (source_iso_code, target_iso_code) do update set weight = excluded.weight`,
        [right, left, weight]
      );
    }

    await client.query(
      `insert into players (id, display_name, is_guest)
       values ($1, 'Demo Champion', false)`,
      [randomUUID()]
    );

    await client.query("commit");
    console.log(`Seeded ${demoLanguages.length} languages into season ${seasonId}.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
