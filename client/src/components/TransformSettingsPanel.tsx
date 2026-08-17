import type { TransformationIntensity, TransformationMode } from "@shared/transformations";

const INTENSITIES: { value: TransformationIntensity; label: string; description: string }[] = [
  { value: "low", label: "Low", description: "Mechanical edits and clear repairs" },
  { value: "standard", label: "Standard", description: "Balanced clarity and semantic polish" },
  { value: "high", label: "High", description: "Confident restructuring within safety bounds" },
];

export function TransformSettingsPanel({
  mode,
  intensity,
  onChange,
}: {
  mode: TransformationMode;
  intensity: TransformationIntensity;
  onChange: (intensity: TransformationIntensity) => void;
}) {
  return (
    <section className="terminal-panel intensity-panel" aria-label={`${mode} transformation intensity`}>
      <div className="terminal-panel-heading"><div><strong>{mode} intensity</strong><span>Applied to future transformations in this mode</span></div><span className="panel-status">semantic guard stays on</span></div>
      <div className="intensity-options" role="radiogroup" aria-label={`${mode} transformation intensity`}>
        {INTENSITIES.map(option => <button key={option.value} role="radio" aria-checked={intensity === option.value} className={intensity === option.value ? "intensity-option is-selected" : "intensity-option"} onClick={() => onChange(option.value)}><strong>{option.label}</strong><span>{option.description}</span></button>)}
      </div>
    </section>
  );
}
