import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { developmentServerUrls } from "./src/development-server";
import { ClinicApp } from "./src/ClinicApp";
import { Landing } from "./src/Landing";
import { PatientApp } from "./src/PatientApp";
import { color } from "./src/theme";
import { Welcome, type Mode } from "./src/Welcome";

const SEEN = "curasphere.landing.v6";
const HOST = "curasphere.host.v2";

function clean(host: string) {
  return host.trim().replace(/^https?:\/\//, "").replace(/[:/].*$/, "") || "127.0.0.1";
}

function hostFrom(value: string | undefined) {
  if (!value) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const host = new URL(withScheme).hostname;
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "[::1]") return "";
    return host;
  } catch {
    return "";
  }
}

function devMachineHost() {
  for (const url of developmentServerUrls()) {
    const host = hostFrom(url);
    if (host) return host;
  }
  return "";
}

function isLoopback(host: string) {
  const value = clean(host);
  return value === "127.0.0.1" || value === "localhost" || value === "[::1]" || value === "0.0.0.0";
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [landing, setLanding] = useState(true);
  const [host, setHost] = useState(devMachineHost() || "127.0.0.1");
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const detected = devMachineHost();
    Promise.all([AsyncStorage.getItem(SEEN), AsyncStorage.getItem(HOST)])
      .then(([seen, stored]) => {
        setLanding(seen !== "1");
        if (stored && !isLoopback(stored)) setHost(stored);
        else if (detected) setHost(detected);
      })
      .catch(() => setLanding(true))
      .finally(() => setReady(true));
  }, []);

  async function enter() {
    await AsyncStorage.setItem(SEEN, "1");
    setLanding(false);
  }

  function changeHost(next: string) {
    setHost(next);
    AsyncStorage.setItem(HOST, next).catch(() => null);
  }

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.canvas }} />;
  if (landing) return <Landing onDone={enter} />;
  const address = clean(host);
  if (mode === "patient") return <PatientApp base={`http://${address}:3000`} onExit={() => setMode(null)} />;
  if (mode === "clinic") return <ClinicApp root={`http://${address}:8081`} onExit={() => setMode(null)} />;
  return <Welcome host={host} onHost={changeHost} onChoose={setMode} />;
}
