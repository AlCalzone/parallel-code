---
name: update-screenshots
description: Recapture Parallel Code's screenshots and re-render its videos after a UI or theme change, then copy them to the README (screens/) and the landing page (../pc-landing-page). Use when the user asks to update/refresh screenshots, stills, the intro or keyboard video, or "all our media".
---

# Update screenshots and videos

Three repos take part; all are siblings of this one:

| Output                                  | Made by                                              | Shown in                                     |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Stills `.tmp/showcase/<scene>.png`      | `npm run showcase:capture` here (`scripts/showcase`) | `screens/showcase-*.png`, landing gallery    |
| Intro video `parallel-code-introduction` | `../yt-content-factory` (`yt render`)               | landing hero (`public/videos/`), YouTube     |
| Keyboard video `parallel-code-keyboard-workflow` | `../yt-content-factory` (`yt render`)        | YouTube only                                 |

The theme comes from one place: `darkThemePreset` in `scripts/showcase/demo-workspace.ts`. Both the stills and the videos use that harness, so they always match.

## Steps

1. **Stills.** `npm run showcase:capture` (builds the app, then runs every scene; a few minutes). → verify: open each of `.tmp/showcase/{overview,focus,diff-review,change-tour,reasoning,mind-map}.png` and check the theme, that no text is cut off, and that nothing private shows.
2. **Videos (only those the user asked for, or whose UI visibly changed).** In `../yt-content-factory`: `npm run yt -- render <slug>`, leaving `PC_REPO` unset so it uses this checkout (the `.tmp/parallel-code` copy in its README is stale). Follow that repo's `/render` skill for review. A scene that fails after a UI change needs fixing in its `scenes.spec.ts` or in `apps/parallel-code/src/ui.ts`. → verify: extract frames at a few timestamps (`ffmpeg -ss T -i out/<slug>.mp4 -frames:v 1 f.jpg`) and look at them.
3. **Copy.** `bash scripts/showcase/publish-media.sh`. It checks tools, paths and that every still is newer than the build and the harness before copying anything; it converts WebP, re-encodes the intro to 1080p and its captions to VTT. The landing page adds a content hash to these URLs (`versioned()` in `src/lib/assets.ts`), so no cache version needs bumping. → verify: `git status` here and in `../pc-landing-page` lists only the expected media.
4. **Commit** per repo (`docs(readme): …`, `content: …`, `feat(showcase): …`). Never upload or publish a video; YouTube changes go through the user via yt-content-factory's `/publish`; tell them which published videos are now out of date.

## Not covered

- `screens/ai-arena-mode.png` (landing page gallery) and the README GIFs (`longer-video.gif`, `best-video.gif`, `showcase.mp4`) have no scene yet. Say so when they look out of date; `yt gif` in yt-content-factory can make GIFs from a video.
