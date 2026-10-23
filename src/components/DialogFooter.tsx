import { Show, type JSX } from 'solid-js';

interface DialogFooterProps {
  /** Shown beside the buttons in an always-present alert slot, so it never shifts them. */
  error?: string | null;
  /** Quiet text beside the buttons; takes the error slot's place. */
  note?: JSX.Element;
  /** Left-aligned action set apart from the main ones, e.g. Delete. */
  start?: JSX.Element;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}

/**
 * Action row for dialogs. Buttons inside use `btn-secondary`, `btn-primary`
 * or `btn-danger`; the footer gives them one size and look.
 */
export function DialogFooter(props: DialogFooterProps) {
  return (
    <div class="dialog-footer" style={props.style}>
      {props.start}
      <Show
        when={props.note}
        fallback={
          <span role="alert" class="dialog-footer-lead dialog-footer-error">
            {props.error}
          </span>
        }
      >
        <span class="dialog-footer-lead">{props.note}</span>
      </Show>
      {props.children}
    </div>
  );
}
