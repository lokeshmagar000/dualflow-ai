import { Queue } from "bullmq";
import { QUEUE_NAME, type JobName, type PipelineJobData } from "@dualflow/shared";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

export const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  password: redisUrl.password || undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null, // required by BullMQ workers
};

/** Workers use this to queue the NEXT step when a step finishes. */
export const pipelineQueue = new Queue<PipelineJobData, unknown, JobName>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
