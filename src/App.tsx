import Chat from "./components/Chat";

const App = () => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080b] px-2 py-3 sm:px-4 md:px-8">
      <div className="absolute inset-0 stars-layer" />
      <div className="absolute -top-20 left-1/2 h-64 w-64 sm:h-80 sm:w-80 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] sm:min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch justify-center">
        <Chat />
      </div>
    </div>
  );
};

export default App;
