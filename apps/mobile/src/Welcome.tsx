import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, lift, shadow } from "./theme";
import { Field, Icon, Orbs, type IconName } from "./ui";

export type Mode = "patient" | "clinic";

export function Welcome({ host, onHost, onChoose }: { host: string; onHost: (host: string) => void; onChoose: (mode: Mode) => void }) {
  const [editing, setEditing] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 8, tension: 46, useNativeDriver: true }).start();
  }, [rise]);

  const enter = {
    opacity: rise,
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <Orbs />
        <View style={styles.mark}>
          <Icon name="heart-pulse" size={30} tint={color.primary} />
        </View>
        <Text style={styles.brand}>CuraSphere</Text>
        <Text style={styles.lede}>One chart for the people in this clinic’s care.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View style={enter}>
          <Text style={styles.ask}>How are you signing in?</Text>
          <Choice
            icon="account-heart-outline"
            title="I’m a patient"
            body="See your visits, medicines and results, and write to your care team."
            tint={color.primary}
            wash={color.primarySoft}
            onPress={() => onChoose("patient")}
          />
          <Choice
            icon="stethoscope"
            title="Clinic staff"
            body="Open the day’s visits and the charts at your facility."
            tint={color.accent}
            wash={color.accentSoft}
            onPress={() => onChoose("clinic")}
          />
          <Pressable style={styles.server} onPress={() => setEditing((open) => !open)}>
            <Icon name="lan-connect" size={18} tint={color.muted} />
            <Text style={styles.serverText}>Server · {host}</Text>
            <Icon name={editing ? "chevron-up" : "chevron-down"} size={18} tint={color.muted} />
          </Pressable>
          {editing ? (
            <View>
              <Field icon="ip-network-outline" value={host} onChangeText={onHost} autoCapitalize="none" autoCorrect={false} placeholder="192.168.1.20" />
              <Text style={styles.hint}>This is the address of the computer running CuraSphere. Patients use port 3000. Clinic staff use port 8081.</Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ icon, title, body, tint, wash, onPress }: { icon: IconName; title: string; body: string; tint: string; wash: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, pressed ? styles.pressed : null]}>
      <View style={[styles.choiceIcon, { backgroundColor: wash }]}>
        <Icon name={icon} size={28} tint={tint} />
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceBody}>{body}</Text>
      </View>
      <View style={[styles.go, { backgroundColor: tint }]}>
        <Icon name="arrow-right" size={18} tint="#ffffff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  top: {
    backgroundColor: color.ink,
    paddingTop: 84,
    paddingBottom: 44,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: "hidden",
  },
  mark: { width: 60, height: 60, borderRadius: 20, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", ...lift },
  brand: { color: "#ffffff", fontSize: 34, fontWeight: "800", letterSpacing: -1, marginTop: 22 },
  lede: { color: "#d1d5db", fontSize: 15, lineHeight: 22, marginTop: 6, maxWidth: 280 },
  body: { padding: 20, paddingBottom: 48 },
  ask: { color: color.muted, fontWeight: "700", fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 6, marginBottom: 14 },
  choice: { backgroundColor: color.surface, borderRadius: 26, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14, ...shadow },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  choiceIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: color.ink, fontWeight: "800", fontSize: 17 },
  choiceBody: { color: color.muted, marginTop: 4, lineHeight: 19, fontSize: 13 },
  go: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  server: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16, marginTop: 6, marginBottom: 8 },
  serverText: { color: color.muted, fontWeight: "600" },
  hint: { color: color.muted, lineHeight: 19, fontSize: 13, marginTop: -2 },
});
