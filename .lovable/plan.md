# Show selection order on topic chips

Replace the check badge in `src/components/TopicSelector.tsx` with the topic's position in `selectedTopics` (1, 2, or 3). The order is `selectedTopics.findIndex(t => t.id === topic.id) + 1`. Same circular badge in the top-right, just showing the number instead of a check.

No changes to selection logic, props, or callers — purely a visual swap.
