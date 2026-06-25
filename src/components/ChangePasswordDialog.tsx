import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Eye, EyeOff, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const ChangePasswordDialog = () => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const handleSubmit = async () => {
    if (formData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast.success('Password updated successfully!');
      setOpen(false);
      setFormData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Error updating password:', error);
      toast.error((error as Error).message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setFormData({ newPassword: '', confirmPassword: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
          <KeyRound className="w-3 h-3" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-white rounded-2xl p-0 overflow-hidden border-0 gap-0">
        <DialogHeader className="bg-poli-surface px-5 pt-5 pb-4">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-1">
            Change Password
          </p>
          <DialogTitle className="text-lg font-black text-poli-navy">
            Update your password
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm font-semibold text-poli-body">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted pointer-events-none" />
              <Input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Enter new password"
                className="border border-poli-surface rounded-xl h-12 pl-10 pr-10 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-semibold text-poli-body">
              Confirm New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted pointer-events-none" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                className="border border-poli-surface rounded-xl h-12 pl-10 pr-10 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !formData.newPassword || !formData.confirmPassword}
            className="w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-poli-muted underline text-center py-1"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
