// Na czym ktoś otworzył stronę. EduNote jest na razie tylko na Maca, więc tylko tam przycisk prowadzi do App Store.
// iPad w Safari przedstawia się jak Mac, ale ma ekran dotykowy.
window.eduPlatform = function () {
  var ua = navigator.userAgent || "";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  return "other";
};
