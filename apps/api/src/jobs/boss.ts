import PgBoss from "pg-boss";

import { config } from "../config.js";
import { GameService } from "../services/gameService.js";

export class BossService {
  private readonly boss: PgBoss;

  constructor(private readonly gameService: GameService) {
    this.boss = new PgBoss({
      connectionString: config.DATABASE_URL
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.work("content.publish", async (job) => {
      const versionName = String(job.data.versionName);
      await this.gameService.publishContentVersion(versionName);
    });
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }

  async queuePublish(versionName: string): Promise<void> {
    await this.boss.send("content.publish", { versionName });
  }
}
