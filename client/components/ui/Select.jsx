'use client';

import { forwardRef, useId, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from '@/components/icons';

export const Select = forwardRef(
  function Select({
    className,
    options = [],
    value,
    onChange,
    placeholder = 'Select...',
    searchable = false,
    disabled = false,
    name,
    ...props
  }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const selectRef = useRef(null);
    const listboxRef = useRef(null);
    const id = useId();

    const filteredOptions = options.filter(opt =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.value.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightedIndex(0);
          } else if (highlightedIndex < filteredOptions.length - 1) {
            setHighlightedIndex(highlightedIndex + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen && highlightedIndex > 0) {
            setHighlightedIndex(highlightedIndex - 1);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            onChange?.(filteredOptions[highlightedIndex].value);
            setIsOpen(false);
            setSearchQuery('');
            setHighlightedIndex(-1);
          } else {
            setIsOpen(!isOpen);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
          break;
        case 'Tab':
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
          break;
      }
    };

    const handleOptionClick = (optionValue) => {
      onChange?.(optionValue);
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
      selectRef.current?.focus();
    };

    const handleClear = (e) => {
      e.stopPropagation();
      onChange?.('');
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
    };

    const handleClickOutside = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    useEffect(() => {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
      if (listboxRef.current && highlightedIndex >= 0) {
        const option = listboxRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
        option?.scrollIntoView({ block: 'nearest' });
      }
    }, [highlightedIndex]);

    const selectedOption = options.find(opt => opt.value === value);

    return (
      <div
        ref={selectRef}
        className={cn('relative w-full', className)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border border-border/80 bg-background px-3 py-2 text-left text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:bg-raised/50',
            value ? 'text-foreground' : 'text-muted'
          )}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? `${id}-listbox` : undefined}
        >
          <span className="flex-1 truncate">
            {value ? selectedOption?.label : placeholder}
          </span>
          {value && !disabled && (
            <span
              className="ml-2 flex h-5 w-5 items-center justify-center rounded hover:bg-raised/50 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleClear(e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClear(e);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
            >
              <XIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {isOpen ? <ChevronUpIcon className="h-4 w-4 text-muted flex-shrink-0" /> : <ChevronDownIcon className="h-4 w-4 text-muted flex-shrink-0" />}
        </button>

        {isOpen && (
          <div className="fixed z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border/80 bg-background shadow-lg">
            {searchable && (
              <div className="relative p-2 border-b border-border/60">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  className="w-full rounded-md border border-border/80 bg-background pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            )}
            <ul
              ref={listboxRef}
              id={`${id}-listbox`}
              role="listbox"
              aria-label={placeholder}
              className="py-1"
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted text-center">No options found</li>
              ) : (
                filteredOptions.map((option, index) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    data-index={index}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer',
                      option.value === value
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'hover:bg-raised/50 text-foreground',
                      index === highlightedIndex && 'bg-raised/50'
                    )}
                    onClick={() => handleOptionClick(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {option.label}
                    {option.description && (
                      <span className="ml-2 text-xs text-muted/70">{option.description}</span>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <input
          type="hidden"
          name={name}
          value={value || ''}
          readOnly
        />
      </div>
    );
  }
);

Select.displayName = 'Select';