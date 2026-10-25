import { createUniqueId, type JSX } from 'solid-js';
import { sectionLabelStyle } from '../lib/theme';
import { sf } from '../lib/fontScale';

/**
 * Optional steps offered before merging, such as the change tour and the
 * review, as same-sized boxes side by side. What one of them opens, like the
 * review's result, goes below the row at full width.
 */
export function FollowUps(props: { children: JSX.Element; below?: JSX.Element }) {
  const headingId = createUniqueId();
  return (
    <section
      aria-labelledby={headingId}
      style={{ 'margin-bottom': '20px', 'font-size': sf(13), 'line-height': '1.45' }}
    >
      <h3 id={headingId} style={{ ...sectionLabelStyle, 'font-size': sf(11), margin: '0 0 6px' }}>
        Before you merge
      </h3>
      <div class="finish-followups">{props.children}</div>
      {props.below}
    </section>
  );
}
