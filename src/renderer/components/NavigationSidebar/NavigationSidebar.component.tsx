import { Disc3, ListMusic, Music2, PanelLeftClose, PanelLeftOpen, Radio, Settings } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import type { PageName } from '../../App.types';
import { useSidebarWidth } from './hooks/useSidebarWidth';

import './NavigationSidebar.styles.css';

const navigation = [
  { id: 'songs', name: 'All songs', icon: Music2 },
  { id: 'albums', name: 'Albums', icon: Disc3 },
  { id: 'playlists', name: 'Playlists', icon: ListMusic },
  { id: 'stations', name: 'News bucket', icon: Radio },
] as const;

function SidebarButton({
  label,
  icon,
  compact,
  active,
  onClick,
  toggle = false,
  className = '',
}: {
  label: string;
  icon: ReactNode;
  compact: boolean;
  active?: boolean;
  onClick: () => void;
  toggle?: boolean;
  className?: string;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tooltip = compact || toggle;

  useEffect(() => {
    if (!hovered || !tooltip || dismissed) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [hovered, tooltip, dismissed]);

  return (
    <div
      className={`sidebar-item${hovered ? ' is-hovered' : ''}`}
      onPointerEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        className={`${toggle ? 'sidebar-toggle icon-button' : 'sidebar-nav-button'}${active ? ' active' : ''} ${className}`.trim()}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        aria-expanded={toggle ? !compact : undefined}
        aria-controls={toggle ? 'sidebar-navigation' : undefined}
        aria-describedby={tooltip && !dismissed ? id : undefined}
        onClick={onClick}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        {icon}
        {!toggle && <span className="sidebar-label">{label}</span>}
      </button>
      {tooltip && !dismissed && (
        <span id={id} className="sidebar-tooltip" role="tooltip">
          {label}
        </span>
      )}
    </div>
  );
}

export function NavigationSidebar({ page, navigate }: { page: PageName; navigate: (page: PageName) => void }) {
  const sidebar = useSidebarWidth();

  return (
    <aside
      id="navigation-sidebar"
      className={`sidebar${sidebar.compact ? ' is-compact' : ''}${sidebar.resizing ? ' is-resizing' : ''}`}
      aria-label="Sidebar"
    >
      <div className="traffic-light-space" />
      <div className="sidebar-heading">
        <div className="wordmark">onmywave.fm</div>
        <SidebarButton
          label={sidebar.compact ? 'Expand sidebar' : 'Collapse sidebar'}
          icon={
            sidebar.compact ? (
              <PanelLeftOpen size={20} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={20} aria-hidden="true" />
            )
          }
          compact={sidebar.compact}
          toggle
          onClick={sidebar.toggle}
        />
      </div>
      <nav id="sidebar-navigation" aria-label="Main navigation">
        {navigation.map((item) => (
          <SidebarButton
            key={item.id}
            label={item.name}
            icon={<item.icon size={21} strokeWidth={1.7} aria-hidden="true" />}
            compact={sidebar.compact}
            active={page === item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
      </nav>
      <div className="sidebar-bottom">
        <SidebarButton
          label="Settings"
          className="settings-nav"
          icon={<Settings size={20} strokeWidth={1.7} aria-hidden="true" />}
          compact={sidebar.compact}
          active={page === 'settings'}
          onClick={() => navigate('settings')}
        />
      </div>
      <div className={`sidebar-resize-handle${sidebar.hovered ? ' is-hovered' : ''}`} {...sidebar.separatorProps} />
    </aside>
  );
}
