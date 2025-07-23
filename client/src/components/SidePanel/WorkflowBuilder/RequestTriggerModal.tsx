import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { useAuthContext } from '~/hooks';
import { useToastContext } from '~/Providers';

interface RequestTriggerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RequestTriggerModal: React.FC<RequestTriggerModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!appName.trim()) {
      showToast({
        message: 'Please enter the app name',
        status: 'error',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/enterprise-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          feedbackType: 'general',
          additionalInfo: `App Trigger Request\n\nApp: ${appName}\n\nDescription: ${description}`,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit request');
      }

      showToast({
        message: 'Thank you for your request! We will review it and get back to you.',
        status: 'success',
      });

      setAppName('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting request:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to submit request',
        status: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setAppName('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Request App Trigger</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
          <div>
            <label htmlFor="app-name" className="mb-2 block text-sm font-medium text-text-primary">
              App Name *
            </label>
            <input
              id="app-name"
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g., Slack, Notion, GitHub"
              className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-text-primary"
            >
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what trigger you need and how you'd like to use it..."
              rows={4}
              className="w-full resize-none rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !appName.trim()}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RequestTriggerModal;