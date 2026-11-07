import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { color, initials, shadow } from "./theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 20, tint = color.ink }: { name: IconName; size?: number; tint?: string }) {
  return <MaterialCommunityIcons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={name} size={size} color={tint} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, style, pressed ? styles.pressed : null]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function MetricCard({label,value,detail,icon="chart-box-outline",index=0,onPress}:{label:string;value:number;detail?:string;icon?:IconName;index?:number;onPress?:()=>void}) {
 const featured=index===0&&!!onPress,tones=[{ink:"#267466",wash:"#eaf4ee"},{ink:"#476da6",wash:"#edf2fa"},{ink:"#90672d",wash:"#faf3e7"},{ink:"#79619b",wash:"#f2eef8"}],tone=tones[index%tones.length];
 return <Card onPress={onPress} style={[styles.metric,featured?styles.featured:null]}><View style={styles.metricTop}><IconBadge name={icon} tint={featured?"#e0f0e8":tone.ink} wash={featured?"#ffffff18":tone.wash} size={38}/>{onPress&&<Icon name="arrow-top-right" size={18} tint={featured?"#d0e5dd":color.muted}/>}</View><Text style={[styles.metricLabel,featured&&styles.light]}>{label}</Text><Text style={[styles.metricValue,featured&&{color:"#ffffff"}]}>{value.toLocaleString("en-US")}</Text>{detail&&<Text style={[styles.metricDetail,featured&&styles.light]}>{detail}</Text>}{onPress&&<View style={[styles.metricFooter,featured&&{borderTopColor:"#ffffff25"}]}><Text style={[styles.metricFooterText,featured&&styles.light]}>View records</Text><Icon name="arrow-right" size={14} tint={featured?"#d0e5dd":color.primary}/></View>}</Card>;
}

export function IconBadge({ name, tint, wash, size = 44 }: { name: IconName; tint: string; wash: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: wash }]}>
      <Icon name={name} size={size * 0.48} tint={tint} />
    </View>
  );
}

export function Avatar({ name, size = 48, tint = color.primary, wash = color.primarySoft }: { name: string; size?: number; tint?: string; wash?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: wash }]}>
      <Text style={[styles.avatarText, { color: tint, fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({ label, tint, wash }: { label: string; tint: string; wash: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: wash }]}>
      <Text style={[styles.pillText, { color: tint }]}>{label}</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  tone = "primary",
  busy = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: "primary" | "dark" | "quiet";
  busy?: boolean;
}) {
  const fill = tone === "primary" ? color.primary : tone === "dark" ? color.ink : color.surface;
  const ink = tone === "quiet" ? color.ink : "#ffffff";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: fill }, tone === "quiet" ? styles.quiet : null, pressed ? styles.pressed : null]}
    >
      {busy ? <ActivityIndicator color={ink} /> : null}
      {!busy && icon ? <Icon name={icon} size={18} tint={ink} /> : null}
      <Text style={[styles.buttonText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { icon?: IconName }) {
  const { icon, style, ...rest } = props;
  return (
    <View style={styles.field}>
      {icon ? <Icon name={icon} size={18} tint={color.faint} /> : null}
      <TextInput placeholderTextColor={color.faint} style={[styles.fieldInput, style]} {...rest} />
    </View>
  );
}

export function Banner({ tone, text }: { tone: "error" | "notice"; text: string }) {
  const error = tone === "error";
  return (
    <View style={[styles.banner, { backgroundColor: error ? color.dangerSoft : color.successSoft }]}>
      <Icon name={error ? "alert-circle-outline" : "check-circle-outline"} size={18} tint={error ? color.danger : color.success} />
      <Text style={[styles.bannerText, { color: error ? "#9f1239" : "#166534" }]}>{text}</Text>
    </View>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <IconBadge name={icon} tint={color.faint} wash={color.canvas} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Orbs({ tint = "#ffffff" }: { tint?: string }) {
  return (
    <>
      <View pointerEvents="none" style={[styles.orb, { width: 180, height: 180, right: -50, top: -70, backgroundColor: tint, opacity: 0.14 }]} />
      <View pointerEvents="none" style={[styles.orb, { width: 110, height: 110, right: 50, bottom: -60, backgroundColor: tint, opacity: 0.1 }]} />
      <View pointerEvents="none" style={[styles.orb, { width: 46, height: 46, left: -14, bottom: 22, backgroundColor: tint, opacity: 0.12 }]} />
    </>
  );
}

const styles = StyleSheet.create({
  metric:{width:"47%",minWidth:130,padding:18,minHeight:196,gap:8},
  featured:{backgroundColor:"#18564d",borderColor:"#18564d"},
  metricTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  metricLabel:{fontSize:12,lineHeight:18,color:color.body,fontWeight:"500"},
  metricValue:{fontSize:34,lineHeight:40,fontWeight:"600",letterSpacing:-1.5,color:color.ink,fontVariant:["tabular-nums"]},
  metricDetail:{fontSize:12,lineHeight:18,color:color.muted},
  metricFooter:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderTopWidth:1,borderTopColor:color.hairline,marginTop:8,paddingTop:10},
  metricFooterText:{fontSize:11,fontWeight:"600",color:color.primary},
  light:{color:"#d0e5dd"},
  card: { backgroundColor: color.surface, borderRadius: 16, borderWidth: 1, borderColor: color.hairline, padding: 18, ...shadow },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  badge: { alignItems: "center", justifyContent: "center" },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "600" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: color.ink, fontSize: 18, fontWeight: "600", letterSpacing: -0.3 },
  sectionAction: { color: color.primary, fontWeight: "700" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  button: { minHeight: 50, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  quiet: { borderWidth: 1, borderColor: color.hairline },
  buttonText: { fontWeight: "600", fontSize: 15 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: color.surface,
    borderRadius: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.hairline,
    marginBottom: 12,
  },
  fieldInput: { flex: 1, color: color.ink, paddingVertical: 14, fontSize: 15 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, marginBottom: 14 },
  bannerText: { flex: 1, lineHeight: 20, fontWeight: "600" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 22 },
  emptyText: { color: color.muted, textAlign: "center", lineHeight: 20 },
  orb: { position: "absolute", borderRadius: 999 },
});
