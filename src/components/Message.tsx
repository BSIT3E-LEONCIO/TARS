type Props = {
  sender: "user" | "tars";
  text: string;
  karaokeActive?: boolean;
  spokenWords?: number;
};

const renderKaraokeText = (text: string, spokenWords: number) => {
  const words = text.split(/(\s+)/);
  let spokenCounter = 0;

  return words.map((fragment, index) => {
    if (!fragment.trim()) {
      return <span key={`space-${index}`}>{fragment}</span>;
    }

    spokenCounter += 1;
    const isSpoken = spokenCounter <= spokenWords;
    return (
      <span
        key={`word-${index}`}
        className={`transition-all duration-75 ${
          isSpoken
            ? "text-cyan-100 font-medium"
            : "text-cyan-100/40"
        }`}
      >
        {fragment}
      </span>
    );
  });
};

const Message = ({ sender, text, karaokeActive = false, spokenWords = 0 }: Props) => {
  const isUser = sender === "user";
  return (
    <article
      className={`rounded-lg sm:rounded-xl border px-2.5 sm:px-4 py-2 sm:py-3 backdrop-blur-sm transition-all duration-300 ${
        isUser
          ? "ml-auto w-full max-w-[92%] sm:max-w-[85%] md:max-w-[88%] border-emerald-300/50 bg-gradient-to-br from-emerald-900/35 to-emerald-950/20 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-950/30"
          : "mr-auto w-full max-w-[92%] sm:max-w-[88%] md:max-w-[95%] border-cyan-300/50 bg-gradient-to-br from-cyan-950/30 to-cyan-900/15 shadow-lg shadow-cyan-950/20 hover:shadow-cyan-900/30"
      }`}
    >
      <div className={`mb-1.5 sm:mb-2 text-[8px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] font-semibold ${
        isUser ? "text-emerald-200/80" : "text-cyan-200/80"
      }`}>
        {isUser ? "COOPER" : "TARS"}
      </div>
      <p className="whitespace-pre-wrap wrap-anywhere text-xs sm:text-sm leading-relaxed sm:leading-relaxed text-cyan-50/95 font-mono">
        {!isUser && karaokeActive ? renderKaraokeText(text, spokenWords) : text}
      </p>
    </article>
  );
};

export default Message;
