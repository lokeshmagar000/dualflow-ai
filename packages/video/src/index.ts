/**
 * Video package: turns a script + voice + subtitles into an .mp4 and a thumbnail.
 * Built with Remotion (React code that draws each frame) and free Pexels footage.
 */
export { renderVideo, renderThumbnail, makeJobFolder, closeRenderer } from "./render";
export { findMedia, type FoundMedia } from "./pexels";
export * from "./types";
