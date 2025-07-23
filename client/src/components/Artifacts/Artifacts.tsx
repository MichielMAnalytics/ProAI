import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import { useEditorContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import ArtifactTabs from './ArtifactTabs';
import { CopyCodeButton } from './Code';
import store from '~/store';
import { TooltipAnchor } from '~/components/ui/Tooltip';

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const setArtifactRefreshFunction = useSetRecoilState(store.artifactRefreshFunction);

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client != null) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  // Store refresh function reference in Recoil store so it can be called externally
  useEffect(() => {
    setArtifactRefreshFunction(() => handleRefresh);
    return () => setArtifactRefreshFunction(null); // Cleanup on unmount
  }, [setArtifactRefreshFunction]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const {
    activeTab,
    isMermaid,
    setActiveTab,
    currentIndex,
    isSubmitting,
    cycleArtifact,
    currentArtifact,
    orderedArtifactIds,
  } = useArtifacts();

  if (currentArtifact === null || currentArtifact === undefined) {
    return null;
  }

  const closeArtifacts = () => {
    setIsVisible(false);
    setTimeout(() => setArtifactsVisible(false), 300);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      {/* Main Parent - Full screen overlay on mobile only, normal container on desktop */}
      <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
        {/* Main Container - Full width on mobile, full height on desktop */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out sm:border ${
            isVisible ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-0 blur-sm'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
            {/* Left: Back button */}
            <TooltipAnchor description="Close artifacts" side="bottom">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8"
                onClick={closeArtifacts}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </TooltipAnchor>

            {/* Center: Title */}
            <div className="flex-1 text-center">
              <h2 className="text-base font-semibold text-text-primary sm:text-lg">Artifacts</h2>
            </div>

            {/* Right: Close button */}
            <TooltipAnchor description="Close artifacts" side="bottom">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8"
                onClick={closeArtifacts}
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipAnchor>
          </div>
          {/* Content */}
          <div className="relative flex-1 overflow-hidden">
            <ArtifactTabs
              isMermaid={isMermaid}
              artifact={currentArtifact}
              isSubmitting={isSubmitting}
              editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
              previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
            />
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border-medium bg-surface-primary-alt p-2 text-sm text-text-secondary sm:p-3">
            <div className="flex items-center">
              <button onClick={() => cycleArtifact('prev')} className="mr-2 text-text-secondary">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs">{`${currentIndex + 1} / ${
                orderedArtifactIds.length
              }`}</span>
              <button onClick={() => cycleArtifact('next')} className="ml-2 text-text-secondary">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Refresh button - Moved from Header */}
              <TooltipAnchor description="Refresh" side="top">
                <button
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8 ${
                    isRefreshing ? 'animate-pulse' : ''
                  }`}
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              </TooltipAnchor>
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
