import React from 'react';

// Minimal type definition for compatibility
type TFeedback = any;

interface FeedbackProps {
  handleFeedback?: ({ feedback }: { feedback: TFeedback | undefined }) => void;
  feedback?: TFeedback;
  isLast?: boolean;
}

// Disabled feedback component - not used in this fork
const Feedback: React.FC<FeedbackProps> = () => {
  return null;
};

export default Feedback;
