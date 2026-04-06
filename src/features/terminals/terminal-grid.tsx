import { useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { TerminalPane } from "./terminal-pane";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Terminal, Plus } from "lucide-react";

const ResponsiveGridLayout = WidthProvider(Responsive);

export function TerminalGrid() {
  const { workspace, profiles, activePaneId, setActivePaneId, removePane, updateWorkspaceLayouts, addPane } =
    useWorkspaceStore();

  const layouts = useMemo(
    () =>
      workspace.panes.map((pane) => ({
        i: pane.id,
        x: pane.layout.x,
        y: pane.layout.y,
        w: pane.layout.w,
        h: pane.layout.h,
        minW: pane.layout.minW ?? 1,
        minH: pane.layout.minH ?? 1,
      })),
    [workspace.panes]
  );

  const onLayoutChange = useCallback(
    (layout: ReactGridLayout.Layout[]) => {
      updateWorkspaceLayouts(layout);
    },
    [updateWorkspaceLayouts]
  );

  if (workspace.panes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="text-center"
        >
          {/* Icon with gradient background */}
          <div className="relative inline-flex mb-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <Terminal size={24} className="text-zinc-400" strokeWidth={1.5} />
            </div>
            {/* Subtle glow behind icon */}
            <div
              className="absolute inset-0 rounded-2xl blur-xl opacity-40"
              style={{ background: "var(--accent-gradient)" }}
            />
          </div>

          <p className="text-[15px] font-medium text-zinc-300 mb-1.5">
            No terminals open
          </p>
          <p className="text-[13px] text-zinc-500 mb-5">
            Launch a terminal to get started
          </p>

          {/* Quick-launch button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => addPane(profiles[0]?.id ?? "system-shell")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-zinc-200 transition-colors duration-200"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <Plus size={14} strokeWidth={2} />
            <span>New Terminal</span>
          </motion.button>

          {/* Keyboard hint */}
          <p className="text-[11px] text-zinc-600 mt-3">
            or use <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-400 font-mono text-[10px]">+ Terminal</kbd> above
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-2 overflow-hidden">
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layouts }}
        breakpoints={{ lg: 0 }}
        cols={{ lg: workspace.gridCols }}
        rowHeight={80}
        isDraggable
        isResizable
        compactType={null}
        preventCollision={false}
        onLayoutChange={onLayoutChange}
        draggableHandle=".pane-drag-handle"
        margin={[6, 6]}
      >
        {workspace.panes.map((pane) => {
          const profile = profiles.find((p) => p.id === pane.profileId) ?? profiles[0];
          return (
            <div key={pane.id} className="h-full">
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                  className="h-full"
                >
                  <TerminalPane
                    paneId={pane.id}
                    profile={profile}
                    isActive={activePaneId === pane.id}
                    onFocus={() => setActivePaneId(pane.id)}
                    onClose={() => removePane(pane.id)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
