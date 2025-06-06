import dedent from 'dedent';

export const getWorkflowFiles = (content: string) => {
  try {
    // Parse the workflow data to validate it
    const workflowData = JSON.parse(content);
    
    // Safely serialize the workflow data by properly escaping it
    // Use a more robust approach to avoid template literal and quote conflicts
    const safeWorkflowData = JSON.stringify(workflowData, (key, value) => {
      // If the value is a string that contains code, ensure it's properly escaped
      if (typeof value === 'string' && (value.includes('`') || value.includes('${') || value.includes('\n'))) {
        // Replace problematic characters to make it safe for JSON embedding
        return value
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/`/g, '\\`')    // Escape backticks
          .replace(/\${/g, '\\${') // Escape template literal expressions
          .replace(/"/g, '\\"')    // Escape double quotes
          .replace(/\n/g, '\\n')   // Escape newlines
          .replace(/\r/g, '\\r')   // Escape carriage returns
          .replace(/\t/g, '\\t');  // Escape tabs
      }
      return value;
    }, 2);
    
    return {
      'App.tsx': dedent`
        import React from 'react';
        import WorkflowVisualization from './components/ui/WorkflowVisualization';

        // Workflow data safely embedded
        const workflowData = ${safeWorkflowData};

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
          Handle,
          Position,
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
            return \`Daily at \${displayHour}:00 \${period}\`;
          }
          
          if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const hourNum = parseInt(hour);
            const minuteNum = parseInt(minute);
            const period = hourNum >= 12 ? 'PM' : 'AM';
            const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
            return \`Daily at \${displayHour}:\${minuteNum.toString().padStart(2, '0')} \${period}\`;
          }
          
          // Handle minute-based schedules
          if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const intervalMinutes = parseInt(minute.substring(2));
            if (intervalMinutes === 1) {
              return 'Every minute';
            } else if (intervalMinutes < 60) {
              return \`Every \${intervalMinutes} minutes\`;
            }
          }
          
          // Handle hourly schedules
          if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            return 'Every hour';
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
            <>
              {/* Connection handles for edges */}
              <Handle
                type="target"
                position={Position.Top}
                style={{ background: '#555' }}
              />
              <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: '#555' }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id="failure"
                style={{ background: '#ef4444' }}
              />
              
              <div
                className={\`px-4 py-2 rounded-lg border-2 min-w-64 \${getNodeColor(data.type || 'action', data.status || 'pending')} \${
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
            </>
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
            <>
              {/* Connection handle for trigger */}
              <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: '#6366f1' }}
              />
              
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

          // Create ReactFlow nodes from the provided nodes array
          const initialNodes: Node[] = useMemo(() => {
            const nodes: Node[] = [];

            // Add trigger node at the top center
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

            // Filter out error and success handler nodes for cleaner visualization
            const mainFlowNodes = workflowData.nodes.filter(node => {
              const isErrorNode = node.data.label.toLowerCase().includes('error') || 
                                 node.data.label.toLowerCase().includes('handler') ||
                                 node.id.toLowerCase().includes('error');
              const isSuccessNode = node.data.label.toLowerCase().includes('success') ||
                                   node.id.toLowerCase().includes('success');
              
              // Only show main workflow steps
              return !isErrorNode && !isSuccessNode;
            });

            // Sort main flow nodes by their original X position to maintain order
            const sortedMainNodes = [...mainFlowNodes].sort((a, b) => a.position.x - b.position.x);

            // Position main flow steps vertically in the center
            sortedMainNodes.forEach((node, index) => {
              nodes.push({
                id: node.id,
                type: 'workflowStep',
                position: { 
                  x: 350, // Center horizontally
                  y: 150 + (index * 120) // Stack vertically with 120px spacing
                },
                data: {
                  ...node.data,
                  type: node.type || 'action',
                },
                draggable: false,
              });
            });

            return nodes;
          }, [workflowData]);

          // Create ReactFlow edges - show only main flow connections
          const initialEdges: Edge[] = useMemo(() => {
            const edges: Edge[] = [];

            // Connect trigger to first step if exists
            if (workflowData.workflow.steps.length > 0) {
              // Find the first step (step_1)
              const firstStep = workflowData.workflow.steps.find(step => step.id === 'step_1');
              if (firstStep) {
                edges.push({
                  id: 'trigger-to-first',
                  source: 'trigger',
                  target: firstStep.id,
                  sourceHandle: null,
                  targetHandle: null,
                  type: 'straight',
                  style: { stroke: '#6366f1', strokeWidth: 2 },
                  markerEnd: {
                    type: 'arrowclosed',
                    width: 20,
                    height: 20,
                    color: '#6366f1',
                  },
                });
              }
            }

            // Filter edges to show only main flow (success connections between main steps)
            const mainFlowEdges = workflowData.edges.filter(edge => {
              const isSuccess = edge.type === 'success';
              const sourceIsMain = !edge.source.includes('error') && !edge.source.includes('success');
              const targetIsMain = !edge.target.includes('error') && !edge.target.includes('success');
              
              // Only show success connections between main workflow steps
              return isSuccess && sourceIsMain && targetIsMain;
            });

            // Convert filtered edges to ReactFlow format
            mainFlowEdges.forEach(edge => {
              edges.push({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: null,
                targetHandle: null,
                type: 'straight',
                style: { 
                  stroke: '#10b981', 
                  strokeWidth: 2
                },
                markerEnd: {
                  type: 'arrowclosed',
                  width: 20,
                  height: 20,
                  color: '#10b981',
                },
                label: '✓',
                labelStyle: {
                  fontSize: 12,
                  fontWeight: 'bold',
                  fill: '#10b981',
                  backgroundColor: 'white',
                  padding: '2px 4px',
                  borderRadius: '4px',
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
                  <span>Steps: {workflowData.workflow.steps.filter(step => {
                    const isErrorStep = step.name.toLowerCase().includes('error') || 
                                       step.name.toLowerCase().includes('handler') ||
                                       step.id.toLowerCase().includes('error');
                    const isSuccessStep = step.name.toLowerCase().includes('success') ||
                                         step.id.toLowerCase().includes('success');
                    return !isErrorStep && !isSuccessStep;
                  }).length}</span>
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