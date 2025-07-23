import { useRecoilState } from 'recoil';
import { atom } from 'recoil';

// Define the atom for workflow builder state
const workflowBuilderOpenAtom = atom<boolean>({
  key: 'workflowBuilderOpen',
  default: false,
});

// Define the atom for the current workflow ID being edited
const workflowBuilderWorkflowIdAtom = atom<string | undefined>({
  key: 'workflowBuilderWorkflowId',
  default: undefined,
});

export const useWorkflowBuilder = () => {
  const [isOpen, setIsOpen] = useRecoilState(workflowBuilderOpenAtom);
  const [workflowId, setWorkflowId] = useRecoilState(workflowBuilderWorkflowIdAtom);

  const openWorkflowBuilder = (editWorkflowId?: string) => {
    setWorkflowId(editWorkflowId);
    setIsOpen(true);
  };

  const closeWorkflowBuilder = () => {
    setIsOpen(false);
    setWorkflowId(undefined); // Clear workflow ID when closing
  };

  return {
    isOpen,
    workflowId,
    openWorkflowBuilder,
    closeWorkflowBuilder,
  };
};
