import {
  type BooleanControlSpec,
  type ColorControlSpec,
  type ColorListControlSpec,
  CustomBackgroundFilter,
  type CustomBackgroundControlSpec,
  type NumberControlSpec,
  customBackgroundFilterControls,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { PlusIcon, XIcon } from "lucide-react";
import { type CSSProperties, useId, useMemo } from "react";

import { cn } from "~/lib/utils";
import { ThemeColorPicker } from "../settings/ThemeColorPicker";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

const decodeFilter = Schema.decodeUnknownSync(CustomBackgroundFilter);

function withParam(
  filter: CustomBackgroundFilter,
  key: string,
  value: unknown,
): CustomBackgroundFilter | null {
  try {
    return decodeFilter({ ...filter, [key]: value });
  } catch {
    return null;
  }
}

const SELECT_LABELS: Readonly<Record<string, string>> = {
  linesIrregular: "Irregular lines",
  "2x2": "2×2 Bayer",
  "4x4": "4×4 Bayer",
  "8x8": "8×8 Bayer",
};

function optionLabel(option: string): string {
  const known = SELECT_LABELS[option];
  if (known) return known;
  return option.charAt(0).toUpperCase() + option.slice(1);
}

function formatNumber(value: number, spec: NumberControlSpec): string {
  if (spec.integer) return String(Math.round(value));
  const decimals = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : spec.step >= 0.01 ? 2 : 3;
  return value.toFixed(decimals);
}

export function RangeControl({
  id,
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  id?: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const ratio = max === min ? 0 : (value - min) / (max - min);
  const style = {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={inputId} className="w-28 shrink-0 truncate text-[13px] text-muted-foreground">
        {label}
      </label>
      <input
        aria-label={label}
        className="settings-slider min-w-0 flex-1"
        id={inputId}
        max={max}
        min={min}
        step={step}
        style={style}
        type="range"
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      <output
        className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={inputId}
      >
        {format(value)}
      </output>
    </div>
  );
}

function BooleanControl({
  spec,
  value,
  onChange,
}: {
  spec: BooleanControlSpec;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-28 shrink-0 truncate text-[13px] text-muted-foreground">
        {spec.label}
      </label>
      <Switch id={id} size="sm" checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-0.5 pr-2 pl-0.5">
      <ThemeColorPicker label={label} value={value} onChange={onChange} />
      <span className="max-w-24 truncate text-xs text-muted-foreground">{label}</span>
      {onRemove ? (
        <Button
          size="icon-micro"
          variant="ghost-muted"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}

function ColorListControl({
  spec,
  value,
  onChange,
}: {
  spec: ColorListControlSpec;
  value: ReadonlyArray<string>;
  onChange: (value: ReadonlyArray<string>) => void;
}) {
  return (
    <>
      {value.map((color, index) => (
        <ColorSwatch
          // Colors repeat, so the slot is the identity.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          label={`Color ${index + 1}`}
          value={color}
          onChange={(next) => onChange(value.map((entry, at) => (at === index ? next : entry)))}
          onRemove={
            value.length > spec.min
              ? () => onChange(value.filter((_, at) => at !== index))
              : undefined
          }
        />
      ))}
      {value.length < spec.max ? (
        <Button
          size="xs"
          variant="ghost-muted"
          className="rounded-full"
          onClick={() => onChange([...value, value[value.length - 1] ?? "#888888"])}
        >
          <PlusIcon />
          Add color
        </Button>
      ) : null}
    </>
  );
}

function isColorSpec(
  spec: CustomBackgroundControlSpec,
): spec is ColorControlSpec | ColorListControlSpec {
  return spec.kind === "color" || spec.kind === "colors";
}

export function BackgroundControls({
  filter,
  onChange,
  className,
}: {
  filter: CustomBackgroundFilter;
  onChange: (filter: CustomBackgroundFilter) => void;
  className?: string;
}) {
  const controls = useMemo(
    () => (filter.kind === "none" ? {} : customBackgroundFilterControls(filter.kind)),
    [filter.kind],
  );
  const entries = Object.entries(controls);
  const colorEntries = entries.filter(([, spec]) => isColorSpec(spec));
  const otherEntries = entries.filter(([, spec]) => !isColorSpec(spec));
  const palettesHidden =
    "originalColors" in filter && typeof filter.originalColors === "boolean"
      ? filter.originalColors
      : false;

  const set = (key: string, value: unknown) => {
    const next = withParam(filter, key, value);
    if (next) onChange(next);
  };

  if (filter.kind === "none") return null;

  return (
    <div className={cn("space-y-3", className)}>
      {otherEntries.map(([key, spec]) => {
        const current: unknown = Reflect.get(filter, key);
        switch (spec.kind) {
          case "number":
            return (
              <RangeControl
                key={key}
                label={spec.label}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                format={(value) => formatNumber(value, spec)}
                value={typeof current === "number" ? current : spec.default}
                onChange={(value) => set(key, value)}
              />
            );
          case "select":
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[13px] text-muted-foreground">
                  {spec.label}
                </span>
                <Select
                  value={typeof current === "string" ? current : spec.default}
                  onValueChange={(value) => {
                    if (typeof value === "string") set(key, value);
                  }}
                >
                  <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={spec.label}>
                    <SelectValue>
                      {optionLabel(typeof current === "string" ? current : spec.default)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {spec.options.map((option) => (
                      <SelectItem key={option} hideIndicator value={option}>
                        {optionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            );
          case "boolean":
            return (
              <BooleanControl
                key={key}
                spec={spec}
                value={typeof current === "boolean" ? current : spec.default}
                onChange={(value) => set(key, value)}
              />
            );
          default:
            return null;
        }
      })}
      {colorEntries.length > 0 && !palettesHidden ? (
        <div className="flex items-start gap-3">
          <span className="w-28 shrink-0 pt-1 text-[13px] text-muted-foreground">Colors</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {colorEntries.map(([key, spec]) => {
              const current: unknown = Reflect.get(filter, key);
              if (spec.kind === "color") {
                return (
                  <ColorSwatch
                    key={key}
                    label={spec.label}
                    value={typeof current === "string" ? current : spec.default}
                    onChange={(value) => set(key, value)}
                  />
                );
              }
              if (spec.kind === "colors") {
                return (
                  <ColorListControl
                    key={key}
                    spec={spec}
                    value={
                      Array.isArray(current) && current.every((c) => typeof c === "string")
                        ? current
                        : spec.default
                    }
                    onChange={(value) => set(key, value)}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
