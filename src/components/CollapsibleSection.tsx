/**
 * A panel section that can be folded away, so the Develop panel stays manageable on
 * an iPad. Which sections are open is remembered in this browser.
 */
import { useState, type ReactNode } from 'react';

const STORAGE_KEY = 'chitra.openSections';

function readOpenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOpenSection(id: string, open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOpenSections(), [id]: open }));
  } catch {
    // Private browsing or storage disabled: the section just won't be remembered.
  }
}

interface CollapsibleSectionProps {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** Marks the title when the section's settings differ from the defaults. */
  changed?: boolean;
  /** Extra controls on the title row (shown only while open). */
  actions?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  changed = false,
  actions,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => readOpenSections()[id] ?? defaultOpen);
  return (
    <section className="panel-section collapsible" aria-label={title}>
      <div className="collapsible-header">
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={`section-${id}`}
          onClick={() => {
            setOpen(!open);
            saveOpenSection(id, !open);
          }}
        >
          <span className="collapsible-arrow" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="section-title">{title}</span>
          {changed && <span className="collapsible-dot" title="Changed" aria-label="changed" />}
        </button>
        {open && actions}
      </div>
      {open && (
        <div id={`section-${id}`} className="collapsible-body">
          {children}
        </div>
      )}
    </section>
  );
}
