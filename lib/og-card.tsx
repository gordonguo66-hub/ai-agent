import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function CoreboundOGCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse at center, #141a2a 0%, #0a0d16 70%)",
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 100 100"
          style={{ marginBottom: 48 }}
        >
          <polygon points="50,14 80,50 50,86 20,50" fill="#ffffff" />
          <rect x="4" y="42" width="10" height="16" rx="2" fill="#3f4656" />
          <rect x="86" y="42" width="10" height="16" rx="2" fill="#3f4656" />
          <polygon points="46,6 54,6 50,12" fill="#3f4656" />
          <polygon points="46,94 54,94 50,88" fill="#3f4656" />
        </svg>

        <div
          style={{
            fontSize: 128,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          Corebound
        </div>

        <div
          style={{
            fontSize: 34,
            color: "#9ca3af",
            marginTop: 28,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            textAlign: "center",
          }}
        >
          AI executes. Human strategy sets the limits.
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 48,
            fontSize: 22,
            color: "#4b5563",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          coreboundai.io
        </div>
      </div>
    ),
    { ...size },
  );
}
