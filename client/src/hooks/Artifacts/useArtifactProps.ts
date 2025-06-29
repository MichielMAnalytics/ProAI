import { useMemo } from 'react';
import { removeNullishValues, EModelEndpoint } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { getKey, getProps, getTemplate, getArtifactFilename } from '~/utils/artifacts';
import { getMermaidFiles } from '~/utils/mermaid';
import { getWorkflowFiles } from '~/utils/workflow';
import { useAvailableToolsQuery } from '~/data-provider';

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  // Fetch tools data for workflow artifacts
  const { data: availableTools } = useAvailableToolsQuery(EModelEndpoint.agents, {
    enabled: artifact.type?.includes('workflow') ?? false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const [fileKey, files] = useMemo(() => {
    const key = getKey(artifact.type ?? '', artifact.language);

    if (key.includes('mermaid')) {
      return ['App.tsx', getMermaidFiles(artifact.content ?? '')];
    }

    if (key.includes('workflow')) {
      return ['App.tsx', getWorkflowFiles(artifact.content ?? '', availableTools || [])];
    }

    const fileKey = getArtifactFilename(artifact.type ?? '', artifact.language);
    const files = removeNullishValues({
      [fileKey]: artifact.content,
    });
    return [fileKey, files];
  }, [artifact.type, artifact.content, artifact.language, availableTools]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  return {
    files,
    fileKey,
    template,
    sharedProps,
  };
}
