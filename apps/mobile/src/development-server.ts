import { getExpoGoProjectConfig } from "expo/src/environment/ExpoGo";
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer";

export function* developmentServerUrls(): Iterable<string | undefined> {
  const project = getExpoGoProjectConfig();
  yield project?.debuggerHost;
  yield project?.logUrl;
  yield getDevServer().url;
}
