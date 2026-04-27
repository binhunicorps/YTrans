# YTrans – YouTube Subtitle Translator

Tiện ích trình duyệt Chrome dịch phụ đề YouTube theo thời gian thực bằng Google Translate (miễn phí, không cần API key).

## Tính năng

- 🔴 Dịch phụ đề YouTube **realtime** khi video đang phát
- 🌐 Hỗ trợ 14 ngôn ngữ đích (Tiếng Việt, Anh, Trung, Nhật, Hàn…)
- ⚡ Cache thông minh – tránh gọi API trùng lặp
- 🎨 Overlay trong suốt với badge ngôn ngữ rõ ràng
- ⚙️ Tùy chỉnh cỡ chữ và độ mờ nền
- 🔄 Tự động theo dõi navigation YouTube SPA

## Cài đặt (Chrome / Edge)

1. Tải hoặc clone thư mục này về máy
2. Mở Chrome → địa chỉ: `chrome://extensions`
3. Bật **"Chế độ nhà phát triển"** (Developer mode) – góc trên phải
4. Nhấn **"Tải tiện ích đã giải nén"** (Load unpacked)
5. Chọn thư mục `YTrans`
6. Biểu tượng **YTrans** sẽ xuất hiện trên thanh công cụ

## Cách dùng

1. Mở một video YouTube
2. Bật phụ đề **(CC)** của video (nhấn phím `C` hoặc nút CC trên player)
3. Tiện ích tự động dịch và hiển thị bản dịch ngay bên dưới phụ đề gốc
4. Nhấn vào biểu tượng YTrans để thay đổi ngôn ngữ hoặc tuỳ chỉnh giao diện

## Cấu trúc file

```
YTrans/
├── manifest.json      # Chrome Extension Manifest V3
├── background.js      # Service worker (khởi tạo cài đặt mặc định)
├── content.js         # Logic chính: theo dõi phụ đề + dịch + hiển thị
├── styles.css         # CSS cho overlay dịch
├── popup.html         # Giao diện cài đặt popup
├── popup.js           # Logic popup
├── popup.css          # CSS popup
└── icons/
    └── icon.svg       # Icon tiện ích
```

## Công nghệ

| Thành phần | Công nghệ |
|------------|-----------|
| Extension  | Chrome Manifest V3 |
| Theo dõi phụ đề | MutationObserver trên `.ytp-caption-segment` |
| Dịch thuật | Google Translate API (unofficial, free) |
| Lưu cài đặt | `chrome.storage.sync` |

## Lưu ý

- API dịch của Google (`translate.googleapis.com`) là unofficial và **không đảm bảo uptime**. Không dùng cho mục đích thương mại.
- Cần bật phụ đề (CC) trên YouTube trước – tiện ích dịch phụ đề hiện có, không tự tạo phụ đề.
- Nếu video không có phụ đề, hãy bật **"Tự động tạo phụ đề"** trong menu CC của YouTube.
