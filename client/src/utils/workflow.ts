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
                className={\`relative rounded-xl shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl min-w-64 \${
                  selected ? 'ring-4 ring-blue-400 ring-opacity-60' : ''
                }\`}
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
                          {cronToHuman(data.config.schedule)}
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

          // Create ReactFlow nodes from the provided nodes array
          const initialNodes: Node[] = useMemo(() => {
            const nodes: Node[] = [];

            // Add trigger node at the top center - better positioned
            nodes.push({
              id: 'trigger',
              type: 'trigger',
              position: { x: 200, y: 60 }, // More centered positioning
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

            // Position main flow steps vertically in the center - better centered
            sortedMainNodes.forEach((node, index) => {
              nodes.push({
                id: node.id,
                type: 'workflowStep',
                position: { 
                  x: 150, // More centered horizontally
                  y: 200 + (index * 180) // Increased spacing to 180px for better visual hierarchy
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
                  type: 'straight', // Changed to straight for clean vertical alignment
                  style: { 
                    stroke: '#6366f1', 
                    strokeWidth: 3,
                    strokeDasharray: '0',
                  },
                  markerEnd: {
                    type: 'arrowclosed',
                    width: 24,
                    height: 24,
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

            // Convert filtered edges to ReactFlow format - clean professional style
            mainFlowEdges.forEach(edge => {
              edges.push({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: null,
                targetHandle: null,
                type: 'straight', // Changed to straight for clean lines
                style: { 
                  stroke: '#22c55e', 
                  strokeWidth: 3,
                  strokeDasharray: '0',
                },
                markerEnd: {
                  type: 'arrowclosed',
                  width: 24,
                  height: 24,
                  color: '#22c55e',
                },
                // Removed label for cleaner professional look
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
            <div className="w-screen h-screen relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 z-10 p-4 border-b bg-white/90 backdrop-blur-sm">
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
              
              <div className="absolute inset-0 pt-24">
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