import { CloseIcon } from './icons';

/** Icon-only close button for a dialog header, with a 28px hit area. */
export function DialogCloseButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="dialog-close"
      aria-label={props.label}
      onClick={() => props.onClick()}
    >
      <CloseIcon size={14} />
    </button>
  );
}
