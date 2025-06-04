import React, { useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface WorkflowData {
  workflow: {
    id: string;
    name: string;
    description?: string;
    trigger: {
      type: string;
      config: Record<string, any>;
    };
    steps: Array<{
      id: string;
      name: string;
      type: string;
      config: Record<string, any>;
      position: { x: number; y: number };
      onSuccess?: string;
      onFailure?: string;
    }>;
  };
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      label: string;
      config: Record<string, any>;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: 'success' | 'failure';
  }>;
  trigger: {
    type: string;
    config: Record<string, any>;
  };
}

interface WorkflowVisualizationProps {
  data: string;
}

// Custom node component for workflow steps
const WorkflowStepNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const getNodeColor = (type: string, status: string) => {
    const baseColors = {
      action: 'bg-blue-100 border-blue-300',
      condition: 'bg-yellow-100 border-yellow-300',
      delay: 'bg-purple-100 border-purple-300',
      mcp_tool: 'bg-green-100 border-green-300',
    };

    const statusColors = {
      pending: 'opacity-60',
      running: 'ring-2 ring-blue-400 animate-pulse',
      completed: 'ring-2 ring-green-400',
      failed: 'ring-2 ring-red-400',
      skipped: 'opacity-40',
    };

    return `${baseColors[type] || baseColors.action} ${statusColors[status] || ''}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'action': return '⚙️';
      case 'condition': return '❓';
      case 'delay': return '⏱️';
      case 'mcp_tool': return '🔧';
      default: return '📝';
    }
  };

  return (
    <div
      className={`px-4 py-2 rounded-lg border-2 min-w-32 ${getNodeColor(data.type || 'action', data.status || 'pending')} ${
        selected ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{getIcon(data.type || 'action')}</span>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          {data.config?.toolName && (
            <div className="text-xs text-gray-600">{data.config.toolName}</div>
          )}
          {data.config?.condition && (
            <div className="text-xs text-gray-600">If: {data.config.condition}</div>
          )}
          {data.config?.delayMs && (
            <div className="text-xs text-gray-600">Wait: {data.config.delayMs}ms</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Custom node component for trigger
const TriggerNode = ({ data }: { data: any }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'manual': return '👤';
      case 'schedule': return '📅';
      case 'webhook': return '🔗';
      case 'email': return '📧';
      case 'event': return '⚡';
      default: return '🚀';
    }
  };

  return (
    <div className="px-4 py-2 rounded-lg border-2 bg-gray-100 border-gray-300 min-w-32">
      <div className="flex items-center gap-2">
        <span className="text-lg">{getIcon(data.type || 'manual')}</span>
        <div>
          <div className="font-medium text-sm">Trigger</div>
          <div className="text-xs text-gray-600">{data.type || 'manual'}</div>
          {data.config?.schedule && (
            <div className="text-xs text-gray-600">Cron: {data.config.schedule}</div>
          )}
        </div>
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  workflowStep: WorkflowStepNode,
  trigger: TriggerNode,
};

const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({ data }) => {
  const workflowData: WorkflowData = useMemo(() => {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse workflow data:', error);
      return {
        workflow: { id: '', name: 'Invalid Workflow', trigger: { type: 'manual', config: {} }, steps: [] },
        nodes: [],
        edges: [],
        trigger: { type: 'manual', config: {} }
      };
    }
  }, [data]);

  // Create ReactFlow nodes
  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    // Add trigger node
    nodes.push({
      id: 'trigger',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: {
        type: workflowData.trigger.type,
        config: workflowData.trigger.config,
      },
      draggable: false,
    });

    // Add step nodes
    workflowData.nodes.forEach((node) => {
      nodes.push({
        id: node.id,
        type: 'workflowStep',
        position: node.position,
        data: {
          ...node.data,
          type: workflowData.workflow.steps.find(s => s.id === node.id)?.type || 'action',
        },
        draggable: false,
      });
    });

    return nodes;
  }, [workflowData]);

  // Create ReactFlow edges
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    // Connect trigger to first step if exists
    if (workflowData.workflow.steps.length > 0) {
      const firstStep = workflowData.workflow.steps[0];
      edges.push({
        id: 'trigger-to-first',
        source: 'trigger',
        target: firstStep.id,
        type: 'default',
        style: { stroke: '#374151', strokeWidth: 2 },
      });
    }

    // Add edges from workflow data
    workflowData.edges.forEach((edge) => {
      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
        style: {
          stroke: edge.type === 'success' ? '#10b981' : '#ef4444',
          strokeWidth: 2,
        },
        label: edge.type === 'success' ? '✓' : '✗',
        labelStyle: {
          fontSize: 12,
          fontWeight: 'bold',
        },
      });
    });

    return edges;
  }, [workflowData]);

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    console.log('Node clicked:', node);
    // Future: Could open a detail panel or edit modal
  }, []);

  if (!workflowData.workflow?.name) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium">Invalid Workflow Data</div>
          <div className="text-sm">Unable to parse workflow visualization data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-96">
      <div className="mb-4 p-4 border-b">
        <h2 className="text-lg font-semibold">{workflowData.workflow.name}</h2>
        {workflowData.workflow.description && (
          <p className="text-sm text-gray-600 mt-1">{workflowData.workflow.description}</p>
        )}
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span>Steps: {workflowData.workflow.steps.length}</span>
          <span>Trigger: {workflowData.trigger.type}</span>
        </div>
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Strict}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default WorkflowVisualization; 