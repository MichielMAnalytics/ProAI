import * as Ariakit from '@ariakit/react';
import { matchSorter } from 'match-sorter';
import { Search, ChevronDown } from 'lucide-react';
import { useMemo, useState, useRef, memo, useEffect } from 'react';
import { SelectRenderer } from '@ariakit/react-core/select/select-renderer';
import type { OptionWithIcon } from '~/common';
import { cn } from '~/utils';

interface ControlComboboxProps {
  selectedValue: string;
  displayValue?: string;
  items: OptionWithIcon[];
  setValue: (value: string) => void;
  ariaLabel: string;
  searchPlaceholder?: string;
  selectPlaceholder?: string;
  isCollapsed: boolean;
  SelectIcon?: React.ReactNode;
  containerClassName?: string;
  iconClassName?: string;
  showCarat?: boolean;
  className?: string;
  disabled?: boolean;
  iconSide?: 'left' | 'right';
  selectId?: string;
  hideSearchWhenFewItems?: boolean;
}

const ROW_HEIGHT = 36;

function ControlCombobox({
  selectedValue,
  displayValue,
  items,
  setValue,
  ariaLabel,
  searchPlaceholder,
  selectPlaceholder,
  containerClassName,
  isCollapsed,
  SelectIcon,
  showCarat,
  className,
  disabled,
  iconClassName,
  iconSide = 'left',
  selectId,
  hideSearchWhenFewItems = false,
}: ControlComboboxProps) {
  const [searchValue, setSearchValue] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);

  // Determine if search should be shown
  const showSearch = !hideSearchWhenFewItems || items.length >= 5;

  const getItem = (option: OptionWithIcon) => ({
    id: `item-${option.value}`,
    value: option.value as string | undefined,
    label: option.label,
    icon: option.icon,
    disabled: (option as any).disabled || false,
  });

  const combobox = Ariakit.useComboboxStore({
    defaultItems: items.map(getItem),
    resetValueOnHide: true,
    value: searchValue,
    setValue: setSearchValue,
  });

  const select = Ariakit.useSelectStore({
    combobox,
    defaultItems: items.map(getItem),
    value: selectedValue,
    setValue,
  });

  const matches = useMemo(() => {
    const filteredItems = matchSorter(items, searchValue, {
      keys: ['value', 'label'],
      baseSort: (a, b) => (a.index < b.index ? -1 : 1),
    });
    return filteredItems.map(getItem);
  }, [searchValue, items]);

  useEffect(() => {
    if (buttonRef.current && !isCollapsed) {
      setButtonWidth(buttonRef.current.offsetWidth);
    }
  }, [isCollapsed]);

  // Calculate optimal dropdown width
  const dropdownWidth = useMemo(() => {
    if (isCollapsed) {
      return '300px';
    }

    // Calculate content-based width by finding the longest label
    const longestLabel = items.reduce((longest, item) => {
      const currentLabel = item.label || '';
      return currentLabel.length > longest.length ? currentLabel : longest;
    }, '');

    // Estimate width based on content: approximately 8px per character + padding for icon + margins
    const estimatedContentWidth = longestLabel.length * 8 + 60; // 60px for icon, padding, and margins

    // Use the larger of button width or content width, but cap at reasonable limits
    const minWidth = Math.max(buttonWidth ?? 300, 300); // At least 300px or button width
    const maxWidth = Math.min(500, window.innerWidth * 0.9); // Max 500px or 90% of viewport width
    const optimalWidth = Math.max(minWidth, Math.min(estimatedContentWidth, maxWidth));

    return `${optimalWidth}px`;
  }, [isCollapsed, items, buttonWidth]);

  const selectIconClassName = cn(
    'flex h-5 w-5 items-center justify-center overflow-hidden rounded-full',
    iconClassName,
  );
  const optionIconClassName = cn(
    'mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full',
    iconClassName,
  );

  return (
    <div className={cn('flex w-full items-center justify-center px-1', containerClassName)}>
      <Ariakit.SelectLabel store={select} className="sr-only">
        {ariaLabel}
      </Ariakit.SelectLabel>
      <Ariakit.Select
        ref={buttonRef}
        store={select}
        id={selectId}
        disabled={disabled}
        className={cn(
          'flex items-center justify-center gap-2 rounded-full bg-surface-secondary',
          'text-text-primary hover:bg-surface-tertiary',
          'border border-border-light',
          isCollapsed ? 'h-10 w-10' : 'h-10 w-full rounded-xl px-3 py-2 text-sm',
          className,
        )}
      >
        {SelectIcon != null && iconSide === 'left' && (
          <div className={selectIconClassName}>{SelectIcon}</div>
        )}
        {!isCollapsed && (
          <>
            <span className="flex-grow truncate text-left">
              {displayValue != null
                ? displayValue || selectPlaceholder
                : selectedValue || selectPlaceholder}
            </span>
            {SelectIcon != null && iconSide === 'right' && (
              <div className={selectIconClassName}>{SelectIcon}</div>
            )}
            {showCarat && <ChevronDown className="h-4 w-4 text-text-secondary" />}
          </>
        )}
      </Ariakit.Select>
      <Ariakit.SelectPopover
        store={select}
        gutter={4}
        portal
        className={cn(
          'animate-popover z-50 overflow-hidden rounded-xl border border-border-light bg-surface-secondary shadow-lg',
        )}
        style={{ width: dropdownWidth }}
      >
        {showSearch && (
          <div className="py-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-primary" />
              <Ariakit.Combobox
                store={combobox}
                autoSelect
                placeholder={searchPlaceholder}
                className="w-full rounded-md bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary focus:outline-none"
              />
            </div>
          </div>
        )}
        <div className="max-h-[300px] overflow-auto">
          <Ariakit.ComboboxList store={combobox}>
            <SelectRenderer store={select} items={matches} itemSize={ROW_HEIGHT} overscan={5}>
              {({ value, icon, label, disabled, ...item }) => (
                <Ariakit.ComboboxItem
                  key={item.id}
                  {...item}
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center px-3 text-sm',
                    disabled 
                      ? 'cursor-not-allowed text-text-secondary/50 opacity-60' 
                      : 'cursor-pointer text-text-primary hover:bg-surface-tertiary data-[active-item]:bg-surface-tertiary',
                  )}
                  render={<Ariakit.SelectItem value={disabled ? undefined : value} />}
                >
                  {icon != null && iconSide === 'left' && (
                    <div className={cn(optionIconClassName, disabled && 'opacity-50')}>{icon}</div>
                  )}
                  <span className="flex-grow truncate text-left">
                    {label}
                    {disabled && (
                      <span className="ml-2 text-xs font-medium text-text-secondary/70">
                        Coming Soon
                      </span>
                    )}
                  </span>
                  {icon != null && iconSide === 'right' && (
                    <div className={cn(optionIconClassName, disabled && 'opacity-50')}>{icon}</div>
                  )}
                </Ariakit.ComboboxItem>
              )}
            </SelectRenderer>
          </Ariakit.ComboboxList>
        </div>
      </Ariakit.SelectPopover>
    </div>
  );
}

export default memo(ControlCombobox);
