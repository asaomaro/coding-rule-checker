import * as logger from './logger';

/**
 * Manages concurrent execution with a maximum limit
 * Tasks that exceed the limit are queued and executed when slots become available
 */
export class ConcurrencyQueue {
  private maxConcurrent: number;
  private running: number = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
    logger.log(`[ConcurrencyQueue] Initialized with max concurrent: ${maxConcurrent}`);
  }

  /**
   * Execute a task with concurrency control
   * @param task - The async task to execute
   * @returns Promise that resolves when the task completes
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    // Wait for a slot to become available
    await this.acquire();

    try {
      // Execute the task
      const result = await task();
      return result;
    } finally {
      // Release the slot
      this.release();
    }
  }

  /**
   * Acquire a slot for execution
   * If no slots available, queues and waits
   */
  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      logger.log(`[ConcurrencyQueue] Acquired slot (${this.running}/${this.maxConcurrent})`);
      return;
    }

    // No slots available, queue and wait
    logger.log(`[ConcurrencyQueue] No slots available, queuing (${this.queue.length + 1} in queue)`);
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a slot and process next queued task
   */
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      logger.log(`[ConcurrencyQueue] Processing next queued task (${this.queue.length} remaining)`);
      next();
    } else {
      this.running--;
      logger.log(`[ConcurrencyQueue] Released slot (${this.running}/${this.maxConcurrent})`);
    }
  }

  /**
   * Get current queue status
   */
  getStatus(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}
