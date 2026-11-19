/**
 * The job queue. The API never does slow work itself:
 * it adds a job to the PipelineJob table, and a worker picks it up
 * (on your computer, or in a GitHub Actions run on the free plan).
 */
export { enqueue } from "@dualflow/queue";
