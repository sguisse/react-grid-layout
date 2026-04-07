import React from "react";
import { CirclePlus, Plus } from "lucide-react";

export interface CrossPlusProps {
  id?: string;
  dataRgl?: boolean;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
}

export default function CrossPlus({ id, dataRgl, style, icon }: CrossPlusProps) {
  const baseStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 999,
    color: "#ffffff",
    background: "#39d253",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 700,
    pointerEvents: "none",
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    outline: "2px solid #269539"
  };

  return (
    <div
      id={id}
      {...(dataRgl ? { ["data-rgl-cross-plus"]: "true" } : {})}
      aria-hidden
      style={{ ...baseStyle, ...style }}
    >
      {icon ?? <Plus size={22} />}
    </div>
  );
}
