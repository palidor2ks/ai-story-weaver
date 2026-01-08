import civilRights from '@/assets/topics/civil-rights.png';
import defenseForeign from '@/assets/topics/defense-foreign.png';
import economyJobs from '@/assets/topics/economy-jobs.png';
import education from '@/assets/topics/education.png';
import environmentEnergy from '@/assets/topics/environment-energy.png';
import governmentPolitics from '@/assets/topics/government-politics.png';
import healthWelfare from '@/assets/topics/health-welfare.png';
import immigrationSociety from '@/assets/topics/immigration-society.png';
import nativeTribal from '@/assets/topics/native-tribal.png';
import scienceTech from '@/assets/topics/science-tech.png';

const imageMap: Record<string, string> = {
  Scale: civilRights,
  Globe: defenseForeign,
  Briefcase: economyJobs,
  GraduationCap: education,
  Leaf: environmentEnergy,
  Landmark: governmentPolitics,
  Heart: healthWelfare,
  Users: immigrationSociety,
  HandHeart: nativeTribal,
  Cpu: scienceTech,
};

interface TopicIconProps {
  name: string;
  className?: string;
}

export const TopicIcon = ({ name, className }: TopicIconProps) => {
  const imageSrc = imageMap[name];
  if (!imageSrc) return null;
  return (
    <img 
      src={imageSrc} 
      alt="" 
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
};
