// Input validation helpers for InfraStack APIs
// Provides Zod schemas and validation utilities to prevent injection attacks

import { z } from 'zod';
import { NextRequest } from 'next/server';

// ==== BASIC VALIDATION SCHEMAS ====

// Safe string that prevents various injection attacks
const safeString = z.string()
  .min(1)
  .max(1000)
  .refine((val) => !containsSqlInjection(val), {
    message: "Invalid characters detected"
  })
  .refine((val) => !containsXssPatterns(val), {
    message: "Invalid content detected"
  })
  .refine((val) => !containsCommandInjection(val), {
    message: "Invalid command patterns detected"
  });

// Safe text for longer content (prompts, descriptions)
const safeText = z.string()
  .min(1)
  .max(10000)
  .refine((val) => !containsPromptInjection(val), {
    message: "Potential prompt injection detected"
  })
  .refine((val) => !containsExcessiveRepetition(val), {
    message: "Excessive repetition detected"
  });

// Model name validation
const modelName = z.string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/, "Model name contains invalid characters")
  .refine((val) => isValidModelName(val), {
    message: "Invalid or unsupported model name"
  });

// Provider name validation
const providerName = z.enum(['anthropic', 'openai', 'google', 'meta', 'mistral', 'cohere']);

// API key format validation
const apiKey = z.string()
  .min(10)
  .max(200)
  .regex(/^[a-zA-Z0-9._-]+$/, "Invalid API key format");

// Ethereum address validation
const ethAddress = z.string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");

// URL validation (strict)
const safeUrl = z.string()
  .url()
  .refine((url) => {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  }, "Only HTTP(S) URLs are allowed")
  .refine((url) => !containsPrivateIP(url), {
    message: "Private IP addresses not allowed"
  });

// Email validation
const email = z.string()
  .email()
  .max(254)
  .toLowerCase();

// ==== API ROUTE SCHEMAS ====

// Router API request schema
export const routerRequestSchema = z.object({
  prompt: safeText,
  constraints: z.object({
    maxCost: z.enum(['low', 'medium', 'high']).optional(),
    maxLatency: z.enum(['low', 'medium', 'high']).optional(),
    preferredProvider: providerName.optional(),
    timeout: z.number().min(1).max(300000).optional(), // Max 5 minutes
  }).optional(),
});

// Orchestrator API request schema
export const orchestratorRequestSchema = z.object({
  task: safeText.max(2000),
  planOnly: z.boolean().optional().default(false),
  constraints: z.object({
    maxCost: z.enum(['low', 'medium', 'high']).optional(),
    preferredProvider: providerName.optional(),
    timeout: z.number().min(1).max(600000).optional(), // Max 10 minutes
  }).optional(),
});

// Chat completions request schema (OpenAI compatible)
export const chatCompletionsSchema = z.object({
  model: modelName.optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: safeText,
  })).min(1).max(50), // Limit conversation length
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(8000).optional(), // Token limit
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
});

// Wallet management schemas
export const walletCreateSchema = z.object({
  name: safeString.max(100),
  address: ethAddress,
  network: z.enum(['ethereum', 'base', 'polygon', 'arbitrum', 'optimism']),
  isActive: z.boolean().optional().default(true),
});

export const walletUpdateSchema = z.object({
  name: safeString.max(100).optional(),
  isActive: z.boolean().optional(),
});

// Budget management schemas
export const budgetCreateSchema = z.object({
  name: safeString.max(100),
  type: z.enum(['daily', 'weekly', 'monthly']),
  limit: z.number().min(0).max(1000000), // Max $1M budget
  walletId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
});

export const budgetUpdateSchema = z.object({
  name: safeString.max(100).optional(),
  limit: z.number().min(0).max(1000000).optional(),
  isActive: z.boolean().optional(),
});

// Alert management schemas
export const alertCreateSchema = z.object({
  name: safeString.max(100),
  budgetId: z.string().uuid(),
  thresholdPercentage: z.number().min(1).max(100),
  webhookUrl: safeUrl.optional(),
  emailAddress: email.optional(),
  isActive: z.boolean().optional().default(true),
}).refine(
  (data) => data.webhookUrl || data.emailAddress,
  {
    message: "Either webhookUrl or emailAddress must be provided",
    path: ["webhookUrl"]
  }
);

export const alertUpdateSchema = z.object({
  name: safeString.max(100).optional(),
  thresholdPercentage: z.number().min(1).max(100).optional(),
  webhookUrl: safeUrl.optional(),
  emailAddress: email.optional(),
  isActive: z.boolean().optional(),
});

// ==== VALIDATION FUNCTIONS ====

// SQL injection detection
function containsSqlInjection(input: string): boolean {
  const sqlPatterns = [
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b/gi,
    /['";].*[--;]/, // SQL comment patterns
    /\b(OR|AND)\s+\d+\s*=\s*\d+/gi, // Boolean logic patterns
    /\b(OR|AND)\s+['"].*['"].*['"/]/gi,
  ];
  
  return sqlPatterns.some(pattern => pattern.test(input));
}

// XSS pattern detection
function containsXssPatterns(input: string): boolean {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers
    /<\s*\w+[^>]*on\w+/gi,
  ];
  
  return xssPatterns.some(pattern => pattern.test(input));
}

// Command injection detection
function containsCommandInjection(input: string): boolean {
  const cmdPatterns = [
    /[;&|`$(){}]/g, // Command separators and substitution
    /\b(rm|del|format|sudo|su|chmod|chown)\b/gi,
    /\b(curl|wget|nc|netcat|telnet|ssh)\b/gi,
  ];
  
  return cmdPatterns.some(pattern => pattern.test(input));
}

// Prompt injection detection
function containsPromptInjection(input: string): boolean {
  const promptInjectionPatterns = [
    // System prompt overrides
    /ignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/gi,
    /forget\s+(everything|all|previous|above)/gi,
    /act\s+as\s+(if\s+)?you\s+are/gi,
    /pretend\s+(to\s+be|you\s+are)/gi,
    
    // Role confusion
    /you\s+are\s+now\s+(a|an)/gi,
    /(start|begin)\s+over/gi,
    /new\s+(instructions?|prompt|role)/gi,
    
    // Information extraction attempts
    /what\s+(are\s+)?your\s+(instructions?|prompts?|rules?)/gi,
    /tell\s+me\s+about\s+your\s+(system|prompt|instructions?)/gi,
    /reveal\s+your\s+(prompt|instructions?|system)/gi,
    
    // Jailbreak patterns
    /\bDAN\b|do\s+anything\s+now/gi,
    /developer\s+mode/gi,
    /evil\s+mode/gi,
    /jailbreak/gi,
    
    // Excessive repeating characters (often used to overwhelm)
    /(.)\1{20,}/g,
  ];
  
  return promptInjectionPatterns.some(pattern => pattern.test(input));
}

// Detect excessive repetition
function containsExcessiveRepetition(input: string): boolean {
  // Check for repeating words
  const words = input.toLowerCase().split(/\s+/);
  const wordCounts: Record<string, number> = {};
  
  for (const word of words) {
    if (word.length > 3) { // Only count longer words
      wordCounts[word] = (wordCounts[word] || 0) + 1;
      if (wordCounts[word] > Math.max(5, words.length * 0.1)) {
        return true; // Word repeated too many times
      }
    }
  }
  
  // Check for repeating characters
  if (/(.{3,})\1{5,}/.test(input)) {
    return true; // Same 3+ character sequence repeated 5+ times
  }
  
  return false;
}

// Validate model name against known models
function isValidModelName(name: string): boolean {
  const validModels = [
    // Anthropic
    'claude-3-opus', 'claude-3.5-sonnet', 'claude-3-haiku',
    
    // OpenAI
    'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo',
    'o1-preview', 'o1-mini',
    
    // Google
    'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
    
    // Meta
    'llama-3.1-70b', 'llama-3.1-8b', 'code-llama-34b',
    
    // Mistral
    'mistral-large', 'mistral-medium', 'mistral-small', 'codestral',
    
    // Cohere
    'command-r-plus', 'command-r'
  ];
  
  return validModels.includes(name);
}

// Check for private IP addresses in URLs
function containsPrivateIP(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    
    // Private IPv4 ranges
    const privateRanges = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^127\./,                   // 127.0.0.0/8 (localhost)
      /^169\.254\./,              // 169.254.0.0/16 (link-local)
    ];
    
    // Special hostnames
    const privateHosts = ['localhost', 'local'];
    
    if (privateHosts.includes(hostname.toLowerCase())) {
      return true;
    }
    
    return privateRanges.some(range => range.test(hostname));
  } catch {
    return false; // If URL parsing fails, it's not a valid URL anyway
  }
}

// ==== VALIDATION UTILITIES ====

// Validate request body against schema
export async function validateRequest<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      
      return {
        success: false,
        error: `Validation failed: ${errors}`
      };
    }
    
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON in request body'
    };
  }
}

// Validate query parameters
export function validateQueryParams<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const { searchParams } = new URL(req.url);
    const params: Record<string, string | string[]> = {};
    
    for (const [key, value] of searchParams.entries()) {
      if (params[key]) {
        // Multiple values for same key
        if (Array.isArray(params[key])) {
          (params[key] as string[]).push(value);
        } else {
          params[key] = [params[key] as string, value];
        }
      } else {
        params[key] = value;
      }
    }
    
    const result = schema.safeParse(params);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      
      return {
        success: false,
        error: `Query parameter validation failed: ${errors}`
      };
    }
    
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid query parameters'
    };
  }
}

// Sanitize input for logging (remove sensitive data)
export function sanitizeForLogging(input: any): any {
  if (typeof input === 'string') {
    return input.replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '[REDACTED]')
                .replace(/sk-[a-zA-Z0-9]{20,}/g, '[API_KEY_REDACTED]')
                .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeForLogging);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('password') || 
          lowerKey.includes('token') || 
          lowerKey.includes('key') ||
          lowerKey.includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }
  
  return input;
}

// Estimate token count for rate limiting
export function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Token estimation for chat messages
export function estimateMessageTokens(messages: Array<{ role: string; content: string }>): number {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Add tokens for content
    totalTokens += estimateTokenCount(message.content);
    
    // Add overhead for message structure
    totalTokens += 4; // Role + structure overhead
  }
  
  return totalTokens;
}

// Export all schemas for use in API routes
export const schemas = {
  router: routerRequestSchema,
  orchestrator: orchestratorRequestSchema,
  chatCompletions: chatCompletionsSchema,
  wallet: {
    create: walletCreateSchema,
    update: walletUpdateSchema,
  },
  budget: {
    create: budgetCreateSchema,
    update: budgetUpdateSchema,
  },
  alert: {
    create: alertCreateSchema,
    update: alertUpdateSchema,
  },
};

// Install Zod as it's not currently a dependency
export const zodDependencyNote = `
To use these validation schemas, install Zod:
npm install zod

Add to package.json dependencies:
"zod": "^3.22.4"
`;