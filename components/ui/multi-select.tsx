'use client';

import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  maxDisplay?: number;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Selecionar...',
  className,
  maxDisplay = 2,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((item) => item !== value));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedLabels = selected
    .map((value) => options.find((opt) => opt.value === value)?.label)
    .filter(Boolean) as string[];

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full justify-between min-h-[2.5rem] h-auto"
      >
        <div className="flex gap-1 flex-wrap flex-1 mr-2">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {selectedLabels.slice(0, maxDisplay).map((label, index) => (
                <Badge
                  key={selected[index]}
                  variant="secondary"
                  className="mr-1"
                >
                  {label}
                  <button
                    type="button"
                    className="ml-1 hover:text-foreground"
                    onClick={(e) => handleRemove(selected[index], e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedLabels.length > maxDisplay && (
                <Badge variant="secondary">
                  +{selectedLabels.length - maxDisplay}
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="hover:text-foreground text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
        </div>
      </Button>
      
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-64 overflow-auto">
          <div className="p-2 space-y-1">
            {options.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma opção disponível
              </div>
            ) : (
              options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center space-x-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onCheckedChange={() => handleToggle(option.value)}
                  />
                  <span className="text-sm flex-1">{option.label}</span>
                  {selected.includes(option.value) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
