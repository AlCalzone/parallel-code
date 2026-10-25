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
INTRO="$YTF/videos/parallel-code-introduction/out"
VIDEOS="$LANDING/public/videos"
# The phone still (1170 × 2532) does not fit either gallery.
SCENES=(overview focus diff-review change-tour reasoning mind-map)

fail() { echo "$1" >&2; exit 1; }

# Check everything before copying anything, so a failure leaves no half-updated set.
for tool in cwebp ffmpeg; do
  command -v "$tool" >/dev/null || fail "$tool is not installed"
done
[[ -d "$LANDING/public/images" ]] || fail "No landing page at $LANDING (set LANDING_REPO)"
[[ -f "$ROOT/dist/index.html" ]] || fail "No build; run npm run showcase:capture"
# A still older than the build or the harness (which seeds the theme) is from a previous run.
newest="$(find "$ROOT/dist/index.html" "$ROOT/scripts/showcase" \( -name '*.ts' -o -name index.html \) \
  -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
for scene in "${SCENES[@]}"; do
  still="$STILLS/$scene.png"
  [[ -f "$still" ]] || fail "Missing $still; run npm run showcase:capture"
  [[ "$still" -nt "$newest" ]] || fail "$still predates $newest; rerun npm run showcase:capture"
done
intro=false
if [[ -f "$INTRO/parallel-code-introduction.mp4" ]]; then
  for file in thumbnail.jpg parallel-code-introduction.srt; do
    [[ -f "$INTRO/$file" ]] || fail "Missing $INTRO/$file; rerun yt render"
  done
  intro=true
fi

for scene in "${SCENES[@]}"; do
  cp "$STILLS/$scene.png" "$ROOT/screens/showcase-$scene.png"
  cp "$STILLS/$scene.png" "$LANDING/public/images/showcase-$scene.png"
  cwebp -quiet -q 80 "$STILLS/$scene.png" -o "$LANDING/public/images/showcase-$scene.webp"
done
echo "Stills -> screens/ and $LANDING/public/images/"

if $intro; then
  # The render is 1440p for YouTube; the hero plays at most 1080p, at half the size.
  ffmpeg -v error -y -i "$INTRO/parallel-code-introduction.mp4" -vf scale=1920:-2 \
    -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart \
    "$VIDEOS/parallel-code-introduction.mp4"
  cp "$INTRO/thumbnail.jpg" "$VIDEOS/parallel-code-introduction.jpg"
  ffmpeg -v error -y -i "$INTRO/parallel-code-introduction.srt" -f webvtt \
    "$VIDEOS/parallel-code-introduction.vtt"
  echo "Intro video -> $VIDEOS/"
else
  echo "No rendered intro video in $INTRO; skipped" >&2
fi
