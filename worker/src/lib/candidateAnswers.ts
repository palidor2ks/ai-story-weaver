// Direct Postgres reads/writes for the rep-answers pipeline.
// Replaces the supabase-js calls from the original edge function.

import { pool } from "../db.js";
import type { GeneratedAnswer, Question, QuestionOption } from "./research.js";

export interface OfficialInfo {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
}

const LOCAL_OFFICES = [
  "governor", "lieutenant governor", "attorney general", "secretary of state",
  "state treasurer", "state auditor", "state comptroller", "state senator", "state representative",
  "mayor", "city council", "county executive", "county commissioner", "alderman", "selectman",
  "town council", "school board", "sheriff", "district attorney", "municipal", "borough",
  "township", "village", "assessor", "clerk", "recorder", "coroner", "public defender",
];

export function isLocalOfficial(office: string): boolean {
  const officeLower = (office || "").toLowerCase();
  return LOCAL_OFFICES.some((lo) => officeLower.includes(lo));
}

export async function loadOfficialInfo(candidateId: string): Promise<OfficialInfo | null> {
  // candidates → static_officials → candidate_overrides
  const c = await pool.query<OfficialInfo>(
    `SELECT id, name, party, office, state FROM public.candidates WHERE id = $1 LIMIT 1`,
    [candidateId],
  );
  if (c.rows[0]) return c.rows[0];

  const s = await pool.query<OfficialInfo>(
    `SELECT id, name, party, office, state FROM public.static_officials WHERE id = $1 LIMIT 1`,
    [candidateId],
  );
  if (s.rows[0]) return s.rows[0];

  const o = await pool.query<{ candidate_id: string; name: string; party: string; office: string; state: string }>(
    `SELECT candidate_id, name, party, office, state FROM public.candidate_overrides WHERE candidate_id = $1 LIMIT 1`,
    [candidateId],
  );
  const ov = o.rows[0];
  if (ov) return { id: ov.candidate_id, name: ov.name, party: ov.party, office: ov.office, state: ov.state };

  return null;
}

export async function loadScopeTopicIds(scope: "local" | "all"): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM public.topics WHERE scope = $1`,
    [scope],
  );
  return rows.map((r) => r.id);
}

export async function loadQuestionsForScope(
  topicIds: string[],
  questionIds: string[] | null,
): Promise<Question[]> {
  if (topicIds.length === 0) return [];

  const params: unknown[] = [topicIds];
  let sql = `
    SELECT q.id, q.text, q.topic_id,
      COALESCE(
        (
          SELECT json_agg(json_build_object('value', o.value, 'text', o.text) ORDER BY o.value)
          FROM public.question_options o WHERE o.question_id = q.id
        ),
        '[]'::json
      ) AS question_options
    FROM public.questions q
    WHERE q.topic_id = ANY($1::text[])
  `;
  if (questionIds && questionIds.length > 0) {
    params.push(questionIds);
    sql += ` AND q.id = ANY($${params.length}::text[])`;
  }

  const { rows } = await pool.query<{ id: string; text: string; topic_id: string; question_options: QuestionOption[] }>(sql, params);
  return rows;
}

export async function loadExistingAnswerQuestionIds(
  candidateId: string,
  questionIds: string[] | null,
): Promise<Set<string>> {
  const params: unknown[] = [candidateId];
  let sql = `SELECT question_id FROM public.candidate_answers WHERE candidate_id = $1`;
  if (questionIds && questionIds.length > 0) {
    params.push(questionIds);
    sql += ` AND question_id = ANY($${params.length}::text[])`;
  }
  const { rows } = await pool.query<{ question_id: string }>(sql, params);
  return new Set(rows.map((r) => r.question_id));
}

const VALID_SOURCE_TYPES = new Set([
  "voting_record", "public_statement", "campaign_website", "interview", "legislation", "web_research", "other",
]);

export async function saveAnswer(candidateId: string, answer: GeneratedAnswer): Promise<void> {
  const sourceType = VALID_SOURCE_TYPES.has(answer.source_type) ? answer.source_type : "other";
  await pool.query(
    `INSERT INTO public.candidate_answers (
      candidate_id, question_id, answer_value, source_description, source_url,
      source_urls, source_titles, source_type, confidence, evidence_type,
      voting_record_summary, public_statement_summary, has_discrepancy, discrepancy_note
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (candidate_id, question_id) DO UPDATE SET
      answer_value = EXCLUDED.answer_value,
      source_description = EXCLUDED.source_description,
      source_url = EXCLUDED.source_url,
      source_urls = EXCLUDED.source_urls,
      source_titles = EXCLUDED.source_titles,
      source_type = EXCLUDED.source_type,
      confidence = EXCLUDED.confidence,
      evidence_type = EXCLUDED.evidence_type,
      voting_record_summary = EXCLUDED.voting_record_summary,
      public_statement_summary = EXCLUDED.public_statement_summary,
      has_discrepancy = EXCLUDED.has_discrepancy,
      discrepancy_note = EXCLUDED.discrepancy_note,
      updated_at = now()`,
    [
      candidateId,
      answer.question_id,
      answer.answer_value,
      answer.source_description,
      answer.source_url,
      answer.source_urls,
      answer.source_titles,
      sourceType,
      answer.confidence,
      answer.evidence_type,
      answer.voting_record_summary ?? null,
      answer.public_statement_summary ?? null,
      answer.has_discrepancy ?? false,
      answer.discrepancy_note ?? null,
    ],
  );
}

export async function updateCandidateScore(candidateId: string): Promise<number | null> {
  const { rows } = await pool.query<{ avg: string | null }>(
    `SELECT AVG(answer_value)::numeric(10,2) AS avg
       FROM public.candidate_answers WHERE candidate_id = $1`,
    [candidateId],
  );
  const avg = rows[0]?.avg;
  if (avg === null || avg === undefined) return null;
  const overallScore = Math.round(Number(avg) * 100) / 100;

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.candidates WHERE id = $1 LIMIT 1`,
    [candidateId],
  );

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE public.candidates
         SET overall_score = $2,
             last_answers_sync = now(),
             answers_source = 'ai_generated'
       WHERE id = $1`,
      [candidateId, overallScore],
    );
  } else {
    await pool.query(
      `INSERT INTO public.candidate_overrides (candidate_id, overall_score)
       VALUES ($1, $2)
       ON CONFLICT (candidate_id) DO UPDATE SET overall_score = EXCLUDED.overall_score`,
      [candidateId, overallScore],
    );
  }
  return overallScore;
}
