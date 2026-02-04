/**
 * Provider Error Classes
 * 
 * Standardized error handling across all LLM providers
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public provider: string = 'unknown',
    public model?: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class AuthenticationError extends ProviderError {
  constructor(provider: string, message?: string) {
    super(
      message || `Authentication failed for ${provider}. Please check your API key.`,
      401,
      provider
    );
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends ProviderError {
  constructor(
    provider: string, 
    message?: string,
    public retryAfterMs?: number
  ) {
    super(
      message || `Rate limit exceeded for ${provider}. Please try again later.`,
      429,
      provider
    );
    this.name = 'RateLimitError';
  }
}

export class ContextLengthError extends ProviderError {
  constructor(
    provider: string,
    model: string,
    public maxTokens: number,
    message?: string
  ) {
    super(
      message || `Context length exceeded for ${provider} model ${model}. Maximum tokens: ${maxTokens}`,
      400,
      provider,
      model
    );
    this.name = 'ContextLengthError';
  }
}

export class ModelNotFoundError extends ProviderError {
  constructor(provider: string, model: string) {
    super(
      `Model '${model}' not found or not available for provider ${provider}`,
      404,
      provider,
      model
    );
    this.name = 'ModelNotFoundError';
  }
}

export class QuotaExceededError extends ProviderError {
  constructor(provider: string, message?: string) {
    super(
      message || `Quota exceeded for ${provider}. Please check your billing and usage limits.`,
      402,
      provider
    );
    this.name = 'QuotaExceededError';
  }
}

export class ValidationError extends ProviderError {
  constructor(provider: string, field: string, message: string) {
    super(
      `Invalid ${field}: ${message}`,
      400,
      provider
    );
    this.name = 'ValidationError';
  }
}