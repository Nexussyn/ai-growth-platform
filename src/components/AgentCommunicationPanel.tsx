import { MessageSquare, ArrowRight, CheckCircle2, XCircle, Clock, BarChart3 } from 'lucide-react';
import { useAgentMessages, useAgentTasks, useAgentEvents, useAgentStats } from '../lib/hooks';
import { useState } from 'react';

type Tab = 'messages' | 'tasks' | 'events' | 'stats';

export function AgentCommunicationPanel() {
  const [tab, setTab] = useState<Tab>('events');
  const { data: msgData } = useAgentMessages();
  const { data: taskData } = useAgentTasks();
  const { data: eventData } = useAgentEvents();
  const { data: statsData } = useAgentStats();

  const messages = msgData?.messages ?? [];
  const tasks = taskData?.tasks ?? [];
  const events = eventData?.events ?? [];
  const stats = statsData?.agent_stats ?? {};

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'events', label: 'Events', count: events.length },
    { key: 'tasks', label: 'Tasks', count: tasks.length },
    { key: 'messages', label: 'Messages', count: messages.length },
    { key: 'stats', label: 'Stats', count: Object.keys(stats).length },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900">Agent Communication Bus</h3>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            Live
          </span>
        </div>
        <span className="text-xs text-gray-400">10s refresh</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 text-gray-400">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {tab === 'events' && <EventsFeed events={events} />}
        {tab === 'tasks' && <TasksList tasks={tasks} />}
        {tab === 'messages' && <MessagesList messages={messages} />}
        {tab === 'stats' && <StatsView stats={stats} />}
      </div>
    </div>
  );
}

function EventsFeed({ events }: { events: Array<{ id: string; agent_id: string; event_type: string; payload: Record<string, unknown>; created_at: string }> }) {
  if (events.length === 0) {
    return <div className="p-6 text-center text-xs text-gray-400">No events yet. Agents will emit events as they work.</div>;
  }

  return (
    <div className="divide-y divide-gray-50">
      {events.slice(0, 30).map((ev) => (
        <div key={ev.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getEventColor(ev.event_type)}`} />
          <span className="text-xs font-mono text-gray-700 w-20 flex-shrink-0 truncate">{ev.agent_id}</span>
          <span className="text-xs text-gray-500 flex-1 truncate">{ev.event_type}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(ev.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function TasksList({ tasks }: { tasks: Array<{ id: string; agent_id: string; task_type: string; description: string; status: string; created_at: string }> }) {
  if (tasks.length === 0) {
    return <div className="p-6 text-center text-xs text-gray-400">No tasks in queue.</div>;
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case 'completed': return <CheckCircle2 size={12} className="text-emerald-500" />;
      case 'failed': return <XCircle size={12} className="text-red-500" />;
      case 'running': return <Clock size={12} className="text-blue-500 animate-pulse" />;
      default: return <Clock size={12} className="text-gray-400" />;
    }
  };

  return (
    <div className="divide-y divide-gray-50">
      {tasks.slice(0, 25).map((t) => (
        <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          {statusIcon(t.status)}
          <span className="text-xs font-mono text-gray-700 w-20 flex-shrink-0 truncate">{t.agent_id}</span>
          <span className="text-xs text-gray-600 flex-1 truncate">{t.task_type}: {t.description}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            t.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
            t.status === 'failed' ? 'bg-red-50 text-red-700' :
            t.status === 'running' ? 'bg-blue-50 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>{t.status}</span>
        </div>
      ))}
    </div>
  );
}

function MessagesList({ messages }: { messages: Array<{ id: string; from_agent: string; to_agent: string; message_type: string; subject: string; priority: string; created_at: string }> }) {
  if (messages.length === 0) {
    return <div className="p-6 text-center text-xs text-gray-400">No inter-agent messages yet.</div>;
  }

  return (
    <div className="divide-y divide-gray-50">
      {messages.slice(0, 20).map((m) => (
        <div key={m.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-gray-700">{m.from_agent}</span>
            <ArrowRight size={10} className="text-gray-400" />
            <span className="font-mono text-gray-700">{m.to_agent}</span>
            {m.priority === 'high' || m.priority === 'critical' ? (
              <span className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{m.priority}</span>
            ) : null}
            <span className="text-gray-400 ml-auto">{formatTime(m.created_at)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{m.subject || m.message_type}</p>
        </div>
      ))}
    </div>
  );
}

function StatsView({ stats }: { stats: Record<string, { total: number; completed: number; failed: number; running: number; cost: number; revenue: number; avg_duration: number }> }) {
  const entries = Object.entries(stats);
  if (entries.length === 0) {
    return <div className="p-6 text-center text-xs text-gray-400">No agent stats available yet.</div>;
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-3">
        {entries.map(([agent, s]) => {
          const successRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
          return (
            <div key={agent} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-semibold text-gray-800">{agent}</span>
                <span className="text-xs text-gray-500">{s.total} tasks</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <BarChart3 size={10} />
                  {successRate}% success
                </span>
                <span className="text-gray-500">{s.running} running</span>
                {s.failed > 0 && <span className="text-red-500">{s.failed} failed</span>}
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getEventColor(type: string): string {
  switch (type) {
    case 'task_complete': return 'bg-emerald-400';
    case 'task_fail': return 'bg-red-400';
    case 'task_queued':
    case 'task_start': return 'bg-blue-400';
    case 'state_change': return 'bg-amber-400';
    case 'message_sent': return 'bg-cyan-400';
    default: return 'bg-gray-400';
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}
