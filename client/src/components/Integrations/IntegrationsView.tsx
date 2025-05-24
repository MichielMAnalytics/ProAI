import { useLocalize } from '~/hooks';

export default function IntegrationsView() {
  const localize = useLocalize();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-surface-primary">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">
          {localize('com_ui_integrations')}
        </h1>
        <p className="text-text-secondary">
          {localize('com_ui_integrations_coming_soon')}
        </p>
      </div>
    </div>
  );
} 