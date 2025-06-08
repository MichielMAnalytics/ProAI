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
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTimezone } from '~/hooks/useTimezone';
import { cronToHumanReadable } from '~/utils/timezone';

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
  const getNodeStyle = (type: string, status: string) => {
    const baseStyles = {
      action: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: '2px solid #5a67d8',
        color: 'white',
        icon: '⚙️'
      },
      condition: {
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        border: '2px solid #ed64a6',
        color: 'white',
        icon: '❓'
      },
      delay: {
        background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        border: '2px solid #38b2ac',
        color: '#2d3748',
        icon: '⏱️'
      },
      mcp_tool: {
        background: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
        border: '2px solid #9f7aea',
        color: '#2d3748',
        icon: '🔧'
      },
    };

    const statusOverrides = {
      running: {
        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.3), 0 10px 25px rgba(0, 0, 0, 0.15)',
        transform: 'scale(1.02)',
      },
      completed: {
        boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.3), 0 10px 25px rgba(0, 0, 0, 0.15)',
      },
      failed: {
        boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.3), 0 10px 25px rgba(0, 0, 0, 0.15)',
      },
      skipped: {
        opacity: '0.5',
        filter: 'grayscale(100%)',
      },
    };

    const baseStyle = baseStyles[type] || baseStyles.action;
    const statusStyle = statusOverrides[status] || {};

    return {
      ...baseStyle,
      ...statusStyle,
    };
  };

  const style = getNodeStyle(data.type || 'action', data.status || 'pending');

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: '#ffffff',
          border: '2px solid #e2e8f0',
          width: '12px',
          height: '12px',
        }}
      />
      
      <div
        className={`relative rounded-xl shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl min-w-64 ${
          selected ? 'ring-4 ring-blue-400 ring-opacity-60' : ''
      }`}
        style={{
          background: style.background,
          border: style.border,
          color: style.color,
          boxShadow: style.boxShadow || '0 8px 20px rgba(0, 0, 0, 0.12)',
          transform: style.transform || 'scale(1)',
          ...style,
        }}
      >
        <div className="px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-0.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
              {style.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base mb-1 leading-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                {data.label}
              </div>
          {data.config?.toolName && (
                <div className="text-sm opacity-90 mb-1 font-medium">
                  {data.config.toolName}
                </div>
          )}
          {data.config?.condition && (
                <div className="text-sm opacity-80 leading-snug">
                  <span className="font-medium">If:</span> {data.config.condition}
                </div>
          )}
          {data.config?.delayMs && (
                <div className="text-sm opacity-80 leading-snug">
                  <span className="font-medium">Wait:</span> {data.config.delayMs}ms
                </div>
          )}
        </div>
      </div>
    </div>
        
        {/* Status indicator */}
        {data.status && data.status !== 'pending' && (
          <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full border-2 border-white shadow-md">
            {data.status === 'running' && (
              <div className="w-full h-full bg-blue-500 rounded-full animate-pulse"></div>
            )}
            {data.status === 'completed' && (
              <div className="w-full h-full bg-green-500 rounded-full"></div>
            )}
            {data.status === 'failed' && (
              <div className="w-full h-full bg-red-500 rounded-full"></div>
            )}
            {data.status === 'skipped' && (
              <div className="w-full h-full bg-gray-400 rounded-full"></div>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: '#ffffff',
          border: '2px solid #e2e8f0',
          width: '12px',
          height: '12px',
        }}
      />
    </>
  );
};

// Custom node component for trigger
const TriggerNode = ({ data }: { data: any }) => {
  const { timezone } = useTimezone();
  
  const getTriggerStyle = (type: string) => {
    const styles = {
      manual: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: '2px solid #5a67d8',
        icon: '👤'
      },
      schedule: {
        background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        border: '2px solid #ed8936',
        icon: '📅'
      },
      webhook: {
        background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        border: '2px solid #38b2ac',
        icon: '🔗'
      },
      email: {
        background: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
        border: '2px solid #9f7aea',
        icon: '📧'
      },
      event: {
        background: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
        border: '2px solid #4299e1',
        icon: '⚡'
      },
    };

    return styles[type] || styles.manual;
  };

  const formatScheduleDisplay = (config: any) => {
    if (!config?.schedule) return null;
    
    // Use timezone-aware formatting
    const humanReadable = cronToHumanReadable(config.schedule, timezone);
    return humanReadable !== config.schedule ? humanReadable : `Cron: ${config.schedule}`;
  };

  const style = getTriggerStyle(data.type || 'manual');

  return (
    <>
      <div
        className="relative rounded-xl shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl min-w-56"
        style={{
          background: style.background,
          border: style.border,
          color: 'white',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div className="px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-0.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
              {style.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base mb-1 leading-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                Trigger
              </div>
              <div className="text-sm opacity-90 font-medium capitalize mb-1">
                {data.type || 'manual'}
              </div>
              {data.config?.schedule && (
                <div className="text-sm opacity-80 leading-snug">
                  {formatScheduleDisplay(data.config)}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Pulse effect for active triggers */}
        <div className="absolute inset-0 rounded-xl bg-white opacity-0 hover:opacity-10 transition-opacity duration-300"></div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: style.border.replace('2px solid ', ''),
          border: '2px solid #ffffff',
          width: '12px',
          height: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      />
    </>
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

  // Create ReactFlow nodes with organic, flowing layout
  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    // Add trigger node - starting point
    nodes.push({
      id: 'trigger',
      type: 'trigger',
      position: { x: 400, y: 50 },
      data: {
        type: workflowData.trigger.type,
        config: workflowData.trigger.config,
      },
      draggable: false,
    });

    // Create organic, flowing layout like n8n
    workflowData.nodes.forEach((node, index) => {
      // Create a flowing, organic pattern
      let x, y;
      
      if (index === 0) {
        // First node - slightly offset from trigger
        x = 300;
        y = 200;
      } else if (index === 1) {
        // Second node - create a flow to the right
        x = 500;
        y = 350;
      } else if (index === 2) {
        // Third node - flow back toward center-left
        x = 200;
        y = 500;
      } else {
        // Additional nodes - continue the flowing pattern
        const pattern = index % 4;
        switch (pattern) {
          case 0:
            x = 150 + (index * 50);
            y = 200 + (index * 120);
            break;
          case 1:
            x = 450 + (index * 30);
            y = 250 + (index * 100);
            break;
          case 2:
            x = 300 - (index * 20);
            y = 300 + (index * 110);
            break;
          default:
            x = 350 + (index * 40);
            y = 180 + (index * 130);
        }
      }

      nodes.push({
        id: node.id,
        type: 'workflowStep',
        position: { x, y },
        data: {
          ...node.data,
          type: workflowData.workflow.steps.find((s) => s.id === node.id)?.type || 'action',
        },
        draggable: false,
      });
    });

    return nodes;
  }, [workflowData]);

  // Create ReactFlow edges with smooth bezier curves
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    // Connect trigger to first step if exists
    if (workflowData.workflow.steps.length > 0) {
      const firstStep = workflowData.workflow.steps[0];
      edges.push({
        id: 'trigger-to-first',
        source: 'trigger',
        target: firstStep.id,
        type: 'default', // Use bezier curves for natural flow
        style: {
          stroke: '#9ca3af',
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed',
          width: 12,
          height: 12,
          color: '#9ca3af',
        },
      });
    }

    // Add edges from workflow data with smooth curves
    workflowData.edges.forEach((edge) => {
      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default', // Use bezier curves for natural flow
        style: {
          stroke: '#9ca3af',
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed',
          width: 12,
          height: 12,
          color: '#9ca3af',
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
    <div className="w-screen h-screen bg-gradient-to-br from-slate-50 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 p-6 border-b bg-white/90 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-2">{workflowData.workflow.name}</h2>
        {workflowData.workflow.description && (
          <p className="text-sm text-gray-600 mb-3 leading-relaxed">{workflowData.workflow.description}</p>
        )}
        <div className="flex gap-6 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <strong>{workflowData.workflow.steps.length}</strong> Steps
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <strong className="capitalize">{workflowData.trigger.type}</strong> Trigger
          </span>
        </div>
      </div>
      
      <div className="absolute inset-0 pt-32">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          connectionMode={ConnectionMode.Strict}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
          attributionPosition="bottom-left"
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        >
          <Background 
            color="#e2e8f0" 
            gap={24} 
            size={1}
            variant="dots"
          />
          <Controls 
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export default WorkflowVisualization; 