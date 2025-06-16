import dedent from 'dedent';
import { cronToHumanReadable, getDetectedTimezone } from './timezone';

export const getWorkflowFiles = (content: string, toolsData: any[] = []) => {
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
    
    // Safely serialize tools data with the same escaping logic
    const safeToolsData = JSON.stringify(toolsData, (key, value) => {
      // If the value is a string that contains problematic characters, escape them
      if (typeof value === 'string' && (value.includes('`') || value.includes('${') || value.includes('\n') || value.includes('"'))) {
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
        
        // Tools data safely embedded
        const toolsData = ${safeToolsData};

        export default function App() {
          return (
            <div className="p-4">
              <WorkflowVisualization data={JSON.stringify(workflowData)} toolsData={toolsData} />
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
          toolsData: any[];
        }

        // Get user's timezone - fallback to browser detection if not available
        const getUserTimezone = () => {
          try {
            // Try to get from localStorage first (set by useTimezone hook)
            const storedTimezone = localStorage.getItem('timezone');
            if (storedTimezone) {
              const parsed = JSON.parse(storedTimezone);
              if (typeof parsed === 'string') return parsed;
            }
          } catch (error) {
            console.warn('Failed to get timezone from localStorage:', error);
          }
          
          // Fallback to browser detection
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
          } catch (error) {
            console.warn('Failed to detect timezone from browser:', error);
            return 'UTC'; // Ultimate fallback
          }
        };

        // Convert UTC time to user's timezone
        const convertTimeFromUTC = (hour: number, minute: number, userTimezone: string): { hour: number; minute: number } => {
          try {
            // Create a UTC date for today at the specified time
            const utcDate = new Date();
            utcDate.setUTCHours(hour, minute, 0, 0);
            
            // Convert to user's timezone
            const userTimeString = utcDate.toLocaleString('en-US', {
              timeZone: userTimezone,
              hour12: false,
              hour: '2-digit',
              minute: '2-digit'
            });
            
            const [userHour, userMinute] = userTimeString.split(':').map(Number);
            return { hour: userHour, minute: userMinute };
          } catch (error) {
            console.warn(\`Failed to convert time from UTC for timezone \${userTimezone}:\`, error);
            return { hour, minute }; // Return original if conversion fails
          }
        };

        // Convert cron expression to human readable format with timezone awareness
        const cronToHuman = (cron: string, userTimezone: string) => {
          if (!cron) return 'Not scheduled';
          
          const parts = cron.trim().split(' ');
          if (parts.length !== 5) return cron; // Invalid cron, return as is
          
          const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
          
          // Handle common patterns
          if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            // Daily at specific time - convert from UTC to user timezone
            const utcHour = parseInt(hour);
            const utcMinute = parseInt(minute);
            
            if (!isNaN(utcHour) && !isNaN(utcMinute)) {
              const { hour: localHour, minute: localMinute } = convertTimeFromUTC(utcHour, utcMinute, userTimezone);
              const period = localHour >= 12 ? 'PM' : 'AM';
              const displayHour = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
              return \`Daily at \${displayHour}:\${localMinute.toString().padStart(2, '0')} \${period}\`;
            }
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
          
          // Handle hour-based schedules
          if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const intervalHours = parseInt(hour.substring(2));
            return \`Every \${intervalHours} hours\`;
          }
          
          return cron; // Fallback to original if we can't parse it
        };

        // Custom node component for workflow steps
        const WorkflowStepNode = ({ data, selected, getToolIcon }: { data: any; selected: boolean; getToolIcon: (toolName: string) => { type: 'emoji' | 'image'; value: string; name?: string } }) => {
          const getNodeStyle = (type: string, status: string, toolName?: string) => {
            // Get dynamic icon based on tool name
            const toolIcon = toolName ? getToolIcon(toolName) : { type: 'emoji', value: '🤖' };
            
            const baseStyles = {
              mcp_agent_action: {
                background: 'white',
                border: '2px solid #e2e8f0',
                color: 'black',
                icon: toolIcon
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

            const baseStyle = baseStyles[type] || baseStyles.mcp_agent_action;
            const statusStyle = statusOverrides[status] || {};

            return {
              ...baseStyle,
              ...statusStyle,
            };
          };

          const style = getNodeStyle(data.type || 'mcp_agent_action', data.status || 'pending', data.config?.toolName);

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
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                      {style.icon.type === 'image' ? (
                        <img
                          src={style.icon.value}
                          alt={style.icon.name || 'Tool icon'}
                          className="w-8 h-8 rounded-md bg-white/90 object-contain"
                          onError={(e) => {
                            // Fallback to emoji if image fails to load
                            e.currentTarget.style.display = 'none';
                            const fallbackDiv = e.currentTarget.nextElementSibling;
                            if (fallbackDiv) {
                              fallbackDiv.style.display = 'block';
                            }
                          }}
                        />
                      ) : null}
                      <div 
                        className="text-2xl flex items-center justify-center" 
                        style={{ display: style.icon.type === 'emoji' ? 'flex' : 'none' }}
                      >
                        {style.icon.value}
                      </div>
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
                    {data.config?.instruction && (
                        <div className="text-sm opacity-80 leading-snug">
                          <span className="font-medium">Task:</span> {data.config.instruction.length > 60 ? data.config.instruction.substring(0, 60) + '...' : data.config.instruction}
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
                background: 'white',
                border: '2px solid #e2e8f0',
                icon: '👤'
              },
              schedule: {
                background: 'white',
                border: '2px solid #e2e8f0',
                icon: '📅'
              },
              webhook: {
                background: 'white',
                border: '2px solid #e2e8f0',
                icon: '🔗'
              },
              email: {
                background: 'white',
                border: '2px solid #e2e8f0',
                icon: '📧'
              },
              event: {
                background: 'white',
                border: '2px solid #e2e8f0',
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
                  color: 'black',
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
                          {cronToHuman(data.config.schedule, getUserTimezone())}
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

        const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({ data, toolsData }) => {
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

          // Create tool lookup function using embedded tools data
          const getToolIcon = useCallback((toolName: string) => {
            if (!toolsData || !toolName) {
              return { type: 'emoji', value: '🤖' };
            }
            
            const tool = toolsData.find(t => t.name === toolName || t.pluginKey === toolName);
            if (tool?.icon) {
              return { type: 'image', value: tool.icon, name: tool.name };
            }
            
            // Fallback to default robot emoji
            return { type: 'emoji', value: '🤖' };
          }, [toolsData]);

          // Define node types with access to getToolIcon
          const nodeTypes: NodeTypes = useMemo(() => ({
            workflowStep: (props) => <WorkflowStepNode {...props} getToolIcon={getToolIcon} />,
            trigger: TriggerNode,
          }), [getToolIcon]);

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

            // Create organic, flowing layout like n8n
            sortedMainNodes.forEach((node, index) => {
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
                  type: node.type || 'mcp_agent_action',
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
              // Find the first step (step_1)
              const firstStep = workflowData.workflow.steps.find(step => step.id === 'step_1');
              if (firstStep) {
                edges.push({
                  id: 'trigger-to-first',
                  source: 'trigger',
                  target: firstStep.id,
                  sourceHandle: null,
                  targetHandle: null,
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
            }

            // Filter edges to show only main flow (success connections between main steps)
            const mainFlowEdges = workflowData.edges.filter(edge => {
              const isSuccess = edge.type === 'success';
              const sourceIsMain = !edge.source.includes('error') && !edge.source.includes('success');
              const targetIsMain = !edge.target.includes('error') && !edge.target.includes('success');
              
              // Only show success connections between main workflow steps
              return isSuccess && sourceIsMain && targetIsMain;
            });

            // Convert filtered edges to ReactFlow format with smooth curves
            mainFlowEdges.forEach(edge => {
              edges.push({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: null,
                targetHandle: null,
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
            <div className="w-screen h-screen relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 z-10 p-4 border-b border-white/10 bg-transparent backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-white">{workflowData.workflow.name}</h2>
                {workflowData.workflow.description && (
                  <p className="text-sm text-white mt-1" style={{ opacity: 0.8 }}>{workflowData.workflow.description}</p>
                )}
                <div className="flex gap-4 mt-2 text-xs text-white" style={{ opacity: 0.7 }}>
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
                    <span>Schedule: {cronToHuman(workflowData.trigger.config.schedule, getUserTimezone())}</span>
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

                  <Controls position="top-left" style={{ top: '50%', transform: 'translateY(-50%)' }} />
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