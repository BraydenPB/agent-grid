import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspaceStore } from "@/store/workspace-store";
import { GRID_PRESETS } from "@/lib/grid-presets";
import { getAppWindow } from "@/lib/tauri-shim";
import { cn } from "@/lib/utils";
import {
  Minus,
  Square,
  X,
  Plus,
  LayoutGrid,
  ChevronDown,
  Terminal,
} from "lucide-react";

const dropdownVariants = {
  hidden: { opacity: 0, y: -4, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.97,
    transition: { duration: 0.1, ease: "easeIn" as const },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.15, ease: "easeOut" as const },
  }),
};

export function Titlebar() {
  const { workspace, profiles, addPane, applyPreset } = useWorkspaceStore();
  const [addOpen, setAddOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) setLayoutOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header
      className="h-11 flex items-center justify-between shrink-0 glass select-none"
      style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}
      data-tauri-drag-region
    >
      {/* Left: brand + actions */}
      <div className="flex items-center h-full">
        {/* Brand */}
        <div className="flex items-center gap-2 pl-4 pr-3" data-tauri-drag-region>
          <div className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center"
            style={{ background: "var(--accent-gradient)" }}>
            <Terminal size={10} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold text-zinc-200 tracking-tight" data-tauri-drag-region>
            Agent Grid
          </span>
        </div>

        <div className="w-px h-4 bg-white/[0.06]" />

        {/* Add terminal */}
        <div ref={addRef} className="relative">
          <button
            onClick={() => { setAddOpen(!addOpen); setLayoutOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 h-11 text-[12px] font-medium tracking-wide",
              "text-zinc-400 transition-all duration-200",
              "hover:text-zinc-100",
              addOpen && "text-zinc-100"
            )}
          >
            <Plus size={14} strokeWidth={2} />
            <span>Terminal</span>
            <ChevronDown
              size={10}
              className={cn("transition-transform duration-200", addOpen && "rotate-180")}
            />
          </button>

          <AnimatePresence>
            {addOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-full left-0 mt-1 w-52 glass-elevated rounded-xl z-50 py-1.5 overflow-hidden"
              >
                <div className="px-3 py-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Profiles
                  </span>
                </div>
                {profiles.map((profile, i) => (
                  <motion.button
                    key={profile.id}
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    onClick={() => { addPane(profile.id); setAddOpen(false); }}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-zinc-300",
                      "hover:bg-white/[0.05] hover:text-zinc-100 transition-colors duration-150",
                      "group"
                    )}
                  >
                    {profile.color ? (
                      <span
                        className="w-2 h-2 rounded-full shrink-0 ring-2 ring-transparent group-hover:ring-white/10 transition-all duration-200"
                        style={{ backgroundColor: profile.color }}
                      />
                    ) : (
                      <span className="w-2 h-2 rounded-full shrink-0 bg-zinc-600" />
                    )}
                    <span className="font-medium">{profile.name}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Layout presets */}
        <div ref={layoutRef} className="relative">
          <button
            onClick={() => { setLayoutOpen(!layoutOpen); setAddOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 h-11 text-[12px] font-medium tracking-wide",
              "text-zinc-400 transition-all duration-200",
              "hover:text-zinc-100",
              layoutOpen && "text-zinc-100"
            )}
          >
            <LayoutGrid size={13} strokeWidth={2} />
            <span>Layout</span>
            <ChevronDown
              size={10}
              className={cn("transition-transform duration-200", layoutOpen && "rotate-180")}
            />
          </button>

          <AnimatePresence>
            {layoutOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-full left-0 mt-1 w-48 glass-elevated rounded-xl z-50 py-1.5 overflow-hidden"
              >
                <div className="px-3 py-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Presets
                  </span>
                </div>
                {GRID_PRESETS.slice(0, 6).map((preset, i) => (
                  <motion.button
                    key={preset.name}
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    onClick={() => { applyPreset(preset.name, "system-shell"); setLayoutOpen(false); }}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 text-[12px] text-zinc-300",
                      "hover:bg-white/[0.05] hover:text-zinc-100 transition-colors duration-150"
                    )}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-zinc-600 tabular-nums">{preset.layouts.length} panes</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: status + window controls */}
      <div className="flex items-center h-full" data-tauri-drag-region>
        {/* Pane counter pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full mr-2"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-tauri-drag-region
        >
          <div className="w-1.5 h-1.5 rounded-full"
            style={{
              background: workspace.panes.length > 0 ? "var(--accent-1)" : "#52525b",
              boxShadow: workspace.panes.length > 0 ? "0 0 6px var(--accent-glow)" : "none",
            }}
          />
          <span className="text-[10px] font-medium text-zinc-400 tabular-nums" data-tauri-drag-region>
            {workspace.panes.length} {workspace.panes.length === 1 ? "pane" : "panes"}
          </span>
        </div>

        <div className="w-px h-4 bg-white/[0.06] mr-0.5" />

        {/* Window controls */}
        <button
          onClick={async () => (await getAppWindow())?.minimize()}
          className="inline-flex items-center justify-center w-11 h-11 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all duration-150"
          title="Minimize"
        >
          <Minus size={15} strokeWidth={1.5} />
        </button>
        <button
          onClick={async () => (await getAppWindow())?.toggleMaximize()}
          className="inline-flex items-center justify-center w-11 h-11 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all duration-150"
          title="Maximize"
        >
          <Square size={11} strokeWidth={1.5} />
        </button>
        <button
          onClick={async () => (await getAppWindow())?.close()}
          className="inline-flex items-center justify-center w-11 h-11 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          title="Close"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
