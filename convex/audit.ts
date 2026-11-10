// File rỗng có chủ đích (đợt 3/5 dọn code rác).
//
// 4 export cũ (record/getLog/getGuildAnalytics/getBackupAnalytics) không có
// caller nào: dashboard dùng reports/guildStats, bot dùng bot_writes. Giữ file
// để `convex/_generated/api.d.ts` (sinh tự động) vẫn resolve được module —
// xoá hẳn file khi có thể chạy `convex codegen` trên máy có deployment.
