/**
 * The job queue. The API never does slow work itself:
 * it adds a job here, and a worker picks it up.
 */
import { Queue } from "bullmq";
import { QUEUE_NAME, type JobName, type PipelineJobData } from "@dualflow/shared";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

export const pipelineQueue = new Queue<PipelineJobData, unknown, JobName>(QUEUE_NAME, {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    password: redisUrl.password || undefined,
    // rediss:// means the connection must use TLS (most cloud Redis providers).
    tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  },
  defaultJobOptions: {
    attempts: 3, // retry a failed step up to 3 times
    backoff: { type: "exponential", delay: 10_000 }, // wait 10s, 20s, 40s
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
