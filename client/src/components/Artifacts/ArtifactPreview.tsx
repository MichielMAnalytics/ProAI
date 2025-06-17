import React, { memo, useMemo } from 'react';
import {
  SandpackPreview,
  SandpackProvider,
  SandpackProviderProps,
} from '@codesandbox/sandpack-react/unstyled';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { TStartupConfig } from 'librechat-data-provider';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';
import SandpackErrorBoundary from './SandpackErrorBoundary';

export const ArtifactPreview = memo(function ({
  files,
  fileKey,
  template,
  sharedProps,
  previewRef,
  currentCode,
  startupConfig,
}: {
  files: ArtifactFiles;
  fileKey: string;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  currentCode?: string;
  startupConfig?: TStartupConfig;
}) {
  const artifactFiles = useMemo(() => {
    if (Object.keys(files).length === 0) {
      return files;
    }
    const code = currentCode ?? '';
    if (!code) {
      return files;
    }
    return {
      ...files,
      [fileKey]: {
        code,
      },
    };
  }, [currentCode, files, fileKey]);

  const options: typeof sharedOptions = useMemo(() => {
    if (!startupConfig) {
      return {
        ...sharedOptions,
        // Add timeout configuration for better reliability
        bundlerTimeOut: 60000, // 60 seconds
        autoReload: false,
      };
    }
    const _options: typeof sharedOptions = {
      ...sharedOptions,
      bundlerURL: template === 'static' ? startupConfig.staticBundlerURL : startupConfig.bundlerURL,
      // Add enhanced timeout configuration
      bundlerTimeOut: 60000,
      autoReload: false,
    };

    return _options;
  }, [startupConfig, template]);

  if (Object.keys(artifactFiles).length === 0) {
    return null;
  }

  return (
    <SandpackErrorBoundary>
      <SandpackProvider
        files={{
          ...artifactFiles,
          ...sharedFiles,
        }}
        options={options}
        {...sharedProps}
        template={template}
      >
        <SandpackPreview
          showOpenInCodeSandbox={false}
          showRefreshButton={false}
          tabIndex={0}
          ref={previewRef}
          showNavigator={false}
          showSandpackErrorOverlay={true}
        />
      </SandpackProvider>
    </SandpackErrorBoundary>
  );
});
