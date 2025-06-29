import React from 'react';
import DisplayUsernameMessages from './DisplayUsernameMessages';
import DeleteAccount from './DeleteAccount';
import Avatar from './Avatar';
import EnableTwoFactorItem from './TwoFactorAuthentication';
import BackupCodesItem from './BackupCodesItem';
import { useAuthContext } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';

function Account() {
  const user = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const accountItemsConfig = startupConfig?.interface?.settingsTabs?.accountItems || {
    displayUsername: true,
    avatar: true,
    twoFactorAuth: true,
    backupCodes: true,
    deleteAccount: true,
  };

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      {accountItemsConfig.displayUsername !== false && (
        <div className="pb-3">
          <DisplayUsernameMessages />
        </div>
      )}
      {accountItemsConfig.avatar !== false && (
        <div className="pb-3">
          <Avatar />
        </div>
      )}
      {user?.user?.provider === 'local' && accountItemsConfig.twoFactorAuth !== false && (
        <>
          <div className="pb-3">
            <EnableTwoFactorItem />
          </div>
          {user?.user?.twoFactorEnabled && accountItemsConfig.backupCodes !== false && (
            <div className="pb-3">
              <BackupCodesItem />
            </div>
          )}
        </>
      )}
      {accountItemsConfig.deleteAccount !== false && (
        <div className="pb-3">
          <DeleteAccount />
        </div>
      )}
    </div>
  );
}

export default React.memo(Account);
