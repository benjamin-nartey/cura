export function developmentServerUrls(): Array<string | undefined> {
  return typeof window === "undefined" ? [] : [window.location.origin];
}
