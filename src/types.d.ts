// Phase 0: barba ships no types and @types/barba__core does not exist.
// Minimal surface we use; Phase 8 removes barba entirely.
declare module "@barba/core" {
  interface BarbaData {
    current: { container: Element };
    next: { container: Element };
  }
  interface Transition {
    name?: string;
    from?: { namespace?: string[] };
    to?: { namespace?: string[] };
    leave?: (d: BarbaData) => unknown;
    enter?: (d: BarbaData) => unknown;
    afterEnter?: () => void;
  }
  interface View {
    namespace: string;
    afterEnter?: () => void;
  }
  const barba: {
    init: (opts: { transitions?: Transition[]; views?: View[] }) => void;
    go: (href: string) => void;
  };
  export default barba;
}
