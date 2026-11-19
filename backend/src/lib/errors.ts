export type ErrorDetail = {
  field: string;
  message: string;
};

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(
    code: string,
    message: string,
    details?: ErrorDetail[],
  ): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(code: string, message: string): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(code: string, message: string): AppError {
    return new AppError(403, code, message);
  }

  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  static tooManyRequests(code: string, message: string): AppError {
    return new AppError(429, code, message);
  }
}
