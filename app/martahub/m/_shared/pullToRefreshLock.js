"use client";
/**
 * pullToRefreshLock - dipisah jadi modul tersendiri (sebelumnya hidup di
 * CalendarPickerSheet.jsx) supaya komponen sheet lain (mis. BottomSheet.jsx)
 * bisa import ini TANPA bikin circular import (CalendarPickerSheet.jsx
 * sendiri juga akan pakai BottomSheet.jsx utk popup2 di dalamnya).
 *
 * Reference-counted (BUKAN boolean sederhana) krn sheet bisa nested (mis.
 * sheet kalender + popup jam di dalamnya) - masing2 lock/unlock sendiri2
 * saat mount/unmount, & flag globalnya cuma boleh kebuka lagi begitu SEMUA
 * locker sudah unmount, bukan pas locker YANG PALING DALAM unmount duluan.
 *
 * `document.body.dataset.ptrLock` dicek langsung oleh `usePullToRefresh`
 * (MobileShell.jsx) di setiap onTouchStart/onTouchMove - lapis pertahanan
 * yg tidak bergantung stopPropagation/struktur DOM, supaya pull-to-refresh
 * benar-benar tidak bisa terpicu sama sekali selagi sheet manapun terbuka.
 */
export function lockPullToRefresh() {
  const n = Number(document.body.dataset.ptrLockCount || 0) + 1;
  document.body.dataset.ptrLockCount = String(n);
  document.body.dataset.ptrLock = "1";
}
export function unlockPullToRefresh() {
  const n = Math.max(0, Number(document.body.dataset.ptrLockCount || 0) - 1);
  document.body.dataset.ptrLockCount = String(n);
  if (n === 0) delete document.body.dataset.ptrLock;
}
