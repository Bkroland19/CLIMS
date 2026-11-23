import { useCallback, useEffect, useRef, type Ref } from "react";
import { Keyboard, Platform, TextInput, type ScrollViewInstance } from "react-native";

/** The ScrollView instance methods this hook uses. */
type Scroller = ScrollViewInstance & {
  getInnerViewRef?: () => unknown;
  getInnerViewNode?: () => unknown;
};

/**
 * When the keyboard opens, scroll the field being typed in to near the top of its ScrollView, so
 * the field, the ones after it and the submit button sit above the keyboard. Pairs with a
 * KeyboardAvoidingView (behavior "padding") that shrinks the scroll area to the visible space.
 *
 * Returns a ref for the ScrollView; pass an outer ref to keep it working for the caller too.
 */
export function useKeyboardScroll(outer?: Ref<ScrollViewInstance>) {
  const inner = useRef<Scroller | null>(null);
  const setRef = useCallback(
    (r: ScrollViewInstance | null) => {
      inner.current = r as Scroller | null;
      if (typeof outer === "function") outer(r);
      else if (outer && typeof outer === "object")
        (outer as { current: ScrollViewInstance | null }).current = r;
    },
    [outer],
  );

  useEffect(() => {
    const ev = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = Keyboard.addListener(ev, () => {
      clearTimeout(timer);
      // Let the KeyboardAvoidingView apply its padding first, then measure.
      timer = setTimeout(
        () => {
          const sv = inner.current;
          const field = TextInput.State.currentlyFocusedInput?.() as
            { measureLayout?: (...a: unknown[]) => void } | null | undefined;
          const content = sv?.getInnerViewRef?.() ?? sv?.getInnerViewNode?.();
          if (!sv || !field?.measureLayout || !content) return;
          try {
            field.measureLayout(
              content,
              (_x: number, y: number) => sv.scrollTo({ y: Math.max(0, y - 96), animated: true }),
              () => {},
            );
          } catch {
            // A field outside this ScrollView (in a sheet) can't be measured against it; skip.
          }
        },
        Platform.OS === "ios" ? 50 : 120,
      );
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return setRef;
}
