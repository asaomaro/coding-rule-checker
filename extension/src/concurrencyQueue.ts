import * as logger from './logger';

/**
 * Simple semaphore-based concurrency limiter with retry logic
 * Controls maximum concurrent LLM requests and enforces minimum delay between requests
 */
export class ConcurrencyQueue {
  private maxConcurrent: number;
  private currentConcurrent: number = 0;
  private minDelayMs: number;
  private maxRetries: number;
  private lastRequestTime: number = 0;
  private waitQueue: Array<() => void> = [];

  constructor(maxConcurrent: number = 10, minDelayMs: number = 1000, maxRetries: number = 3) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
    this.maxRetries = maxRetries;
    logger.log(`[ConcurrencyQueue] Initialized with max concurrent: ${maxConcurrent}, min delay: ${minDelayMs}ms, max retries: ${maxRetries}`);
  }

  /**
   * Execute a task with concurrency control and automatic retry on rate limit
   * @param task - The async task to execute
   * @returns Promise that resolves when the task completes
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    // Wait for a slot to become available
    await this.acquireSlot();

    try {
      // Apply minimum delay between requests
      await this.applyDelay();

      // Execute with retry logic (built-in)
      let lastError: any;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          logger.log(`[ConcurrencyQueue] Executing task (attempt ${attempt + 1}/${this.maxRetries + 1})`);
          const result = await task();
          return result;
        } catch (error: any) {
          lastError = error;

          // Only retry on rate limit errors
          if (error.name === 'ChatRateLimited' && attempt < this.maxRetries) {
            const backoffDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s...
            logger.log(`[ConcurrencyQueue] Rate limit hit. Retrying in ${backoffDelay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            // Non-retryable error or max retries exceeded
            throw error;
          }
        }
      }

      throw lastError;
    } finally {
      // Always release the slot
      this.releaseSlot();
    }
  }

  /**
   * Acquire a slot (wait if all slots are busy)
   */
  private async acquireSlot(): Promise<void> {
    if (this.currentConcurrent < this.maxConcurrent) {
      this.currentConcurrent++;
      // Only log when slots are becoming scarce
      if (this.currentConcurrent >= this.maxConcurrent) {
        logger.log(`[ConcurrencyQueue] All slots occupied (${this.currentConcurrent}/${this.maxConcurrent})`);
      }
      return;
    }

    // Wait for a slot to become available (log only when queueing starts)
    const wasEmpty = this.waitQueue.length === 0;
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    if (wasEmpty) {
      logger.log(`[ConcurrencyQueue] Tasks are now queuing (queue started)`);
    }
  }

  /**
   * Release a slot and wake up next waiting task
   */
  private releaseSlot(): void {
    const next = this.waitQueue.shift();
    if (next) {
      // Transfer slot directly to waiting task
      // Only log when queue becomes empty
      if (this.waitQueue.length === 0) {
        logger.log(`[ConcurrencyQueue] Queue cleared (all waiting tasks processed)`);
      }
      next();
    } else {
      // No one waiting, just decrement
      this.currentConcurrent--;
    }
  }

  /**
   * Apply minimum delay between requests to avoid rate limiting
   */
  private async applyDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelayMs) {
      const delay = this.minDelayMs - timeSinceLastRequest;
      // Only log significant delays (not every request)
      if (delay > this.minDelayMs * 0.8) {
        logger.log(`[ConcurrencyQueue] Applying ${delay}ms delay between requests`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get current queue status
   */
  getStatus(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.currentConcurrent,
      queued: this.waitQueue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}
