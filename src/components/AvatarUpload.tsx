import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { User, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logBadgeEvent } from '@/lib/badges';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  userName: string;
  onAvatarChange: (url: string) => void;
}

export const AvatarUpload = ({ userId, currentAvatarUrl, userName, onAvatarChange }: AvatarUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setIsUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Add cache-busting query param
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithCacheBust })
        .eq('id', userId);

      if (updateError) throw updateError;

      setPreviewUrl(urlWithCacheBust);
      onAvatarChange(urlWithCacheBust);
      toast.success('Avatar updated successfully!');
      logBadgeEvent('avatar_uploaded');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative group">
      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-hero flex items-center justify-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={userName}
            className="w-full h-full object-cover"
            onError={() => setPreviewUrl(null)}
          />
        ) : (
          <User className="w-10 h-10 text-primary-foreground" />
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
      />
      
      <Button
        size="icon"
        variant="secondary"
        className={cn(
          "absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow-md",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        onClick={handleClick}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
};
