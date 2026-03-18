import { useEffect, useRef, useState } from "react";

type SplashPhase = "in" | "hold" | "out";

type SplashScreenProps = {
  isExiting: boolean;
  onComplete: () => void;
};

const SPLASH_LINES = [
  "Initializing system...",
  "TARS online.",
  "All systems nominal.",
  "Welcome aboard, Captain.",
];

const FADE_IN_MS = 700;
const HOLD_MS = 1650;
const FADE_OUT_MS = 700;
const GAP_MS = 130;

const SplashScreen = ({ isExiting, onComplete }: SplashScreenProps) => {
  const [lineIndex, setLineIndex] = useState(0);
  const [phase, setPhase] = useState<SplashPhase>("in");
  const completedRef = useRef(false);

  useEffect(() => {
    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    };

    const fadeInTimer = window.setTimeout(() => {
      setPhase("hold");
    }, FADE_IN_MS);

    const holdTimer = window.setTimeout(() => {
      setPhase("out");
    }, FADE_IN_MS + HOLD_MS);

    const advanceTimer = window.setTimeout(
      () => {
        if (lineIndex >= SPLASH_LINES.length - 1) {
          complete();
          return;
        }
        setLineIndex((current) => current + 1);
        setPhase("in");
      },
      FADE_IN_MS + HOLD_MS + FADE_OUT_MS + GAP_MS,
    );

    return () => {
      window.clearTimeout(fadeInTimer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [lineIndex, onComplete]);

  useEffect(() => {
    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    };

    const handleSkip = () => complete();

    window.addEventListener("keydown", handleSkip);
    return () => {
      window.removeEventListener("keydown", handleSkip);
    };
  }, [onComplete]);

  const textClassName =
    phase === "in"
      ? "opacity-100 translate-y-0"
      : phase === "hold"
        ? "opacity-100 translate-y-0"
        : "opacity-0 translate-y-0";

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-30 transition-opacity duration-900 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
      onClick={onComplete}
      role="presentation"
    >
      <div className="splash-screen absolute inset-0" />
      <div className="splash-vignette absolute inset-0" />

      <div className="relative flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center sm:gap-6 sm:px-6 md:gap-8 md:px-8">
        <div className="splash-accent-top" />
        <p
          className={`splash-line transform text-base text-cyan-100 sm:text-lg md:text-2xl lg:text-4xl ${textClassName}`}
          style={{
            transitionDuration: `${FADE_IN_MS}ms`,
            transitionProperty: "opacity",
          }}
        >
          {SPLASH_LINES[lineIndex]}
        </p>
        <div className="splash-accent-bottom" />
      </div>

      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-pulse text-[8px] uppercase tracking-widest text-cyan-600/60 sm:bottom-6 sm:text-[9px]">
        [ press any key to skip ]
      </p>
    </div>
  );
};

export default SplashScreen;
