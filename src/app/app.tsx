import { Titlebar } from "@/components/titlebar";
import { TerminalGrid } from "@/features/terminals/terminal-grid";

export function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden mesh-bg">
      <Titlebar />
      <main className="flex-1 min-h-0 flex flex-col">
        <TerminalGrid />
      </main>
    </div>
  );
}
