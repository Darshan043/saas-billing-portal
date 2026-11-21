const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type ApiErrorDetail = {
  field: string;
  message: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
  };
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'Request failed',
      body?.error?.details,
    );
  }

  return data as T;
}

function filenameFromContentDisposition(header: string | null): string {
  if (!header) {
    return 'invoice.pdf';
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() || 'invoice.pdf';
}

export async function downloadBinary(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const text = await response.text();
    let message = 'Request failed';
    let code = 'INTERNAL_ERROR';
    try {
      const body = text ? (JSON.parse(text) as ApiErrorBody) : null;
      message = body?.error?.message ?? message;
      code = body?.error?.code ?? code;
    } catch {
      // PDF or other non-JSON error body
    }
    throw new ApiError(response.status, code, message);
  }
  const blob = await response.blob();
  return {
    blob,
    filename: filenameFromContentDisposition(
      response.headers.get('Content-Disposition'),
    ),
  };
}
