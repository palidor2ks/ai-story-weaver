const emojiMap: Record<string, string> = {
  // Lucide component names -> emojis (for backward compatibility)
  Scale: '⚖️',
  Shield: '🛡️',
  Briefcase: '💼',
  GraduationCap: '🎓',
  Leaf: '🌿',
  Landmark: '🏛️',
  Heart: '❤️',
  Users: '👥',
  HandHeart: '🤝',
  Cpu: '💻',
  Gavel: '⚖️',
  Globe: '🌐',
  // Local topic icons
  '🏫': '🏫',
  '🏠': '🏠',
  '🩺': '🩺',
  '💲': '💲',
  '🚔': '🚔',
};

// Check if string is already an emoji
const isEmoji = (str: string) => {
  if (!str || str.length === 0) return false;
  const emojiRegex = /\p{Emoji}/u;
  return emojiRegex.test(str);
};

interface TopicIconProps {
  name: string;
  className?: string;
}

export const TopicIcon = ({ name, className }: TopicIconProps) => {
  // If it's already an emoji, render it directly
  if (isEmoji(name)) {
    return <span className={className}>{name}</span>;
  }
  
  // Otherwise, look up in the map
  const emoji = emojiMap[name];
  if (!emoji) return null;
  return <span className={className}>{emoji}</span>;
};
