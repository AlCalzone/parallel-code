#!/usr/bin/env bash
# Copy showcase stills and the narrated introduction video to where they are shown:
# this README's screens/ and the landing page (pc-landing-page).
# Run after `npm run showcase:capture` and, for the video, `npm run yt -- render
# parallel-code-introduction` in yt-content-factory. Commits nothing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LANDING="${LANDING_REPO:-$ROOT/../pc-landing-page}"
YTF="${YTF_REPO:-$ROOT/../yt-content-factory}"
STILLS="$ROOT/.tmp/showcase"
# The phone still (1170 × 2532) does not fit either gallery.
SCENES=(overview focus diff-review change-tour reasoning mind-map)

for scene in "${SCENES[@]}"; do
  still="$STILLS/$scene.png"
  [[ -f "$still" ]] || { echo "Missing $still; run npm run showcase:capture" >&2; exit 1; }
  # showcase:capture builds the frontend first, so an older still is from a previous run.
  if [[ "$still" -ot "$ROOT/dist/index.html" ]]; then
    echo "$still predates the last build; rerun npm run showcase:capture" >&2
    exit 1
  fi
done

for scene in "${SCENES[@]}"; do
  cp "$STILLS/$scene.png" "$ROOT/screens/showcase-$scene.png"
  cp "$STILLS/$scene.png" "$LANDING/public/images/showcase-$scene.png"
  cwebp -quiet -q 80 "$STILLS/$scene.png" -o "$LANDING/public/images/showcase-$scene.webp"
done
echo "Stills -> screens/ and $LANDING/public/images/"

INTRO="$YTF/videos/parallel-code-introduction/out"
VIDEOS="$LANDING/public/videos"
if [[ -f "$INTRO/parallel-code-introduction.mp4" ]]; then
  cp "$INTRO/parallel-code-introduction.mp4" "$VIDEOS/"
  cp "$INTRO/thumbnail.jpg" "$VIDEOS/parallel-code-introduction.jpg"
  ffmpeg -v error -y -i "$INTRO/parallel-code-introduction.srt" -f webvtt \
    "$VIDEOS/parallel-code-introduction.vtt"
  echo "Intro video -> $VIDEOS/"
else
  echo "No rendered intro video in $INTRO; skipped" >&2
fi
