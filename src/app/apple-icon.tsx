import { ImageResponse } from "next/og";
import { LOGO_HEART_PATH } from "@/components/logo";

// iOS 홈 화면 앱 아이콘. 초록 바탕 + 두 반쪽 하트 (모서리는 iOS가 둥글려요).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          <path fill="#141414" d={LOGO_HEART_PATH} />
          <rect x="11.3" y="3" width="1.4" height="18" rx="0.7" fill="#a3e635" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
