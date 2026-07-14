import { ImageResponse } from "next/og";

// 브라우저 탭 파비콘. 초록 타일 + 두 반쪽 하트.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const HEART =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#a3e635",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path fill="#141414" d={HEART} />
          <rect x="11.35" y="3" width="1.3" height="18" rx="0.65" fill="#a3e635" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
