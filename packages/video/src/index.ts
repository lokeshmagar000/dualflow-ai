/**
 * Video package: turns a script + voice + subtitles into an .mp4 and a thumbnail.
 * Built with Remotion (React code that draws each frame) and free stock clips (Pixabay or Pexels).
 */
export { renderVideo, renderVideoV2, renderThumbnail, makeJobFolder, closeRenderer } from "./render";
export { findMedia, findPhoto, findCheckedMedia, checkPictures, visionCheckOn, visionRequests, stockProvider, type FoundMedia } from "./stock";
export { prepareIntro, introSettings, introSoundWav } from "./intro";
export * from "./types";
export * from "./v2types";
export * as sfx from "./sfx";
export { prepareV2, normaliseLoudness, type V2Text } from "./v2build";
