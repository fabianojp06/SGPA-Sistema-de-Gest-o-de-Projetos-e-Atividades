import { ImageResponse } from "next/og";

export const contentType = "image/png";

const sizes = [
  { id: "192", size: 192, maskable: false },
  { id: "512", size: 512, maskable: false },
  { id: "512-maskable", size: 512, maskable: true },
];

export function generateImageMetadata() {
  return sizes.map(({ id, size }) => ({
    id,
    size: { width: size, height: size },
    contentType,
  }));
}

export default function Icon({ id }: { id: string }) {
  const config = sizes.find((s) => s.id === id) ?? sizes[0];
  const { size, maskable } = config;
  const pad = maskable ? size * 0.2 : size * 0.12;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0f12",
        }}
      >
        <div
          style={{
            width: size - pad * 2,
            height: size - pad * 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: size * 0.22,
            background: "#4f7eff",
            color: "#f0f2f8",
            fontSize: (size - pad * 2) * 0.55,
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          G
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
