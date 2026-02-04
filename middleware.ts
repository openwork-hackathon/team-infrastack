// Security middleware for InfraStack
// Implements CORS, security headers, rate limiting, and request size limits

import { NextRequest, NextResponse } from 'next/server';
import { rateLimitPublic, rateLimitRouting, rateLimitOrchestration, rateLimitVault, RATE_LIMIT_CONFIGS } from './app/lib/security/rate-limiter';

// Content Security Policy
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // NextJS requires unsafe-inline/eval
  "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'"
].join('; ');

// Allowed origins for CORS (configure based on environment)
const getAllowedOrigins = (): string[] => {
  const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  // Default allowed origins
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  
  // Add production domains
  if (process.env.NODE_ENV === 'production') {
    // Add your production domains here
    defaultOrigins.push(
      'https://your-domain.com',
      'https://www.your-domain.com'
    );
  }
  
  return [...defaultOrigins, ...origins];
};

// Request size limits (in bytes)
const SIZE_LIMITS = {
  default: 1024 * 1024,      // 1MB default
  orchestrate: 5 * 1024 * 1024, // 5MB for orchestration (large prompts)
  route: 1024 * 1024,        // 1MB for routing
  vault: 512 * 1024,         // 512KB for vault operations
  chat: 2 * 1024 * 1024,     // 2MB for chat (conversations)
};

// Security headers configuration
const SECURITY_HEADERS = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'accelerometer=()',
    'gyroscope=()'
  ].join(', '),
  
  // Content Security Policy
  'Content-Security-Policy': CSP_POLICY,
  
  // HSTS (only in production)
  ...(process.env.NODE_ENV === 'production' && {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
  }),
  
  // Remove server header
  'Server': 'InfraStack-API',
  
  // API versioning
  'X-API-Version': '1.0',
};

// CORS configuration
function createCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const isOriginAllowed = origin && allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isOriginAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Client-Version'
    ].join(', '),
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true'
  };
}

// Get request size limit based on path
function getRequestSizeLimit(pathname: string): number {
  if (pathname.startsWith('/api/orchestrate')) return SIZE_LIMITS.orchestrate;
  if (pathname.startsWith('/api/route')) return SIZE_LIMITS.route;
  if (pathname.startsWith('/api/vault')) return SIZE_LIMITS.vault;
  if (pathname.startsWith('/api/v1/chat')) return SIZE_LIMITS.chat;
  return SIZE_LIMITS.default;
}

// Rate limiter selection based on endpoint
async function applyRateLimit(req: NextRequest): Promise<{
  success: boolean;
  headers: Record<string, string>;
  error?: string;
}> {
  const pathname = req.nextUrl.pathname;
  
  let rateLimitResult;
  
  try {
    if (pathname.startsWith('/api/orchestrate')) {
      rateLimitResult = await rateLimitOrchestration(req);
    } else if (pathname.startsWith('/api/route')) {
      rateLimitResult = await rateLimitRouting(req);
    } else if (pathname.startsWith('/api/vault')) {
      rateLimitResult = await rateLimitVault(req);
    } else if (pathname.startsWith('/api/v1/chat')) {
      rateLimitResult = await rateLimitRouting(req); // Use routing limits for chat
    } else if (pathname.startsWith('/api/')) {
      rateLimitResult = await rateLimitPublic(req);
    } else {
      // No rate limiting for non-API routes
      return { success: true, headers: {} };
    }
    
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': rateLimitResult.limit.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
    };
    
    if (!rateLimitResult.success) {
      headers['Retry-After'] = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString();
      
      return {
        success: false,
        headers,
        error: rateLimitResult.error || 'Rate limit exceeded'
      };
    }
    
    return { success: true, headers };
    
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - allow request if rate limiting fails
    return { success: true, headers: {} };
  }
}

// Check request size
async function checkRequestSize(req: NextRequest): Promise<boolean> {
  const sizeLimit = getRequestSizeLimit(req.nextUrl.pathname);
  const contentLength = req.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > sizeLimit) {
      return false;
    }
  }
  
  return true;
}

// Main middleware function
export async function middleware(req: NextRequest): Promise<NextResponse | undefined> {
  const origin = req.headers.get('origin') ?? undefined;
  const pathname = req.nextUrl.pathname;
  
  // Skip middleware for static files and internal Next.js routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg')
  ) {
    return;
  }
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    const corsHeaders = createCorsHeaders(origin);
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        ...corsHeaders
      }
    });
  }
  
  // Check request size for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const sizeOk = await checkRequestSize(req);
    if (!sizeOk) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: 'Request body too large',
            timestamp: new Date().toISOString()
          }
        }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS,
            ...createCorsHeaders(origin)
          }
        }
      );
    }
  }
  
  // Apply rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitResult = await applyRateLimit(req);
    
    if (!rateLimitResult.success) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: rateLimitResult.error,
            timestamp: new Date().toISOString()
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS,
            ...createCorsHeaders(origin),
            ...rateLimitResult.headers
          }
        }
      );
    }
    
    // Continue with request and add rate limit headers
    const response = NextResponse.next();
    
    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    // Add CORS headers
    const corsHeaders = createCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    // Add rate limit headers
    Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }
  
  // For non-API routes, just add security headers
  const response = NextResponse.next();
  
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  const corsHeaders = createCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (for API routes that have their own middleware)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * But include all API routes for security
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

// Export rate limit configs for use in API routes
export { RATE_LIMIT_CONFIGS };