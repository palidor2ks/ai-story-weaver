import { useState } from 'react';
import { cn } from '@/lib/utils';

interface OfficialAvatarProps {
  imageUrl?: string | null;
  name: string;
  party: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const getPartyRingColor = (party: string) => {
  switch (party) {
    case 'Democrat': return 'ring-blue-500';
    case 'Republican': return 'ring-red-500';
    case 'Independent': return 'ring-purple-500';
    default: return 'ring-muted-foreground';
  }
};

const getPartyBgColor = (party: string) => {
  switch (party) {
    case 'Democrat': return 'bg-blue-600';
    case 'Republican': return 'bg-red-600';
    case 'Independent': return 'bg-purple-600';
    default: return 'bg-muted';
  }
};

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() || '?';
};

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-24 h-24 md:w-32 md:h-32',
  xl: 'w-32 h-32 md:w-40 md:h-40',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-2xl md:text-3xl',
  xl: 'text-3xl md:text-4xl',
};

export const OfficialAvatar = ({
  imageUrl,
  name,
  party,
  size = 'md',
  className,
}: OfficialAvatarProps) => {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = imageUrl && imageUrl.trim() !== '' && !imageError;

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden flex-shrink-0 ring-2',
        sizeClasses[size],
        getPartyRingColor(party),
        className
      )}
    >
      {hasValidImage ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center',
            getPartyBgColor(party)
          )}
        >
          <span className={cn('text-white font-bold', textSizeClasses[size])}>
            {getInitials(name)}
          </span>
        </div>
      )}
    </div>
  );
};
