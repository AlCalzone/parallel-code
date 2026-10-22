import { For } from 'solid-js';
import { PASTEL_HUES } from '../store/store';
import { sectionLabelStyle, theme } from '../lib/theme';
import { colorFromHue } from './project-settings-form';

/** Swatches for the project's hue; the selected one is ringed. */
export function ProjectColorPicker(props: { hue: number; onChange: (hue: number) => void }) {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
      <span style={sectionLabelStyle}>Color</span>
      <div
        role="group"
        aria-label="Color"
        style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}
      >
        <For each={PASTEL_HUES}>
          {(hue) => {
            const isSelected = () => props.hue === hue;
            return (
              <button
                type="button"
                aria-label={`Hue ${hue}`}
                aria-pressed={isSelected()}
                onClick={() => props.onChange(hue)}
                style={{
                  width: '24px',
                  height: '24px',
                  // Matches ProjectSwatch: the picker previews the
                  // square mark the project will actually show.
                  'border-radius': 'var(--radius-sm)',
                  background: colorFromHue(hue),
                  border: isSelected() ? `2px solid ${theme.fg}` : '2px solid transparent',
                  outline: isSelected() ? `2px solid ${theme.accent}` : 'none',
                  'outline-offset': '1px',
                  cursor: 'pointer',
                  padding: '0',
                  'flex-shrink': '0',
                }}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
}
