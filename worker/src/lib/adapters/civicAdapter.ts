/**
 * Google Civic Information API Adapter
 */

import { Logger } from 'pino';

export class CivicSyncAdapter {
  private apiKey: string;
  private logger: Logger;
  private baseUrl = 'https://www.googleapis.com/civicinfo/v2';
  private requestsPerSecond = 10;
  private lastRequestTime = 0;

  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async fetchData(lastSync: Date | null): Promise<any[]> {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_CIVIC_API_KEY not set, skipping Civic sync');
      return [];
    }

    const results: any[] = [];

    try {
      const federalReps = await this.fetchRepresentatives('ocd-division/country:us');
      results.push(...federalReps);

      const states = ['CA', 'NY', 'TX', 'FL', 'PA'];
      for (const state of states) {
        await this.respectRateLimit();
        const stateReps = await this.fetchRepresentatives(`ocd-division/country:us/state:${state.toLowerCase()}`);
        results.push(...stateReps);
      }
    } catch (error) {
      this.logger.error({ error }, 'Civic API fetch error');
    }

    return results;
  }

  private async fetchRepresentatives(division: string): Promise<any[]> {
    await this.respectRateLimit();

    const params = new URLSearchParams({
      key: this.apiKey,
      levels: 'federal,state,local',
      roles: 'legislatorLowerBody,legislatorUpperBody,executive',
    });

    const url = `${this.baseUrl}/representatives?${params}&division=${encodeURIComponent(division)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('Civic API rate limited');
          return [];
        }
        throw new Error(`Civic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.officials || [];
    } catch (error) {
      this.logger.error({ error, division }, 'Failed to fetch representatives');
      return [];
    }
  }

  transformRecord(record: any): any {
    return {
      id: `${record.name}-${record.party}`.toLowerCase().replace(/\s+/g, '-'),
      name: record.name,
      party: record.party || 'Unknown',
      office: record.office || 'Official',
      state: this.extractState(record),
      last_updated: new Date().toISOString(),
    };
  }

  private extractState(record: any): string {
    if (record.address && record.address[0]) {
      return record.address[0].state || 'US';
    }
    return 'US';
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await this.sleep(minInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

