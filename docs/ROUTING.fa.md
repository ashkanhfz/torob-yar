# مسیریابی محلی

موتور واقعی OSRM با پروفایل خودرو و الگوریتم MLD اجرا می‌شود. `/api/route` حداکثر شش نقطه (یک مبدأ و پنج فروشگاه) می‌پذیرد. ترتیب مقصدها همان برنامهٔ خرید است؛ بهینه‌سازی ترتیب یا ترافیک زنده نداریم. اتصال هر نقطه به شبکهٔ خیابان حداکثر ۲۰۰ متر است؛ اگر نقطه بیرون پوشش یا دور از خیابان قابل عبور باشد خطای واضح برمی‌گردد.

## راه‌اندازی در Linux / WSL با Docker

داده بیرون مخزن نگه داشته می‌شود. در این راهنما `OSRM_DATA_DIR` برابر `$HOME/.local/share/torob-osrm` و `OSRM_DATA_NAME` برابر `iran` است. هر دو قابل تنظیم‌اند.

```sh
mkdir -p "$HOME/.local/share/torob-osrm"
curl -fL --retry 2 -C - -o "$HOME/.local/share/torob-osrm/iran.osm.pbf" https://download.geofabrik.de/asia/iran-latest.osm.pbf
curl -fL -o "$HOME/.local/share/torob-osrm/iran.osm.pbf.md5" https://download.geofabrik.de/asia/iran-latest.osm.pbf.md5
# نام فایل داخل checksum ممکن است iran-latest.osm.pbf باشد؛ هش فایل دانلودشده را با آن مقایسه کنید.
md5sum "$HOME/.local/share/torob-osrm/iran.osm.pbf"
bash scripts/osrm-local.sh prepare
bash scripts/osrm-local.sh start
OSRM_BASE_URL=http://127.0.0.1:5001 PORT=3102 npm start
```

ایمیج رسمی OSRM به digest ثابت متصل است؛ نسخهٔ آزمایش‌شده `v26.10.0` است. آماده‌سازی حداکثر دو CPU و ۶ گیگابایت حافظه دارد؛ سرویس با دو CPU و سقف ۲ گیگابایت اجرا می‌شود. فایل‌های نقشه در حالت سرویس فقط خواندنی‌اند. پورت `5001` فقط روی loopback منتشر می‌شود. سطح لاگ سرویس `WARNING` است تا درخواست‌های معمول حاوی مختصات در لاگ ثبت نشوند. اسکریپت با کانتینرهای دیگر کاری ندارد. برای توقف: `bash scripts/osrm-local.sh stop`.

بررسی واقعی:

```sh
curl 'http://127.0.0.1:5001/route/v1/driving/51.4091,35.7007;51.409,35.757?overview=false'
curl -H 'Content-Type: application/json' -d '{"points":[{"lat":35.7007,"lon":51.4091},{"lat":35.757,"lon":51.409}]}' http://127.0.0.1:3102/api/route
```

## نمایش و استقرار

دکمهٔ «مسیریابی» هر فروشگاه و «مسیر مراجعه به فروشگاه‌ها» در برنامهٔ خرید، نقشه، فاصلهٔ جاده‌ای، زمان تخمینی و راهنمای گام‌ها را نمایش می‌دهند. مبدأ همان نقطهٔ انتخاب‌شدهٔ کاربر است. نقشهٔ زمینه از کاشی‌های آنلاین OpenStreetMap دریافت می‌شود؛ محاسبهٔ مسیر از OSRM محلی است، بنابراین برنامه کاملاً آفلاین نیست. کاشی‌ها پیش‌دانلود نمی‌شوند و انتساب منبع در نقشه دیده می‌شود. Leaflet 1.9.4 با مجوز BSD داخل پروژه قرار دارد.

سرور Liara به loopback رایانهٔ شما دسترسی ندارد. تا زمانی که `OSRM_BASE_URL` به یک سرویس قابل دسترس برای آن سرور متصل نشود، نسخهٔ عمومی صادقانه عدم دسترسی را اعلام می‌کند و لینک همان مقصدها در گوگل‌مپ می‌دهد. برای اجرای محلی نیازی به سرویس پولی جدید یا مدل زبانی نیست. مختصات فقط هنگام درخواست مسیر ارسال می‌شوند و در سرور ذخیره نمی‌شوند.

## منابع

- [OSRM و مراحل MLD](https://github.com/Project-OSRM/osrm-backend)
- [Route API](https://project-osrm.org/docs/v5.24.0/api/)
- [دادهٔ ایران Geofabrik](https://download.geofabrik.de/asia/iran.html)
- [حقوق دادهٔ OpenStreetMap](https://www.openstreetmap.org/copyright)
- [سیاست کاشی‌های OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- [Leaflet](https://leafletjs.com/download.html)

دادهٔ نصب‌شده در این اجرا: ایران، زمان منبع `2026-10-22T20:21:33Z`، اندازهٔ فایل `229897994` بایت و MD5 برابر `3205423c26135585832fc32c889e1956`؛ مقدار با checksum منبع تطبیق داده شده است.

## اتصال نسخهٔ عمومی دمو

نسخهٔ لیارا با `OSRM_BASE_URL=https://router.project-osrm.org` به OSRM عمومی وصل است؛ سرور محلی همچنان از دادهٔ ایران و پورت ۵۰۰۱ استفاده می‌کند. هیچ تونلی به سیستم شخصی ایجاد نشده و سرویس پولی تازه‌ای اضافه نشده است.

این endpoint برای دموی غیرتجاری و مصرف محدود است؛ [سیاست OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) سقف یک درخواست در ثانیه و نبود تضمین دسترس‌پذیری را مشخص می‌کند. برنامه با یک replica، فاصلهٔ حداقل ۱٫۱ ثانیه بین درخواست‌های عمومی، ادغام درخواست هم‌زمان یکسان و کش پنج‌دقیقه‌ای با حداکثر ۶۴ مسیر این مصرف را محدود می‌کند. در مقیاس بالاتر باید OSRM اختصاصی مستقر شود. مختصات هنگام انتخاب مسیریابی برای محاسبه به سرویس ارسال می‌شود؛ رابط این موضوع و منبع مسیر را بیان می‌کند.
