import React from 'react';
import { useOAuthTimezone } from '~/hooks';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const { ensureTimezoneForOAuth } = useOAuthTimezone();

  if (!enabled) {
    return null;
  }

  const handleOAuthClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Get timezone and add it to the OAuth URL
    const timezone = ensureTimezoneForOAuth();
    const oauthUrl = new URL(`${serverDomain}/oauth/${oauthPath}`, window.location.origin);
    oauthUrl.searchParams.set('timezone', timezone);
    
    // Navigate to OAuth URL with timezone parameter
    window.location.href = oauthUrl.toString();
  };

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
        href={`${serverDomain}/oauth/${oauthPath}`}
        onClick={handleOAuthClick}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
