import { ImageResponse } from "next/og";

// iOS 홈 화면 앱 아이콘. 초록 바탕 + 두 반쪽 하트 (모서리는 iOS가 둥글려요).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const HEART =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

export default function AppleIcon() {
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
        }}
      >
        <svg width="118" height="118" viewBox="0 0 24 24">
          <path fill="#141414" d={HEART} />
          <rect x="11.3" y="3" width="1.4" height="18" rx="0.7" fill="#a3e635" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
