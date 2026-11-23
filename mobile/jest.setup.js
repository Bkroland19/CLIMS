/* global jest */
// Shared test setup. The field app animates with React Native's own Animated API, so no native
// animation library needs mocking here.
jest.useRealTimers();

// Tests see the end state of every animation: the motion helpers (components/m/motion.tsx) treat
// the phone as asking for reduced motion, so entrances, count-ups and springs settle immediately.
jest.mock("./components/m/motion", () => {
  const actual = jest.requireActual("./components/m/motion");
  return { ...actual, useReducedMotion: () => true };
});
