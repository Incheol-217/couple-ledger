import { ImageResponse } from "next/og";
import { LOGO_HEART_PATH } from "@/components/logo";

// 브라우저 탭 파비콘. 초록 타일 + 두 반쪽 하트.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

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
          <path fill="#141414" d={LOGO_HEART_PATH} />
          <rect x="11.35" y="3" width="1.3" height="18" rx="0.65" fill="#a3e635" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
