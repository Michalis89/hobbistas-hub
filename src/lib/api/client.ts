import { getLoginUrl } from '@/lib/routes/authRoutes';

export class ApiClient {
  private handleUnauthorized(response: Response): void {
    if (response.status === 401) {
      // Session expired - redirect to login
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = getLoginUrl(currentPath);
      }
    }
  }

  async request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    this.handleUnauthorized(response);
    return response;
  }

  async getJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await this.request(input, init);
    return (await response.json()) as T;
  }

  async getJsonOrThrow<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await this.request(input, init);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  swrFetcher = <T>(url: string) => this.getJson<T>(url);

  swrNoStoreFetcher = <T>(url: string) =>
    this.getJson<T>(url, {
      cache: 'no-store',
    });
}

export const apiClient = new ApiClient();
