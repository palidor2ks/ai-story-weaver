import { Scale, Globe, Briefcase, GraduationCap, Leaf, Landmark, Heart, Users, HandHeart, Cpu, type LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Scale,
  Globe,
  Briefcase,
  GraduationCap,
  Leaf,
  Landmark,
  Heart,
  Users,
  HandHeart,
  Cpu,
};

interface TopicIconProps {
  name: string;
  className?: string;
}

export const TopicIcon = ({ name, className }: TopicIconProps) => {
  const IconComponent = iconMap[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};
