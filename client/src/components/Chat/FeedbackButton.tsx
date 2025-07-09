import { useState } from 'react';
import { useLocalize, useMediaQuery } from '~/hooks';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  conversationId?: string;
}

export default function FeedbackButton({ conversationId }: FeedbackButtonProps) {
  const localize = useLocalize();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  // Only show button if we have a valid conversation
  if (!conversationId || conversationId === 'new' || conversationId === 'search') {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowFeedbackModal(true)}
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-transparent text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 ${
          isSmallScreen ? 'size-10' : 'h-10 px-3'
        }`}
        aria-label="Send feedback"
      >
        <span className={isSmallScreen ? '' : 'mr-1'}>❤️</span>
        {!isSmallScreen && <span className="text-sm font-medium">FEEDBACK</span>}
      </button>
      <FeedbackModal
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        conversationId={conversationId}
      />
    </>
  );
}
