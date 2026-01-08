const emojiMap: Record<string, string> = {
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
};

interface TopicIconProps {
  name: string;
  className?: string;
}

export const TopicIcon = ({ name, className }: TopicIconProps) => {
  const emoji = emojiMap[name];
  if (!emoji) return null;
  return <span className={className}>{emoji}</span>;
};
