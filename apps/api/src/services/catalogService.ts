import { CatalogSnapshot, GameRepository } from "../repositories/gameRepository.js";

export class CatalogService {
  private cache: CatalogSnapshot | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly repository: GameRepository) {}

  async getSnapshot(force = false): Promise<CatalogSnapshot> {
    const now = Date.now();
    if (!force && this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }

    this.cache = await this.repository.getCatalogSnapshot();
    this.cacheExpiresAt = now + 30_000;
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }
}
