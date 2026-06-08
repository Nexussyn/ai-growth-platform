import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
}

export function ErrorState({ message = 'Could not load data' }: ErrorStateProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-500 py-2">
      <AlertTriangle size={14} />
      <span>{message}</span>
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400">
      {icon && <div className="opacity-40">{icon}</div>}
      <span className="text-xs">{message}</span>
    </div>
  );
}
