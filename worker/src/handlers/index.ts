import type { QueueJob } from "../queue.js";
import { repAnswersGenerate } from "./repAnswersGenerate.js";

export type HandlerResult = {
  metadata?: Record<string, unknown>;
  checkpoint?: unknown;
};

export type JobHandler = (job: QueueJob) => Promise<HandlerResult>;

export const handlers: Record<string, JobHandler> = {
  rep_answers_generate: repAnswersGenerate,
};
