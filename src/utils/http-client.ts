import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

export interface HttpClientOptions {
  timeout?: number;
  retries?: number;
  userAgent?: string;
  delayBetweenRequests?: number;
  /** If true, upgrades HTTP URLs to HTTPS. Defaults to true. */
  enforceHttps?: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class HttpClient {
  private client: AxiosInstance;
  private delayBetweenRequests: number;
  private lastRequestTime: number = 0;
  private enforceHttps: boolean;

  constructor(options: HttpClientOptions = {}) {
    const {
      timeout = 30000,
      retries = 3,
      userAgent = DEFAULT_USER_AGENT,
      delayBetweenRequests = 1000,
      enforceHttps = true,
    } = options;

    this.enforceHttps = enforceHttps;
    this.delayBetweenRequests = delayBetweenRequests;

    this.client = axios.create({
      timeout,
      headers: {
        'User-Agent': userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    axiosRetry(this.client, {
      retries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          (error.response?.status !== undefined && error.response.status >= 500)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn(
          `Retry attempt ${retryCount} for ${requestConfig.url}: ${error.message}`,
        );
      },
    });
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.delayBetweenRequests) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayBetweenRequests - timeSinceLastRequest),
      );
    }
    this.lastRequestTime = Date.now();
  }

  private secureUrl(url: string): string {
    if (this.enforceHttps && url.startsWith('http://')) {
      const secure = url.replace(/^http:/, 'https:');
      logger.debug(`Upgraded URL to HTTPS: ${secure}`);
      return secure;
    }
    return url;
  }

  /**
   * GET a URL as text. Pass a `cookie` string to send a Cookie header — used to
   * select a Nugget store via `NuggetHomeStore=<id>`.
   */
  async get(
    url: string,
    options?: { cookie?: string; config?: AxiosRequestConfig },
  ): Promise<string> {
    await this.waitForRateLimit();

    const secure = this.secureUrl(url);
    const config: AxiosRequestConfig = { ...options?.config };
    if (options?.cookie) {
      config.headers = { ...config.headers, Cookie: options.cookie };
    }

    logger.debug(
      `Fetching: ${secure}${options?.cookie ? ` [${options.cookie}]` : ''}`,
    );
    const response = await this.client.get<string>(secure, config);
    logger.debug(`Received ${response.data.length} bytes from ${secure}`);

    return response.data;
  }
}

export const httpClient = new HttpClient();
export default httpClient;
