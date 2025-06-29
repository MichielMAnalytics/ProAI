import * as Ariakit from '@ariakit/react';
import { useMemo, useEffect, useState, useRef } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { OGDialog, OGDialogTitle, OGDialogContent, OGDialogTrigger } from '~/components/ui';
import { useUpdateAgentPermissionsMutation, useUpdateAgentMutation } from '~/data-provider';
import { Button, Switch, DropdownPopup, Textarea } from '~/components/ui';
import { useLocalize, useAuthContext } from '~/hooks';
import { useToastContext } from '~/Providers';

type FormValues = Record<Permissions, boolean>;

type LabelControllerProps = {
  label: string;
  agentPerm: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
};

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  agentPerm,
  label,
  getValues,
  setValue,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <button
      className="cursor-pointer select-none"
      type="button"
      onClick={() =>
        setValue(agentPerm, !getValues(agentPerm), {
          shouldDirty: true,
        })
      }
      tabIndex={0}
    >
      {label}
    </button>
    <Controller
      name={agentPerm}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value}
          onCheckedChange={field.onChange}
          value={field.value.toString()}
        />
      )}
    />
  </div>
);

interface AdminSettingsProps {
  agent?: {
    id?: string;
    default_prompts?: string[];
  };
}

const AdminSettings = ({ agent }: AdminSettingsProps) => {
  const localize = useLocalize();
  const { user, roles } = useAuthContext();
  const { showToast } = useToastContext();
  const currentAgentIdRef = useRef<string | undefined>(undefined);
  const { mutate, isLoading } = useUpdateAgentPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  const updateAgentMutation = useUpdateAgentMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<SystemRoles>(SystemRoles.USER);
  const [defaultPrompts, setDefaultPrompts] = useState<string[]>(['', '', '', '', '', '']);

  const defaultValues = useMemo(() => {
    if (roles?.[selectedRole]?.permissions) {
      return roles[selectedRole].permissions[PermissionTypes.AGENTS];
    }
    return roleDefaults[selectedRole].permissions[PermissionTypes.AGENTS];
  }, [roles, selectedRole]);

  const {
    reset,
    control,
    setValue,
    getValues,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues,
  });

  useEffect(() => {
    if (roles?.[selectedRole]?.permissions?.[PermissionTypes.AGENTS]) {
      reset(roles[selectedRole].permissions[PermissionTypes.AGENTS]);
    } else {
      reset(roleDefaults[selectedRole].permissions[PermissionTypes.AGENTS]);
    }
  }, [roles, selectedRole, reset]);

  // Update default prompts when agent changes
  useEffect(() => {
    // Only reset prompts if we switch to a different agent
    if (agent?.id !== currentAgentIdRef.current) {
      currentAgentIdRef.current = agent?.id;
      if (agent?.default_prompts) {
        setDefaultPrompts([
          ...agent.default_prompts,
          ...Array(6 - agent.default_prompts.length).fill(''),
        ]);
      } else {
        setDefaultPrompts(['', '', '', '', '', '']);
      }
    }
  }, [agent]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData = [
    {
      agentPerm: Permissions.SHARED_GLOBAL,
      label: localize('com_ui_agents_allow_share_global'),
    },
    {
      agentPerm: Permissions.CREATE,
      label: localize('com_ui_agents_allow_create'),
    },
    {
      agentPerm: Permissions.USE,
      label: localize('com_ui_agents_allow_use'),
    },
  ];

  const onSubmit = (data: FormValues) => {
    mutate({ roleName: selectedRole, updates: data });
  };

  const handleDefaultPromptsUpdate = () => {
    if (!agent?.id) {
      showToast({ status: 'error', message: 'No agent selected' });
      return;
    }

    const filteredPrompts = defaultPrompts.filter((prompt) => prompt.trim() !== '');
    updateAgentMutation.mutate({
      agent_id: agent.id,
      data: {
        default_prompts: filteredPrompts,
      },
    });
  };

  const handlePromptChange = (index: number, value: string) => {
    const newPrompts = [...defaultPrompts];
    newPrompts[index] = value;
    setDefaultPrompts(newPrompts);
  };

  const roleDropdownItems = [
    {
      label: SystemRoles.USER,
      onClick: () => {
        setSelectedRole(SystemRoles.USER);
      },
    },
    {
      label: SystemRoles.ADMIN,
      onClick: () => {
        setSelectedRole(SystemRoles.ADMIN);
      },
    },
  ];

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <Button
          size={'sm'}
          variant={'outline'}
          className="btn btn-neutral border-token-border-light relative h-9 w-full gap-1 rounded-lg font-medium"
        >
          <ShieldEllipsis className="cursor-pointer" aria-hidden="true" />
          {localize('com_ui_admin_settings')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="max-h-[80vh] w-96 overflow-y-auto border-border-light bg-surface-primary text-text-primary">
        <OGDialogTitle>{`${localize('com_ui_admin_settings')} - ${localize(
          'com_ui_agents',
        )}`}</OGDialogTitle>
        <div className="p-2">
          {/* Role selection dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-medium">{localize('com_ui_role_select')}:</span>
            <DropdownPopup
              unmountOnHide={true}
              menuId="role-dropdown"
              isOpen={isRoleMenuOpen}
              setIsOpen={setIsRoleMenuOpen}
              trigger={
                <Ariakit.MenuButton className="inline-flex w-1/4 items-center justify-center rounded-lg border border-border-light bg-transparent px-2 py-1 text-text-primary transition-all ease-in-out hover:bg-surface-tertiary">
                  {selectedRole}
                </Ariakit.MenuButton>
              }
              items={roleDropdownItems}
              itemClassName="items-center justify-center"
              sameWidth={true}
            />
          </div>
          {/* Permissions form */}
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="py-5">
              {labelControllerData.map(({ agentPerm, label }) => (
                <div key={agentPerm}>
                  <LabelController
                    control={control}
                    agentPerm={agentPerm}
                    label={label}
                    getValues={getValues}
                    setValue={setValue}
                  />
                  {selectedRole === SystemRoles.ADMIN && agentPerm === Permissions.USE && (
                    <>
                      <div className="mb-2 max-w-full whitespace-normal break-words text-sm text-red-600">
                        <span>{localize('com_ui_admin_access_warning')}</span>
                        {'\n'}
                        <a
                          href="https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/interface"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 underline"
                        >
                          {localize('com_ui_more_info')}
                        </a>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
              >
                {localize('com_ui_save')}
              </button>
            </div>
          </form>

          {/* Default Prompts Section */}
          {agent?.id && (
            <>
              <hr className="my-6 border-border-light" />
              <div className="py-2">
                <h3 className="mb-4 text-lg font-semibold text-text-primary">
                  Agent Default Prompts
                </h3>
                <p className="mb-4 text-sm text-text-secondary">
                  Configure default prompts that will appear as suggestion cards under the chat
                  input when users start new conversations with this agent and have connected the
                  required integrations.
                </p>
                <div className="space-y-3">
                  {defaultPrompts.map((prompt, index) => (
                    <div key={index}>
                      <label className="mb-1 block text-sm font-medium text-text-primary">
                        Default Prompt {index + 1}
                      </label>
                      <Textarea
                        value={prompt}
                        onChange={(e) => handlePromptChange(index, e.target.value)}
                        placeholder={`e.g., Create a workflow that runs every morning and fetches my latest Strava activity to email my coach...`}
                        className="w-full resize-none border-border-light bg-surface-primary text-text-primary"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDefaultPromptsUpdate}
                    disabled={updateAgentMutation.isLoading}
                    className="btn rounded bg-blue-500 font-bold text-white transition-all hover:bg-blue-600 disabled:opacity-50"
                  >
                    {updateAgentMutation.isLoading ? 'Saving...' : 'Save Default Prompts'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default AdminSettings;
