/**
 * Congress.gov API Adapter
 */

import { Logger } from 'pino';

export class CongressSyncAdapter {
  private apiKey: string;
  private logger: Logger;
  private baseUrl = 'https://api.congress.gov/v3';
  private requestsPerSecond = 1;
  private lastRequestTime = 0;

  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async fetchData(lastSync: Date | null): Promise<any[]> {
    if (!this.apiKey) {
      this.logger.warn('CONGRESS_API_KEY not set, skipping Congress sync');
      return [];
    }

    const results: any[] = [];
    let offset = 0;
    const limit = 250;
    let hasMore = true;

    while (hasMore) {
      try {
        await this.respectRateLimit();

        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          format: 'json',
          api_key: this.apiKey,
        });

        const url = `${this.baseUrl}/bill?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 429) {
            this.logger.warn('Congress API rate limited, waiting 60s');
            await this.sleep(60000);
            continue;
          }
          throw new Error(`Congress API error: ${response.status}`);
        }

        const data = await response.json();
        const records = data.bills || [];

        if (records.length === 0) {
          hasMore = false;
        } else {
          results.push(...records);
          offset += limit;

          if (results.length >= 5000) {
            this.logger.warn('Reached 5k record limit for Congress');
            hasMore = false;
          }
        }
      } catch (error) {
        this.logger.error({ error, offset }, 'Congress fetch error');
        hasMore = false;
      }
    }

    return results;
  }

  transformRecord(record: any): any {
    return {
      id: record.bill_id,
      bill_number: record.bill_number,
      title: record.title,
      introduced_date: record.introduced_date,
      last_action_date: record.last_action_date,
      last_updated: new Date().toISOString(),
    };
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

