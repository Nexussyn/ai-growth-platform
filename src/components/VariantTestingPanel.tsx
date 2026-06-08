import { FlaskConical, Award } from 'lucide-react';
import { ExperimentVariant } from '../lib/types';

interface Props {
  variants: ExperimentVariant[];
  loading: boolean;
}

function getStatusBadgeColor(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'testing') return 'bg-blue-100 text-blue-800';
  if (status === 'retired') return 'bg-gray-100 text-gray-800';
  return 'bg-gray-100 text-gray-800';
}

export function VariantTestingPanel({ variants, loading }: Props) {
  const sortedVariants = [...variants].sort((a, b) => b.rpv - a.rpv);
  const bestVariant = sortedVariants.find((v) => v.status === 'active');
  const activeCount = variants.filter((v) => v.status === 'active').length;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="h-12 bg-gray-100 animate-pulse" />
        <div className="p-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
        <FlaskConical className="w-5 h-5 text-gray-700" />
        <h2 className="font-semibold text-gray-900">
          Variant Testing
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({activeCount} active)
          </span>
        </h2>
      </div>

      {sortedVariants.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No variants</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600">
                  Impressions
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600">
                  CVR%
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600">
                  RPV
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedVariants.map((variant) => (
                <tr key={variant.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {bestVariant?.id === variant.id && (
                        <Award className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="truncate max-w-xs text-sm font-medium text-gray-900">
                        {variant.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                        variant.status
                      )}`}
                    >
                      {variant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">
                    {variant.impressions.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">
                    {(variant.cvr * 100).toFixed(2)}%
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    ${variant.rpv.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
