import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { color } from "./theme";

const slides: Array<{
  image: ImageSourcePropType;
  title: string;
  darkTitle: string;
  darkBody: string;
  tealTitle: string;
  tealBody: string;
}> = [
  {
    image: require("../assets/splash-clinic.png"),
    title: "The chart stays\nwith the patient",
    darkTitle: "One record",
    darkBody: "Visits, results, and medicines stay on the chart that already belongs to this patient.",
    tealTitle: "The mission",
    tealBody: "Give each clinic one source of truth for the people in its care.",
  },
  {
    image: require("../assets/splash-consult.png"),
    title: "Walk the day\nin order",
    darkTitle: "Today’s clinic",
    darkBody: "Appointments keep their time and reason, so the day opens in the order it was booked.",
    tealTitle: "The person",
    tealBody: "Patients read their own visits, medicines, and results, and write to their care team.",
  },
  {
    image: require("../assets/splash-care.png"),
    title: "The same chart\nfor the team",
    darkTitle: "Clinical work",
    darkBody: "Problems, allergies, and results stay where the care team can read them together.",
    tealTitle: "Your place",
    tealBody: "You sign in as yourself. Your facility comes from the directory.",
  },
];

const slideParts = ["photo", "title", "dark", "orange", "footer"];

export function Landing({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const intro = useRef(slideParts.map(() => new Animated.Value(0))).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(
      120,
      intro.map((value) => Animated.spring(value, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true })),
    ).start();
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    beat.start();
    return () => beat.stop();
  }, [intro, pulse]);

  function enterStyle(part: number, distance: number) {
    const value = intro[part]!;
    return {
      opacity: value,
      translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
    };
  }

  function swipe(slide: number, outputRange: number[] | string[]) {
    return scrollX.interpolate({
      inputRange: [(slide - 1) * width, slide * width, (slide + 1) * width],
      outputRange: outputRange as number[],
      extrapolate: "clamp",
    });
  }

  function go(next: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    scroller.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <View style={styles.landing}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onScrollEnd}
      >
        {slides.map((slide, slideIndex) => {
          const photo = enterStyle(0, 40);
          const title = enterStyle(1, 24);
          const dark = enterStyle(2, 60);
          const orange = enterStyle(3, 80);
          const heartScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
          return (
            <View key={slide.title} style={[styles.slide, { width, height }]}>
              <Animated.Image
                source={slide.image}
                resizeMode="contain"
                style={[
                  styles.slidePhoto,
                  {
                    width: width * 0.62,
                    height: height * 0.54,
                    right: width * 0.06,
                    top: height * 0.16,
                    opacity: Animated.multiply(photo.opacity, swipe(slideIndex, [0, 1, 0])),
                    transform: [
                      { translateY: photo.translateY },
                      { translateX: swipe(slideIndex, [width * 0.35, 0, -width * 0.35]) },
                      { scale: swipe(slideIndex, [0.86, 1, 0.86]) },
                    ],
                  },
                ]}
              />
              <Animated.Text
                style={[
                  styles.slideTitle,
                  {
                    top: height * 0.16,
                    width: width * 0.56,
                    opacity: Animated.multiply(title.opacity, swipe(slideIndex, [0, 1, 0])),
                    transform: [{ translateY: title.translateY }, { translateX: swipe(slideIndex, [width * 0.5, 0, -width * 0.5]) }],
                  },
                ]}
              >
                {slide.title}
              </Animated.Text>
              <Animated.View
                style={[
                  styles.darkCard,
                  {
                    left: width * 0.05,
                    top: height * 0.42,
                    width: width * 0.56,
                    opacity: dark.opacity,
                    transform: [
                      { translateY: dark.translateY },
                      { translateX: swipe(slideIndex, [width * 0.25, 0, -width * 0.25]) },
                      { rotate: swipe(slideIndex, ["-20deg", "-8deg", "4deg"]) },
                    ],
                  },
                ]}
              >
                <View style={styles.badge}>
                  <MaterialCommunityIcons name="stethoscope" size={22} color={color.ink} />
                </View>
                <Text style={styles.darkTitle}>{slide.darkTitle}</Text>
                <Text style={styles.darkBody}>{slide.darkBody}</Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.tealCard,
                  {
                    left: width * 0.28,
                    top: height * 0.55,
                    width: width * 0.58,
                    opacity: orange.opacity,
                    transform: [
                      { translateY: orange.translateY },
                      { translateX: swipe(slideIndex, [width * 0.6, 0, -width * 0.6]) },
                      { rotate: swipe(slideIndex, ["20deg", "8deg", "-4deg"]) },
                    ],
                  },
                ]}
              >
                <View style={styles.badge}>
                  <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                    <MaterialCommunityIcons name="heart-pulse" size={22} color={color.primary} />
                  </Animated.View>
                </View>
                <Text style={styles.tealTitle}>{slide.tealTitle}</Text>
                <Text style={styles.tealBody}>{slide.tealBody}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>
      <Animated.View style={[styles.slideFooter, { opacity: intro[4], transform: [{ translateY: enterStyle(4, 30).translateY }] }]}>
        <View style={styles.dots}>
          {slides.map((slide, dot) => (
            <Pressable key={slide.title} onPress={() => go(dot)} hitSlop={8}>
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: swipe(dot, [0.25, 1, 0.25]),
                    transform: [{ scaleX: swipe(dot, [0.36, 1, 0.36]) }],
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.start} onPress={() => (index < slides.length - 1 ? go(index + 1) : onDone())}>
          <Text style={styles.startText}>{index < slides.length - 1 ? "Next" : "Get started"}</Text>
          <View style={styles.round}>
            <MaterialCommunityIcons name="arrow-right" size={24} color="#ffffff" />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  landing: { flex: 1, backgroundColor: color.surface },
  slide: { backgroundColor: "#ffffff", overflow: "hidden" },
  slideTitle: { position: "absolute", left: 24, zIndex: 2, color: color.ink, fontSize: 36, fontWeight: "800", letterSpacing: -1, lineHeight: 42 },
  slidePhoto: { position: "absolute", zIndex: 0 },
  darkCard: {
    position: "absolute",
    zIndex: 3,
    backgroundColor: color.ink,
    borderRadius: 16,
    padding: 18,
    paddingTop: 22,
    minHeight: 148,
    shadowColor: "#111827",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  darkTitle: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  darkBody: { color: "#d1d5db", marginTop: 8, lineHeight: 20, fontSize: 13 },
  tealCard: {
    position: "absolute",
    zIndex: 4,
    backgroundColor: color.primary,
    borderRadius: 16,
    padding: 18,
    paddingTop: 22,
    minHeight: 142,
    shadowColor: "#235f54",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tealTitle: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  tealBody: { color: "#dce9d2", marginTop: 8, lineHeight: 20, fontSize: 13 },
  badge: {
    position: "absolute",
    right: 18,
    top: -18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#111827",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  slideFooter: { position: "absolute", left: 20, right: 20, bottom: 48, zIndex: 5 },
  dots: { flexDirection: "row", gap: 8, marginBottom: 14, marginLeft: 8 },
  dot: { width: 22, height: 8, borderRadius: 99, backgroundColor: color.ink },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  start: { height: 64, borderRadius: 32, backgroundColor: color.ink, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 22, paddingRight: 6 },
  startText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});
