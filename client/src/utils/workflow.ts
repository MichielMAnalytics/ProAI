import dedent from 'dedent';

export const getWorkflowFiles = (content: string) => {
  try {
    // Parse the workflow data to validate it
    const workflowData = JSON.parse(content);
    
    // Convert the workflow data to a JavaScript object literal instead of a JSON string
    // This avoids all template literal conflicts
    const workflowDataString = JSON.stringify(workflowData, null, 2);
    
    return {
      'App.tsx': dedent`
        import React from 'react';
        import WorkflowVisualization from './components/ui/WorkflowVisualization';

        const workflowData = ${workflowDataString};

        export default function App() {
          return (
            <div className="p-4">
              <WorkflowVisualization data={JSON.stringify(workflowData)} />
            </div>
          );
        }
      `,
      '/components/ui/WorkflowVisualization.tsx': dedent`
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

        // Convert cron expression to human readable format
        const cronToHuman = (cron: string) => {
          if (!cron) return 'Not scheduled';
          
          const parts = cron.trim().split(' ');
          if (parts.length !== 5) return cron; // Invalid cron, return as is
          
          const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
          
          // Handle common patterns
          if (minute === '0' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const hourNum = parseInt(hour);
            const period = hourNum >= 12 ? 'PM' : 'AM';
            const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
            return \`Daily at \${displayHour}:00 \${period} UTC\`;
          }
          
          if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const hourNum = parseInt(hour);
            const minuteNum = parseInt(minute);
            const period = hourNum >= 12 ? 'PM' : 'AM';
            const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
            return \`Daily at \${displayHour}:\${minuteNum.toString().padStart(2, '0')} \${period} UTC\`;
          }
          
          return cron; // Fallback to original if we can't parse it
        };

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

            return \`\${baseColors[type] || baseColors.action} \${statusColors[status] || ''}\`;
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
              className={\`px-4 py-2 rounded-lg border-2 min-w-32 \${getNodeColor(data.type || 'action', data.status || 'pending')} \${
                selected ? 'ring-2 ring-blue-500' : ''
              }\`}
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
                    <div className="text-xs text-gray-600">{cronToHuman(data.config.schedule)}</div>
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

          // Filter out error handler steps and create a clean main flow
          const { mainFlowSteps, cleanedEdges } = useMemo(() => {
            const errorStepIds = workflowData.workflow.steps
              .filter(step => 
                step.name.toLowerCase().includes('error') || 
                step.name.toLowerCase().includes('handler') ||
                step.id.toLowerCase().includes('error')
              )
              .map(step => step.id);

            const mainSteps = workflowData.workflow.steps.filter(step => !errorStepIds.includes(step.id));
            
            // Only keep success edges between main flow steps
            const cleanEdges = workflowData.edges.filter(edge => 
              edge.type === 'success' && 
              !errorStepIds.includes(edge.source) && 
              !errorStepIds.includes(edge.target)
            );

            return { mainFlowSteps: mainSteps, cleanedEdges: cleanEdges };
          }, [workflowData]);

          // Create ReactFlow nodes with improved positioning
          const initialNodes: Node[] = useMemo(() => {
            const nodes: Node[] = [];

            // Add trigger node at the top center
            nodes.push({
              id: 'trigger',
              type: 'trigger',
              position: { x: 300, y: 50 },
              data: {
                type: workflowData.trigger.type,
                config: workflowData.trigger.config,
              },
              draggable: false,
            });

            // Create a clean vertical layout for main flow steps
            mainFlowSteps.forEach((step, index) => {
              const nodeData = workflowData.nodes.find(n => n.id === step.id);
              if (nodeData) {
                nodes.push({
                  id: step.id,
                  type: 'workflowStep',
                  position: { 
                    x: 250, // Fixed X position centered
                    y: 150 + (index * 120) // Vertical spacing of 120px
                  },
                  data: {
                    ...nodeData.data,
                    type: step.type || 'action',
                  },
                  draggable: false,
                });
              }
            });

            return nodes;
          }, [workflowData, mainFlowSteps]);

          // Create ReactFlow edges for clean main flow
          const initialEdges: Edge[] = useMemo(() => {
            const edges: Edge[] = [];

            // Connect trigger to first step if exists
            if (mainFlowSteps.length > 0) {
              const firstStep = mainFlowSteps[0];
              edges.push({
                id: 'trigger-to-first',
                source: 'trigger',
                target: firstStep.id,
                type: 'smoothstep',
                style: { stroke: '#6366f1', strokeWidth: 3 },
                markerEnd: {
                  type: 'arrowclosed',
                  width: 20,
                  height: 20,
                  color: '#6366f1',
                },
                animated: true,
              });
            }

            // Add success edges between main flow steps in sequence
            mainFlowSteps.forEach((step, index) => {
              if (index < mainFlowSteps.length - 1) {
                const nextStep = mainFlowSteps[index + 1];
                edges.push({
                  id: \`\${step.id}-to-\${nextStep.id}\`,
                  source: step.id,
                  target: nextStep.id,
                  type: 'smoothstep',
                  style: { stroke: '#10b981', strokeWidth: 3 },
                  markerEnd: {
                    type: 'arrowclosed',
                    width: 20,
                    height: 20,
                    color: '#10b981',
                  },
                  animated: true,
                  label: '✓',
                  labelStyle: {
                    fontSize: 12,
                    fontWeight: 'bold',
                    fill: '#10b981',
                  },
                });
              }
            });

            return edges;
          }, [mainFlowSteps]);

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
                  <span>Steps: {mainFlowSteps.length}</span>
                  <span>Trigger: {workflowData.trigger.type}</span>
                  {workflowData.trigger.config?.schedule && (
                    <span>Schedule: {cronToHuman(workflowData.trigger.config.schedule)}</span>
                  )}
                </div>
              </div>
              
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={onNodeClick}
                connectionMode={ConnectionMode.Strict}
                fitView
                fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
                attributionPosition="bottom-left"
                defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
              >
                <Background color="#f3f4f6" />
                <Controls />
              </ReactFlow>
            </div>
          );
        };

        export default WorkflowVisualization;
      `,
    };
  } catch (error) {
    console.error('Failed to parse workflow content:', error);
    return {
      'App.tsx': dedent`
        export default function App() {
          return (
            <div className="p-4 text-center">
              <h2 className="text-lg font-semibold text-red-600">Invalid Workflow Data</h2>
              <p className="text-sm text-gray-600">Unable to parse workflow visualization data</p>
            </div>
          );
        }
      `,
    };
  }
}; 