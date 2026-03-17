import { useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  seed: number;
};

const SAMPLE_COUNT = 88;

const Waveform = ({ active, seed }: Props) => {
  const [pathData, setPathData] = useState("M0 24 L100 24");
  const frameRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const currentAmpRef = useRef(0);
  const targetAmpRef = useRef(0);

  useEffect(() => {
    targetAmpRef.current = active ? 0.42 + (seed % 4) * 0.08 : 0;
  }, [active, seed]);

  useEffect(() => {
    if (frameRef.current) {
      return;
    }

    const animate = () => {
      const nextAmp = currentAmpRef.current + (targetAmpRef.current - currentAmpRef.current) * 0.14;
      currentAmpRef.current = nextAmp;
      phaseRef.current += 0.11;

      if (!active) {
        targetAmpRef.current = 0;
      }

      if (nextAmp < 0.003 && !active) {
        setPathData("M0 24 L100 24");
        frameRef.current = null;
        return;
      }

      let path = "";
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const x = (index / (SAMPLE_COUNT - 1)) * 100;
        const harmonicA = Math.sin(index * 0.26 + phaseRef.current);
        const harmonicB = Math.sin(index * 0.11 + phaseRef.current * 1.9);
        const harmonicC = Math.sin(index * 0.07 + phaseRef.current * 2.7);
        const y = 24 + (harmonicA * 0.58 + harmonicB * 0.3 + harmonicC * 0.12) * nextAmp * 12;
        path += `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
      }

      setPathData(path.trim());
      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [active]);

  return (
    <div className="rounded-lg border border-cyan-300/40 bg-gradient-to-r from-cyan-950/25 via-cyan-900/15 to-cyan-950/25 px-2 sm:px-3 py-2 sm:py-2.5 shadow-md shadow-cyan-950/30 w-full">
      <div className="mb-1.5 sm:mb-2 flex items-center justify-between">
        <div className="text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] font-semibold text-cyan-200/75 uppercase">Voice Channel</div>
        <div className="text-[7px] sm:text-[9px] text-cyan-200/50 tracking-widest">{active ? "ACTIVE" : "READY"}</div>
      </div>
      <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="waveform-line-shell h-10 sm:h-12 w-full" aria-hidden="true">
        <defs>
          <filter id="waveform-glow">
            <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <line x1="0" y1="24" x2="100" y2="24" className="waveform-baseline" />
        <path d={pathData} className={`waveform-line ${active ? "waveform-line-active" : "waveform-line-idle"}`} filter="url(#waveform-glow)" />
      </svg>
    </div>
  );
};

export default Waveform;
