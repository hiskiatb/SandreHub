import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "18px",
          background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
          color: "white",
          fontSize: 34,
          fontWeight: 700,
        }}
      >
        □
      </div>
    ),
    {
      ...size,
    }
  );
}