#!/bin/zsh
# Rebuild history: one commit per module, then force push.
set -e
cd /Users/hirunkulphimsiri/Documents/programming/project/Cunny

git checkout --orphan rewrite
git reset

commit() {
  git add -- "$@"
  git commit -q -m "$1"
  shift $#
}

git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.typedoc.json typedoc.json .gitignore LICENSE .changeset .github scripts pnpm-lock.yaml
git commit -q -m "chore: workspace scaffold"

git add docs
git commit -q -m "docs: task catalog, architecture, roadmap, module specs"

git add packages/core
git commit -q -m "feat(core): model registry, cached loading, engine"

git add packages/provider-mediapipe
git commit -q -m "feat(provider-mediapipe): shared mediapipe runtime"

git add packages/provider-onnx
git commit -q -m "feat(provider-onnx): shared onnxruntime runtime"

git add packages/face-detect
git commit -q -m "feat(face-detect): face detection"

git add packages/bg-remove
git commit -q -m "feat(bg-remove): background removal"

git add packages/face-mesh
git commit -q -m "feat(face-mesh): face landmarks and blendshapes"

git add packages/pose
git commit -q -m "feat(pose): body pose estimation"

git add packages/segment
git commit -q -m "feat(segment): semantic segmentation"

git add packages/detect
git commit -q -m "feat(detect): object detection"

git add packages/embed
git commit -q -m "feat(embed): local text embeddings"

git add packages/similarity
git commit -q -m "feat(similarity): text similarity"

git add packages/stt
git commit -q -m "feat(stt): speech to text"

git add packages/clip
git commit -q -m "feat(clip): zero shot classification and search"

git add packages/depth
git commit -q -m "feat(depth): depth estimation"

git add packages/vector
git commit -q -m "feat(vector): local vector store"

git add packages/search
git commit -q -m "feat(search): local semantic search"

git add packages/track
git commit -q -m "feat(track): multi object tracking"

git add packages/vad
git commit -q -m "feat(vad): voice activity detection"

git add packages/upscale
git commit -q -m "feat(upscale): image upscaling"

git add packages/tts
git commit -q -m "feat(tts): text to speech"

git add packages/captions
git commit -q -m "feat(captions): live captions"

git add playground
git commit -q -m "chore(playground): demo hub"

git add website
git commit -q -m "docs(website): vitepress site with generated api reference"

echo "--- leftover (must be empty):"
git status --porcelain | grep -v "^??" || true
echo "--- untracked (must be empty):"
git status --porcelain | grep "^??" || true
echo "--- log:"
git log --oneline
