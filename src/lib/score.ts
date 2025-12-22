import { TopicScore } from '@/types';

interface QuizAnswer {
  questionId: string;
  value: number;
}

interface Question {
  id: string;
  topicId: string;
}

interface TopicWeight {
  id: string;
  weight: number;
}

interface TopicInfo {
  id: string;
  name: string;
}

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculate quiz scores from answers with topic weighting
 */
export function calculateQuizScore(
  answers: QuizAnswer[],
  questions: Question[],
  selectedTopics: TopicWeight[],
  topicInfo: TopicInfo[]
): { overall: number; byTopic: TopicScore[] } {
  // Group answers by topic
  const topicAnswers: Record<string, number[]> = {};
  
  answers.forEach(answer => {
    const question = questions.find(q => q.id === answer.questionId);
    if (question) {
      if (!topicAnswers[question.topicId]) {
        topicAnswers[question.topicId] = [];
      }
      topicAnswers[question.topicId].push(answer.value);
    }
  });

  // Calculate per-topic scores
  const topicScores: TopicScore[] = Object.entries(topicAnswers).map(([topicId, values]) => {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const normalizedScore = Math.round(avg * 10);
    const topic = topicInfo.find(t => t.id === topicId);
    return {
      topicId,
      topicName: topic?.name || topicId,
      score: normalizedScore,
    };
  });

  // Calculate weighted overall score
  let weightedSum = 0;
  let totalWeight = 0;
  
  topicScores.forEach(ts => {
    const selectedTopic = selectedTopics.find(st => st.id === ts.topicId);
    const weight = selectedTopic?.weight || 1;
    weightedSum += ts.score * weight;
    totalWeight += weight;
  });

  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { overall, byTopic: topicScores };
}
