/* global jest */
// Shared test setup. The field app animates with React Native's own Animated API, so no native
// animation library needs mocking here.
jest.useRealTimers();
