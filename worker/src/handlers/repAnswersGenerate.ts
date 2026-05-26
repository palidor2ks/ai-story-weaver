// Worker handler for rep_answers_generate jobs.
//
// Payload: { candidateId: string, questionIds?: string[], forceRegenerate?: boolean }
//
// Replaces the chunked/self-chaining edge function (get-candidate-answers).
// The worker has no wall-clock limit so all questions for the candidate are
// processed in a single job invocation.

import type { QueueJob } from "../queue.js";
import type { HandlerResult } from "./index.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import {
  isLocalOfficial,
  loadExistingAnswerQuestionIds,
  loadOfficialInfo,
  loadQuestionsForScope,
  loadScopeTopicIds,
  saveAnswer,
  updateCandidateScore,
} from "../lib/candidateAnswers.js";
import { ResearchContext, researchQuestionPosition } from "../lib/research.js";

interface RepAnswersPayload {
  candidateId: string;
  questionIds?: string[] | null;
  forceRegenerate?: boolean;
}

function parsePayload(payload: Record<string, unknown>): RepAnswersPayload {
  const candidateId = typeof payload.candidateId === "string" ? payload.candidateId : "";
  if (!candidateId) throw new Error("payload.candidateId is required");
  const questionIds = Array.isArray(payload.questionIds)
    ? (payload.questionIds as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  const forceRegenerate = payload.forceRegenerate === true;
  return { candidateId, questionIds, forceRegenerate };
}

export async function repAnswersGenerate(job: QueueJob): Promise<HandlerResult> {
  const log = logger.child({ job_id: job.id, handler: "rep_answers_generate" });
  const { candidateId, questionIds, forceRegenerate } = parsePayload(job.payload);

  if (!config.LOVABLE_API_KEY && !config.PERPLEXITY_API_KEY) {
    throw new Error("no AI keys configured (need LOVABLE_API_KEY or PERPLEXITY_API_KEY)");
  }

  const official = await loadOfficialInfo(candidateId);
  if (!official) {
    log.warn({ candidateId }, "candidate not found");
    return { metadata: { skipped: "candidate_not_found", candidateId } };
  }

  const scope = isLocalOfficial(official.office) ? "local" : "all";
  const topicIds = await loadScopeTopicIds(scope);
  const allQuestions = await loadQuestionsForScope(topicIds, questionIds ?? null);
  if (allQuestions.length === 0) {
    return { metadata: { candidateId, name: official.name, scope, total: 0 } };
  }

  const existing = await loadExistingAnswerQuestionIds(candidateId, questionIds ?? null);
  const questionsToGenerate = forceRegenerate
    ? allQuestions
    : allQuestions.filter((q) => !existing.has(q.id));

  log.info(
    {
      candidateId,
      name: official.name,
      party: official.party,
      scope,
      total: allQuestions.length,
      existing: existing.size,
      toGenerate: questionsToGenerate.length,
      forceRegenerate,
    },
    "starting rep_answers_generate",
  );

  if (questionsToGenerate.length === 0) {
    const overallScore = await updateCandidateScore(candidateId);
    return {
      metadata: { candidateId, name: official.name, scope, generated: 0, skipped: "all_existing", overallScore },
    };
  }

  const ctx = new ResearchContext(log);
  let generated = 0;
  let failed = 0;
  let researched = 0;

  for (let i = 0; i < questionsToGenerate.length; i++) {
    const q = questionsToGenerate[i];
    log.info({ idx: i + 1, of: questionsToGenerate.length, question_id: q.id }, "researching question");
    try {
      const answer = await researchQuestionPosition(
        ctx,
        official.name,
        official.office,
        official.state,
        official.party,
        q,
      );
      if (!answer) {
        failed += 1;
        continue;
      }
      await saveAnswer(candidateId, answer);
      generated += 1;
      if (answer.evidence_type !== "inferred") researched += 1;
    } catch (err) {
      failed += 1;
      log.error({ err, question_id: q.id }, "question failed");
    }
  }

  const overallScore = await updateCandidateScore(candidateId);
  log.info({ generated, failed, researched, overallScore }, "rep_answers_generate complete");

  return {
    metadata: {
      candidateId,
      name: official.name,
      scope,
      total: allQuestions.length,
      generated,
      failed,
      researched,
      overallScore,
      perplexityCalls: ctx.perplexityCallCount,
    },
  };
}
