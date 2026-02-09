"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useComputations } from "@/lib/hooks/use-api";
import { useNetwork } from "@/lib/hooks/use-network";
import { cn } from "@/lib/utils";

const STATUS_COLORS_HEX = {
  queued: "#4ade80",
  executing: "#fbbf24",
  finalized: "#6D45FF",
  failed: "#f87171",
};

const HOVER_BORDER_COLOR = "#e8e8f0";
const GAP = 3;
const MAX_SIDE = 30;
const MAX_CELLS = MAX_SIDE * MAX_SIDE;

interface GridDimensions {
  side: number;
  cellSize: number;
  canvasSize: number;
}

function computeDimensions(
  containerWidth: number,
  count: number
): GridDimensions {
  const side = Math.min(MAX_SIDE, Math.max(1, Math.ceil(Math.sqrt(count))));
  const cellSize = Math.floor((containerWidth - GAP * (side - 1)) / side);
  const canvasSize = side * cellSize + GAP * (side - 1);
  return { side, cellSize, canvasSize };
}

interface ComputationGridProps {
  className?: string;
}

export function ComputationGrid({ className }: ComputationGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const network = useNetwork();
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1);

  const { data: response } = useComputations(1, MAX_CELLS);
  const computations = (response?.data || []) as Array<{
    status: keyof typeof STATUS_COLORS_HEX;
    address: string;
  }>;

  const dims =
    containerWidth > 0 && computations.length > 0
      ? computeDimensions(containerWidth, computations.length)
      : null;

  // Observe container size
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (width > 0) setContainerWidth(width);
    });

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { side, cellSize, canvasSize } = dims;
    const totalCells = side * side;

    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const radius = Math.max(2, Math.round(cellSize * 0.12));

    for (let i = 0; i < totalCells; i++) {
      const col = i % side;
      const row = Math.floor(i / side);
      const x = col * (cellSize + GAP);
      const y = row * (cellSize + GAP);

      if (i < computations.length) {
        const color =
          STATUS_COLORS_HEX[computations[i].status] || "#363a54";
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
      } else {
        ctx.fillStyle = "#2a2d42";
        ctx.globalAlpha = 0.3;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, cellSize, cellSize, radius);
      ctx.fill();

      // Hover highlight
      if (i === hoveredIndex && i < computations.length) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = HOVER_BORDER_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(
          x - 0.5,
          y - 0.5,
          cellSize + 1,
          cellSize + 1,
          radius + 0.5
        );
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }, [computations, dims, hoveredIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCellIndex = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dims || !canvasRef.current) return -1;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor(x / (dims.cellSize + GAP));
      const row = Math.floor(y / (dims.cellSize + GAP));
      if (col < 0 || col >= dims.side || row < 0 || row >= dims.side)
        return -1;
      return row * dims.side + col;
    },
    [dims]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const index = getCellIndex(e);
      if (index >= 0 && index < computations.length) {
        router.push(
          `/computations/${computations[index].address}?network=${network}`
        );
      }
    },
    [getCellIndex, computations, router, network]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const index = getCellIndex(e);
      setHoveredIndex(index < computations.length ? index : -1);
    },
    [getCellIndex, computations.length]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(-1);
  }, []);

  if (computations.length === 0) {
    return (
      <div ref={wrapperRef} className={cn("aspect-square w-full", className)}>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          <div className="text-center">
            <p>No computations indexed yet</p>
            <p className="mt-1 text-xs">
              Computations will appear here as they are discovered
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!dims) {
    return (
      <div ref={wrapperRef} className={cn("aspect-square w-full", className)}>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          Loading grid...
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("w-full", className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "w-full",
          hoveredIndex >= 0 && hoveredIndex < computations.length
            ? "cursor-pointer"
            : "cursor-default"
        )}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
        {Object.entries(STATUS_COLORS_HEX).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
