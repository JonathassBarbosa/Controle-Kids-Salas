"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Seletor simples reutilizado no registro e na gestão. `optionLabels` permite
// mostrar um rótulo diferente do valor (ex.: value=roomId, label=nome da sala).
export function Choice({
  label,
  value,
  onChange,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <label className="field">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((v) => (
            <SelectItem key={v} value={v}>
              {optionLabels?.[v] ?? v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
