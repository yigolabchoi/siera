import { ReactNode } from 'react';
import Card from './Card';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  iconColor?: string;
  className?: string;
  onClick?: () => void;
}

const StatCard = ({ icon, label, value, unit = '', iconColor = 'text-slate-600', className = '', onClick }: StatCardProps) => {
  return (
    <Card
      className={`!p-3 sm:!p-4 ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-primary-200 transition-all' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-slate-600 truncate">{label}</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-900">
            {value}{unit && <span className="text-xs sm:text-base font-medium ml-0.5">{unit}</span>}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default StatCard;
