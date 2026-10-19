import './ConfigurationTabs.styles.css';

type Props = {
  id: string;
  label?: string;
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export function ConfigurationTabs({ id, label = 'Configuration sections', tabs, value, onChange }: Props) {
  return (
    <div className="configuration-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${id}-tab-${tab.id}`}
          aria-controls={`${id}-panel-${tab.id}`}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next].id);
            document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
