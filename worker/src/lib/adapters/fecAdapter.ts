/**
 * FEC.gov API Adapter
 */

import { Logger } from 'pino';

export class FecSyncAdapter {
  private apiKey: string;
  private logger: Logger;
  private baseUrl = 'https://api.open.fec.gov/v1';
  private requestsPerSecond = 10;
  private lastRequestTime = 0;

  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async fetchData(lastSync: Date | null): Promise<any[]> {
    if (!this.apiKey) {
      this.logger.warn('FEC_API_KEY not set, skipping FEC sync');
      return [];
    }

    const results: any[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        await this.respectRateLimit();

        const params = new URLSearchParams({
          per_page: String(pageSize),
          page: String(page),
          api_key: this.apiKey,
        });

        if (lastSync) {
          params.append('min_date', lastSync.toISOString().split('T')[0]);
        }

        const url = `${this.baseUrl}/candidates?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 429) {
            this.logger.warn('FEC rate limited, waiting 60s');
            await this.sleep(60000);
            continue;
          }
          throw new Error(`FEC API error: ${response.status}`);
        }

        const data = await response.json();
        const records = data.results || [];

        if (records.length === 0) {
          hasMore = false;
        } else {
          results.push(...records);
          page++;

          if (results.length >= 10000) {
            this.logger.warn('Reached 10k record limit for FEC');
            hasMore = false;
          }
        }
      } catch (error) {
        this.logger.error({ error, page }, 'FEC fetch error');
        hasMore = false;
      }
    }

    return results;
  }

  transformRecord(record: any): any {
    return {
      id: record.candidate_id,
      name: record.name,
      party: this.normalizeParty(record.party),
      office: record.office_sought || record.office,
      state: record.state,
      district: record.district,
      fec_candidate_id: record.candidate_id,
      last_updated: new Date().toISOString(),
    };
  }

  private normalizeParty(party: string): string {
    if (!party) return 'Other';
    if (party.includes('D')) return 'Democrat';
    if (party.includes('R')) return 'Republican';
    if (party.includes('I')) return 'Independent';
    return 'Other';
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

