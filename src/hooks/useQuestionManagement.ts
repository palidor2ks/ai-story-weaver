import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuestionOption {
  id: string;
  question_id: string;
  text: string;
  value: number;
  display_order: number | null;
  is_skip_option: boolean | null;
}

export interface Question {
  id: string;
  text: string;
  topic_id: string;
  is_onboarding_canonical: boolean | null;
  onboarding_slot: number | null;
  question_options: QuestionOption[];
}

export interface Topic {
  id: string;
  name: string;
  icon: string;
}

export interface QuestionFormData {
  id: string;
  text: string;
  topic_id: string;
  is_onboarding_canonical: boolean;
  onboarding_slot: number | null;
  options: {
    id: string;
    value: number;
    text: string;
    label: string;
    is_skip_option: boolean;
    display_order: number;
  }[];
}

// Shape returned by the generate-quiz-question edge function.
export interface GeneratedQuestionData {
  questionText: string;
  options: { L10: string; L5: string; C: string; R5: string; R10: string };
  error?: string;
}

export function useAdminQuestions() {
  return useQuery({
    queryKey: ['admin-questions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .order('topic_id')
        .order('id');

      if (error) throw error;
      return data as Question[];
    },
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Topic[];
    },
  });
}

// Create a question plus its options; rolls back the question if options fail.
export async function createQuestionWithOptions(form: QuestionFormData): Promise<string> {
  const { error: questionError } = await supabase
    .from('questions')
    .insert({
      id: form.id,
      text: form.text,
      topic_id: form.topic_id,
      is_onboarding_canonical: form.is_onboarding_canonical,
      onboarding_slot: form.onboarding_slot,
    });

  if (questionError) throw questionError;

  const optionsToInsert = form.options
    .filter(opt => !opt.is_skip_option)
    .map((opt, index) => ({
      id: `${form.id}-opt-${index + 1}`,
      question_id: form.id,
      text: opt.text,
      value: opt.value,
      display_order: index + 1,
      is_skip_option: false,
    }));

  optionsToInsert.push({
    id: `${form.id}-skip`,
    question_id: form.id,
    text: "Not important to me",
    value: 0,
    display_order: 6,
    is_skip_option: true,
  });

  const { error: optionsError } = await supabase
    .from('question_options')
    .insert(optionsToInsert);

  if (optionsError) {
    await supabase.from('questions').delete().eq('id', form.id);
    throw optionsError;
  }

  return form.id;
}

// Update a question + its options. When the text changed, fan out update
// notifications to every user/candidate/party that already answered it (best
// effort — notification failure does not block the update).
export async function updateQuestionWithOptions(
  form: QuestionFormData,
  originalQuestion: Question | null,
): Promise<string> {
  const textChanged = originalQuestion?.text !== form.text;

  // Update the question
  const { error: questionError } = await supabase
    .from('questions')
    .update({
      text: form.text,
      topic_id: form.topic_id,
      is_onboarding_canonical: form.is_onboarding_canonical,
      onboarding_slot: form.onboarding_slot,
    })
    .eq('id', form.id);

  if (questionError) throw questionError;

  // Update each option
  for (const opt of form.options) {
    if (opt.id) {
      const { error: optionError } = await supabase
        .from('question_options')
        .update({
          text: opt.text,
          value: opt.value,
          display_order: opt.display_order,
        })
        .eq('id', opt.id);

      if (optionError) throw optionError;
    }
  }

  // If text changed, create notifications for affected entities
  if (textChanged && originalQuestion) {
    try {
      // Get affected user IDs
      const { data: userAnswers } = await supabase
        .from('quiz_answers')
        .select('user_id')
        .eq('question_id', form.id);

      // Get affected candidate IDs
      const { data: candidateAnswers } = await supabase
        .from('candidate_answers')
        .select('candidate_id')
        .eq('question_id', form.id);

      // Get affected party IDs
      const { data: partyAnswers } = await supabase
        .from('party_answers')
        .select('party_id')
        .eq('question_id', form.id);

      // Create unique lists
      const uniqueUserIds = [...new Set(userAnswers?.map(a => a.user_id) || [])];
      const uniqueCandidateIds = [...new Set(candidateAnswers?.map(a => a.candidate_id) || [])];
      const uniquePartyIds = [...new Set(partyAnswers?.map(a => a.party_id) || [])];

      // Prepare notifications
      const notifications = [
        ...uniqueUserIds.map(id => ({
          question_id: form.id,
          entity_type: 'user' as const,
          entity_id: id,
          old_question_text: originalQuestion.text,
          new_question_text: form.text,
        })),
        ...uniqueCandidateIds.map(id => ({
          question_id: form.id,
          entity_type: 'candidate' as const,
          entity_id: id,
          old_question_text: originalQuestion.text,
          new_question_text: form.text,
        })),
        ...uniquePartyIds.map(id => ({
          question_id: form.id,
          entity_type: 'party' as const,
          entity_id: id,
          old_question_text: originalQuestion.text,
          new_question_text: form.text,
        })),
      ];

      if (notifications.length > 0) {
        const { error: notifyError } = await supabase
          .from('question_update_notifications')
          .insert(notifications);

        if (notifyError) {
          console.error('Failed to create notifications:', notifyError);
          // Don't throw - we still want the update to succeed
        } else {
          console.log(`Created ${notifications.length} update notifications`);
        }
      }
    } catch (e) {
      console.error('Error creating notifications:', e);
      // Don't throw - notification failure shouldn't block the update
    }
  }

  return form.id;
}

// Invoke the AI question generator. Returns the raw { data, error } response so
// the caller can branch on rate-limit / credit error strings in data.error.
export function generateQuizQuestion(body: Record<string, unknown>) {
  return supabase.functions.invoke('generate-quiz-question', { body });
}

// Insert an AI-generated question + its 6 options; rolls back on options failure.
export async function insertGeneratedQuestion(
  questionId: string,
  topicId: string,
  data: GeneratedQuestionData,
) {
  const { error: questionError } = await supabase
    .from('questions')
    .insert({
      id: questionId,
      text: data.questionText,
      topic_id: topicId,
      is_onboarding_canonical: false,
      onboarding_slot: null,
    });

  if (questionError) throw questionError;

  const optionsToInsert = [
    { id: `${questionId}-opt-1`, question_id: questionId, text: data.options.L10, value: -10, display_order: 1, is_skip_option: false },
    { id: `${questionId}-opt-2`, question_id: questionId, text: data.options.L5, value: -5, display_order: 2, is_skip_option: false },
    { id: `${questionId}-opt-3`, question_id: questionId, text: data.options.C, value: 0, display_order: 3, is_skip_option: false },
    { id: `${questionId}-opt-4`, question_id: questionId, text: data.options.R5, value: 5, display_order: 4, is_skip_option: false },
    { id: `${questionId}-opt-5`, question_id: questionId, text: data.options.R10, value: 10, display_order: 5, is_skip_option: false },
    { id: `${questionId}-skip`, question_id: questionId, text: "Not important to me", value: 0, display_order: 6, is_skip_option: true },
  ];

  const { error: optionsError } = await supabase
    .from('question_options')
    .insert(optionsToInsert);

  if (optionsError) {
    await supabase.from('questions').delete().eq('id', questionId);
    throw optionsError;
  }
}
