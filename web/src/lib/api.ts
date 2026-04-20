import { saveReceipt, getReceipt } from './receiptStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private apiKey: string | null = null;

  setApiKey(key: string) {
    this.apiKey = key;
    sessionStorage.setItem('pw_api_key', key);
  }

  getApiKey(): string | null {
    if (!this.apiKey) {
      this.apiKey = sessionStorage.getItem('pw_api_key');
    }
    return this.apiKey;
  }

  clearApiKey() {
    this.apiKey = null;
    sessionStorage.removeItem('pw_api_key');
  }

  async fetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // attestation 경로면 저장된 receipt 자동 첨부
    const idMatch = path.match(/\/attestations\/([^/]+)/);
    if (idMatch) {
      const receipt = getReceipt(idMatch[1]);
      if (receipt) {
        headers['X-Access-Receipt'] = receipt;
      }
    }

    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 성공 응답의 X-Access-Receipt 헤더 자동 저장
    const receiptHeader = res.headers.get('X-Access-Receipt');
    if (receiptHeader && idMatch) {
      saveReceipt(idMatch[1], receiptHeader);
    }

    if (!res.ok) {
      if (res.status === 402) {
        const paymentBody = await res.json();
        throw new PaymentRequiredError(paymentBody);
      }
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, error.error || 'Unknown error');
    }

    return res.json();
  }

  // Convenience methods
  get<T>(path: string) {
    return this.fetch<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.fetch<T>(path, { method: 'POST', body });
  }

  put<T>(path: string, body: unknown) {
    return this.fetch<T>(path, { method: 'PUT', body });
  }
}

export class ApiError extends Error {
  status: number;
  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 402 Payment Required 전용 에러 — 결제 안내 정보를 포함 */
export class PaymentRequiredError extends Error {
  quoteId: string;
  price: { amountUsdMicros: number; amountUsd: string; currency: string; payTo: string };
  smartWallet: { address: string | null; message: string };
  expiresAt: string;

  constructor(body: Record<string, unknown>) {
    super('Payment required');
    this.name = 'PaymentRequiredError';
    this.quoteId = (body.quoteId as string) || '';
    this.price = (body.price as PaymentRequiredError['price']) || {
      amountUsdMicros: 0, amountUsd: '0', currency: 'USDC', payTo: '',
    };
    this.smartWallet = (body.smartWallet as PaymentRequiredError['smartWallet']) || {
      address: null, message: '',
    };
    this.expiresAt = (body.expiresAt as string) || '';
  }
}

export const api = new ApiClient();
