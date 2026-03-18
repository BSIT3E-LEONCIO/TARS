import { useCallback, useState } from "react";
import Chat from "./components/Chat";
import SplashScreen from "./components/SplashScreen";

const INTRO_SEEN_STORAGE_KEY = "tars-intro-seen-v1";

type AppPhase = "splash" | "transition" | "main";

const App = () => {
  const [phase, setPhase] = useState<AppPhase>(() => {
    if (
      typeof window !== "undefined" &&
      window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY) === "1"
    ) {
      return "main";
    }
    return "splash";
  });

  const handleSplashComplete = useCallback(() => {
    if (phase !== "splash") return;

    window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, "1");
    setPhase("transition");

    window.setTimeout(() => {
      setPhase("main");
    }, 900);
  }, [phase]);

  const isSplashVisible = phase === "splash" || phase === "transition";
  const isMainVisible = phase === "transition" || phase === "main";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080b] px-2 pt-8 pb-0 sm:px-4 md:px-8">
      <div className="absolute inset-0 stars-layer" />
      <div className="absolute -top-20 left-1/2 h-64 w-64 sm:h-80 sm:w-80 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-3xl" />

      {isSplashVisible && (
        <SplashScreen
          isExiting={phase === "transition"}
          onComplete={handleSplashComplete}
        />
      )}

      <div
        className={`relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-stretch justify-center transition-opacity duration-900 sm:min-h-[calc(100vh-3rem)] ${
          isMainVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <Chat />
      </div>
    </div>
  );
};

export default App;
