/**
 * Video package: turns a script + voice + subtitles into an .mp4 and a thumbnail.
 * Built with Remotion (React code that draws each frame) and free stock clips (Pixabay or Pexels).
 */
export { renderVideo, renderThumbnail, makeJobFolder, closeRenderer } from "./render";
export { findMedia, findPhoto, stockProvider, type FoundMedia } from "./stock";
export { prepareIntro, introSettings, introSoundWav } from "./intro";
export * from "./types";
