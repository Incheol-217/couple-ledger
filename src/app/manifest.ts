import type { MetadataRoute } from "next";

// PWA 매니페스트: 홈 화면 추가 시 이름·아이콘·색을 정해요.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "부부 공동 가계부",
    short_name: "가계부",
    description: "부부가 함께 쓰는 공동 가계부",
    start_url: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#a3e635",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
