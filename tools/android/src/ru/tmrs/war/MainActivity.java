package ru.tmrs.war;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import android.view.Window;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// «Средневековье» для Android: игра открывается во весь экран во встроенном браузере (WebView).
// Адрес сервера — строка game_url в res/values/strings.xml (подставляет tools/build-apk.sh).
// Без лямбд и новых возможностей Java: код собирается старым dx (см. build-apk.sh).
public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private String home;
    // графика игры, вшитая в приложение (assets/pk/<id>.bin, кладёт tools/build-apk.sh): имя файла — отпечаток содержимого,
    // поэтому файл из приложения всегда совпадает с серверным; картинки, которых нет в приложении (новые), идут с сервера
    private final HashSet<String> pk = new HashSet<String>();
    // графика, которую сервер добавил или изменил после выпуска приложения: скачивается один раз и хранится в памяти приложения
    private File cacheDir;
    private static final long CACHE_MAX = 60L * 1024 * 1024; // больше 60 МБ — старое удаляется (стоит выпустить новую версию приложения)

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        // без FLAG_FULLSCREEN: в полноэкранном режиме Android не поднимает страницу над клавиатурой (adjustResize не работает)
        home = getString(R.string.game_url);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(27, 22, 16));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // «Запомнить меня» хранит сессию в localStorage
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        // фоновая музыка без касания (API 17+, вызываем через reflection — android.jar сборки старее)
        try { WebSettings.class.getMethod("setMediaPlaybackRequiresUserGesture", boolean.class).invoke(s, false); } catch (Exception e) { /* старый Android */ }
        s.setUserAgentString(s.getUserAgentString() + " WarKingsApp/1");
        // защита: странице не нужны файлы телефона по адресам file:// (выбор картинки для аватара работает через окно выбора — оно не затронуто)
        s.setAllowFileAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        try { WebSettings.class.getMethod("setMixedContentMode", int.class).invoke(s, 1); } catch (Exception e) { /* MIXED_CONTENT_NEVER_ALLOW, API 21+ */ }

        try { String[] l = getAssets().list("pk"); if (l != null) for (String n : l) pk.add(n); } catch (Exception e) { /* нет вшитой графики */ }
        cacheDir = new File(getFilesDir(), "pk");
        cacheDir.mkdirs();
        trimCache();
        // запросы помощника кэша (sw.js) за графикой — из приложения, без сети
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) { return local(String.valueOf(r.getUrl())); }
            });
        } catch (Throwable e) { /* старый Android — всё с сервера */ }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                // свои страницы — внутри приложения, чужие ссылки — во внешнем браузере
                if (url.equals(home) || url.startsWith(home + "/")) return false; // не startsWith(home): «home.чужой-сайт.ru» не наш
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* нет браузера */ }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, String url) { return local(url); }

            @Override
            public void onReceivedError(WebView v, int code, String desc, String url) {
                v.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // выбор картинки для аватара (<input type="file">)
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Аватар"), PICK_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        // историю WebView не сохраняем: игра кладёт каждое окно в history, и большой Bundle ронял приложение при сворачивании.
        // После возврата страница просто открывается заново, вход — по сохранённой сессии «Запомнить меня».
        web.loadUrl(home);
    }

    // свой сервер, /pk/<id>.bin?h=<отпечаток> — графика (как есть, зашифрованная: расшифровывает sw.js):
    // 1) вшитая в приложение; 2) скачанная раньше; 3) скачать сейчас, проверить отпечаток и сохранить. Иначе null — запрос идёт в сеть.
    private WebResourceResponse local(String url) {
        try {
            if (url == null || !url.startsWith(home + "/pk/")) return null;
            String name = url.substring(home.length() + 4), h = null;
            int q = name.indexOf('?');
            if (q >= 0) { String qs = name.substring(q + 1); name = name.substring(0, q); int i = qs.indexOf("h="); if (i >= 0) { h = qs.substring(i + 2); int a = h.indexOf('&'); if (a >= 0) h = h.substring(0, a); } }
            if (!name.matches("[0-9a-f]{6,32}\\.bin")) return null;
            if (pk.contains(name)) return answer(getAssets().open("pk/" + name));
            if (h == null || !h.matches("[0-9a-f]{6,32}")) return null;
            File f = new File(cacheDir, name);
            if (f.isFile() && h.equals(md5(f))) return answer(new FileInputStream(f));
            if (!download(url, f, h)) return null; // не вышло — пусть грузит сам WebView
            return answer(new FileInputStream(f));
        } catch (Exception e) { return null; }
    }

    // ответ с пометкой X-App-Local: помощник кэша (sw.js) не копирует такие файлы к себе — они уже есть в приложении
    private WebResourceResponse answer(InputStream in) {
        HashMap<String, String> hd = new HashMap<String, String>();
        hd.put("X-App-Local", "1");
        hd.put("Access-Control-Expose-Headers", "X-App-Local");
        try { return new WebResourceResponse("application/octet-stream", null, 200, "OK", hd, in); }
        catch (Throwable e) { return new WebResourceResponse("application/octet-stream", null, in); }
    }

    // скачать файл графики с сервера, проверить отпечаток (md5, первые знаки — как в ?h=) и только тогда сохранить
    private boolean download(String url, File f, String h) {
        HttpURLConnection c = null;
        File tmp = new File(cacheDir, f.getName() + ".part");
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(20000);
            if (c.getResponseCode() != 200) return false;
            InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp);
            byte[] b = new byte[16384]; int n; long total = 0;
            try { while ((n = in.read(b)) > 0) { total += n; if (total > 8L * 1024 * 1024) return false; out.write(b, 0, n); } } finally { out.close(); in.close(); }
            if (!h.equals(md5(tmp))) return false;
            return tmp.renameTo(f);
        } catch (Exception e) { return false; }
        finally { if (c != null) c.disconnect(); if (tmp.exists()) tmp.delete(); }
    }

    private static String md5(File f) {
        try {
            MessageDigest d = MessageDigest.getInstance("MD5"); FileInputStream in = new FileInputStream(f);
            byte[] b = new byte[16384]; int n;
            try { while ((n = in.read(b)) > 0) d.update(b, 0, n); } finally { in.close(); }
            StringBuilder sb = new StringBuilder(); byte[] r = d.digest();
            for (int i = 0; i < 5; i++) sb.append(String.format("%02x", r[i] & 255)); // 10 знаков — как отпечаток в оглавлении
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    // память приложения не растёт без конца: больше CACHE_MAX — удалить самые старые файлы
    private void trimCache() {
        try {
            File[] l = cacheDir.listFiles(); if (l == null) return;
            long sum = 0; for (File x : l) sum += x.length();
            if (sum <= CACHE_MAX) return;
            java.util.Arrays.sort(l, new java.util.Comparator<File>() { public int compare(File a, File b) { return a.lastModified() < b.lastModified() ? -1 : a.lastModified() > b.lastModified() ? 1 : 0; } });
            for (File x : l) { if (sum <= CACHE_MAX / 2) break; sum -= x.length(); x.delete(); }
        } catch (Exception e) { /* не страшно */ }
    }

    private String offlinePage() {
        return "<html><body style=\"background:#1b1610;color:#e0ad4c;font-family:serif;text-align:center;padding-top:40%\">"
            + "<h2>Нет связи с сервером</h2><p style=\"color:#b3a38a\">Проверьте интернет и попробуйте снова.</p>"
            + "<p><a style=\"color:#fff;background:#8a1a0a;padding:12px 28px;border-radius:8px;text-decoration:none\" href=\"" + home + "\">Повторить</a></p></body></html>";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getData() != null) out = new Uri[] { data.getData() };
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    // «Назад»: сначала закрыть окно в игре (history.back), с главного экрана — свернуть приложение
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        // соединение с сервером могло оборваться, пока приложение было свёрнуто, — игра проверит его и переподключится
        web.loadUrl("javascript:window.appResume&&window.appResume()");
    }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

}
