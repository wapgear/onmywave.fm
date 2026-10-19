export type ConfigurationTabsProps = {
  id: string;
  label?: string;
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};
