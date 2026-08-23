/**
 * Upstash Redis Rate Limiter Configuration
 *
 * WHY REDIS IS REQUIRED FOR SERVERLESS:
 * =====================================
 * In serverless environments (Vercel, AWS Lambda, etc.), each request may be
 * handled by a different instance. In-memory rate limiting (Map-based) fails
 * because:
 *
 * 1. Cold starts create new instances with empty state
 * 2. Concurrent requests may hit different instances
 * 3. Instances are ephemeral and can be recycled at any time
 * 4. No shared memory between serverless function invocations
 *
 * Redis provides a centralized, persistent store that all instances share,
 * ensuring accurate rate limiting across the entire serverless fleet.
 *
 * HOW SLIDING WINDOW WORKS:
 * =========================
 * The sliding window algorithm provides smoother rate limiting than fixed windows:
 *
 * Fixed Window Problem:
 * - Window: 10 requests per minute
 * - User makes 10 requests at 0:59
 * - Window resets at 1:00
 * - User makes 10 more requests at 1:01
 * - Result: 20 requests in 2 seconds (spike allowed)
 *
 * Sliding Window Solution:
 * - Tracks requests in overlapping time periods
 * - Calculates weighted average based on current position in window
 * - Prevents boundary spikes while maintaining fair limits
 *
 * Example with 10 req/min limit at time 0:30:
 * - Previous window (0:00-1:00): 8 requests
 * - Current window (1:00-2:00): 4 requests
 * - Position in current window: 50% (0:30)
 * - Weighted count: (8 * 0.5) + 4 = 8 requests
 * - Remaining: 10 - 8 = 2 requests allowed
 */

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

/**
 * Upstash Redis client singleton.
 *
 * Environment variables required:
 * - UPSTASH_REDIS_REST_URL: Redis REST API URL from Upstash console
 * - UPSTASH_REDIS_REST_TOKEN: Authentication token from Upstash console
 *
 * These are automatically available when using Vercel + Upstash integration.
 */
function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing Upstash Redis configuration. ' +
        'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.',
    );
  }

  return new Redis({ url, token });
}

/**
 * Limiter configuration type.
 */
export type LimiterConfig = {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSec: number;
  /** Redis key prefix for this limiter */
  prefix: string;
};

/**
 * Named limiter presets for different security contexts.
 *
 * Key naming convention: rl:{context}:{type}:{identifier}
 * - rl: rate limit namespace
 * - context: login, forgot, register, etc.
 * - type: ip, email, user
 * - identifier: the actual IP/email/user ID
 */
export const LIMITER_CONFIGS: Record<string, LimiterConfig> = {
  // Login protection: moderate limits, prevents brute force
  loginIp: {
    limit: 10,
    windowSec: 10 * 60, // 10 minutes
    prefix: 'rl:login:ip',
  },
  loginEmail: {
    limit: 5,
    windowSec: 10 * 60, // 10 minutes
    prefix: 'rl:login:email',
  },

  // Forgot password: strict limits, prevents email enumeration spam
  forgotIp: {
    limit: 3,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:forgot:ip',
  },
  forgotEmail: {
    limit: 3,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:forgot:email',
  },

  // Registration: moderate limits, prevents spam accounts
  registerIp: {
    limit: 5,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:register:ip',
  },

  // Resending the verification email: strict, it is an outbound-email trigger
  resendVerificationIp: {
    limit: 5,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:resend:ip',
  },
  resendVerificationEmail: {
    limit: 3,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:resend:email',
  },

  // Account deletion: very strict, sensitive operation
  deleteAccount: {
    limit: 1,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:delete:user',
  },

  // General API protection
  apiGeneral: {
    limit: 100,
    windowSec: 60, // 1 minute
    prefix: 'rl:api:general',
  },

  // Strict limit for expensive operations
  apiStrict: {
    limit: 10,
    windowSec: 60, // 1 minute
    prefix: 'rl:api:strict',
  },

  // Shadow rerank provider calls. Deliberately its own budget: a burst of dashboard traffic must
  // not be able to spend the rerank allowance, and a rerank must not be able to lock the user out
  // of their own taste profile. Checked only inside shadow execution, never on a user response.
  aiRerank: {
    limit: 5,
    windowSec: 60 * 60, // 1 hour
    prefix: 'rl:ai:rerank',
  },
} as const;

export type LimiterName = keyof typeof LIMITER_CONFIGS;

/**
 * Cache for Ratelimit instances.
 * Each limiter config gets its own Ratelimit instance.
 */
const limiterCache = new Map<string, Ratelimit>();

/**
 * Get or create a Ratelimit instance for the given configuration.
 */
export function getRateLimiter(config: LimiterConfig): Ratelimit {
  const cacheKey = `${config.prefix}:${config.limit}:${config.windowSec}`;

  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSec} s`),
      prefix: config.prefix,
      analytics: true, // Enable Upstash analytics dashboard
    });
    limiterCache.set(cacheKey, limiter);
  }

  return limiter;
}

/**
 * Get a named rate limiter by preset name.
 */
export function getNamedLimiter(name: LimiterName): Ratelimit {
  const config = LIMITER_CONFIGS[name];
  if (!config) {
    throw new Error(`Unknown rate limiter: ${name}`);
  }
  return getRateLimiter(config);
}

/**
 * Get the configuration for a named limiter.
 */
export function getLimiterConfig(name: LimiterName): LimiterConfig {
  const config = LIMITER_CONFIGS[name];
  if (!config) {
    throw new Error(`Unknown rate limiter: ${name}`);
  }
  return config;
}
