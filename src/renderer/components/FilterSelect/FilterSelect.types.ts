export type FilterSelectProps = {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  searchable?: boolean;
  allowCustom?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

export type Choice = { value: string; label: string };
