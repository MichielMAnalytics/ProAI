import { useState } from 'react';
import { useAuthContext } from '~/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { useToastContext } from '~/Providers';

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export default function FeedbackModal({ open, onOpenChange, conversationId }: FeedbackModalProps) {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!feedback.trim()) {
      showToast({
        message: 'Please enter your feedback',
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
          additionalInfo: feedback,
          conversationId,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit feedback');
      }

      showToast({
        message: 'Thank you for your feedback!',
        status: 'success',
      });

      setFeedback('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to submit feedback',
        status: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFeedback('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div>
            <label htmlFor="feedback" className="mb-2 block text-sm font-medium text-text-primary">
              🔧 Your feedback will help us improve the product. 
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us what you think..."
              rows={5}
              className="w-full resize-none rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !feedback.trim()}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}