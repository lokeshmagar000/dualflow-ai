/**
 * Video package: turns a script + voice + subtitles into an .mp4 and a thumbnail.
 * Built with Remotion (React code that draws each frame) and free stock clips (Pixabay or Pexels).
 */
export { renderVideo, renderVideoV2, renderThumbnail, makeJobFolder, closeRenderer } from "./render";
export { findMedia, findPhoto, findCheckedMedia, checkPictures, newsPhotoCheck, stockProviders, visionCheckOn, visionRequests, visionCosts, setPictureChecker, type PictureChecker, stockProvider, type FoundMedia } from "./stock";
export { prepareIntro, introSettings, introSoundWav } from "./intro";
export * from "./types";
export * from "./v2types";
export * as sfx from "./sfx";
export { prepareV2, normaliseLoudness, splitLongShots, cardKind, timeNewsCards, nameSpokenAt, clipProps, pickClipWindows, keepClearOf, CHAPTER_MS, type V2Text, type NewsCardInput } from "./v2build";
export { fetchFlag, findCommonsPhoto, pickCommonsPhoto, pickWikipediaPhoto, nameMatches, findNewsPhoto, pickNewsPhotos, type CommonsPhoto, type NewsPhotoPick } from "./newsmedia";
