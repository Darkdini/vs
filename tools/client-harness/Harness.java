import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import javax.imageio.ImageIO;
import javax.microedition.lcdui.*;
import org.recompile.mobile.*;

// Headless-прогон J2ME-клиента: скрипт команд из файла.
//   wait <ms> | key <code> | text <строка> (ввести в TextBox и нажать Ok) | shot <file.png> | log <msg>
public class Harness {
    static Object currentScreen() throws Exception {
        ClassLoader cl = Mobile.getPlatform().loader;
        Class<?> b = Class.forName("com.fenix.main.b", true, cl);
        Object mgr = b.getMethod("a").invoke(null);
        return b.getMethod("b").invoke(mgr);
    }
    static void releaseOnCanvas(int key) throws Exception {
        Class<?> ic = Class.forName("com.fenix.main.i", true, Mobile.getPlatform().loader);
        Object canvas = ic.getMethod("a").invoke(null);
        for (Class<?> k = canvas.getClass(); k != null; k = k.getSuperclass()) {
            try { Method m = k.getDeclaredMethod("keyReleased", int.class); m.setAccessible(true); m.invoke(canvas, key); return; }
            catch (NoSuchMethodException x) {}
        }
    }

    static void focus(Object e, boolean on) throws Exception {
        for (Class<?> k = e.getClass(); k != null; k = k.getSuperclass()) {
            try { Method m = k.getDeclaredMethod("a", boolean.class); m.setAccessible(true); m.invoke(e, on); return; } catch (NoSuchMethodException x) {}
        }
    }
    static Field field(Class<?> c, String name) throws Exception {
        for (Class<?> k = c; k != null; k = k.getSuperclass()) {
            try { Field f = k.getDeclaredField(name); f.setAccessible(true); return f; } catch (NoSuchFieldException e) {}
        }
        throw new NoSuchFieldException(name);
    }

    public static void main(String[] args) throws Exception {
        String jar = args[0]; int w = Integer.parseInt(args[1]); int h = Integer.parseInt(args[2]);
        java.util.List<String> script = java.nio.file.Files.readAllLines(new File(args[3]).toPath(), java.nio.charset.StandardCharsets.UTF_8);
        String outDir = args[4];
        Mobile.setPlatform(new MobilePlatform(w, h));
        Mobile.getPlatform().setPainter(() -> {});
        if (!Mobile.getPlatform().loadJar(new File(jar).toURI().toString())) throw new RuntimeException("load failed");
        new Thread(() -> Mobile.getPlatform().runJar()).start();
        for (String line : script) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String cmd = line.split(" ", 2)[0]; String arg = line.contains(" ") ? line.split(" ", 2)[1] : "";
            try { switch (cmd) {
                case "wait": Thread.sleep(Long.parseLong(arg)); break;
                case "key": {
                    int k = Integer.parseInt(arg);
                    Mobile.getPlatform().keyPressed(k); Thread.sleep(20);
                    // отпускание всегда отдаём игровому Canvas клиента: если нажатие открыло системный TextBox,
                    // эмулятор отправил бы отпускание туда, и клиент включил бы автоповтор клавиши
                    releaseOnCanvas(k);
                    Thread.sleep(250);
                    break;
                }
                case "text": {
                    Displayable d = Mobile.getDisplay().getCurrent();
                    if (!(d instanceof TextBox)) { System.out.println("[harness] current is not TextBox: " + d); break; }
                    ((TextBox) d).setString(arg);
                    Field fl = Displayable.class.getDeclaredField("commandlistener"); fl.setAccessible(true);
                    CommandListener cl = (CommandListener) fl.get(d);
                    Command ok = null;
                    for (Command c : d.getCommands()) if (c.getLabel().equals("Ok")) ok = c;
                    cl.commandAction(ok, d);
                    Thread.sleep(300);
                    // отпускание «5» ушло в TextBox, а не в игровой Canvas — без этого клиент считает клавишу
                    // зажатой и включает автоповтор (например, бесконечно жмёт «Вход»)
                    releaseOnCanvas(53);
                    Thread.sleep(100);
                    break;
                }
                case "shot": {
                    ImageIO.write(Mobile.getPlatform().getLCD(), "png", new File(outDir, arg));
                    System.out.println("[harness] shot " + arg);
                    break;
                }
                case "log": System.out.println("[harness] " + arg); break;
                case "state": {
                    Class<?> ic = Class.forName("com.fenix.main.i", true, Mobile.getPlatform().loader);
                    Object canvas = ic.getMethod("a").invoke(null);
                    System.out.println("[harness] " + arg + " keys: held(j)=" + field(ic, "j").get(null) + " k=" + field(ic, "k").get(canvas)
                        + " f=" + field(ic, "f").get(canvas) + " display=" + Mobile.getDisplay().getCurrent().getClass().getName());
                    break;
                }
                case "dump": {
                    Object q = currentScreen();
                    System.out.println("[harness] screen: " + q.getClass().getName());
                    Field fa = field(q.getClass(), "a"); Object rows = fa.get(q);
                    if (!(rows instanceof Object[][])) { System.out.println("[harness]  (not a form)"); break; }
                    Object[][] r = (Object[][]) rows;
                    for (int i = 0; i < r.length; i++) {
                        StringBuilder sb = new StringBuilder("[harness]  row " + i + ":");
                        for (int j = 0; j < r[i].length; j++) {
                            Object e = r[i][j]; String txt = "";
                            try { Method m = e.getClass().getSuperclass().getDeclaredMethod("j"); m.setAccessible(true); txt = String.valueOf(m.invoke(e)); } catch (Exception ex) {}
                            sb.append(" [").append(j).append(" ").append(e.getClass().getName()).append(" '").append(txt.replace("\n", " ")).append("']");
                        }
                        System.out.println(sb);
                    }
                    System.out.println("[harness]  cursor x=" + field(q.getClass(), "x").get(q) + " y=" + field(q.getClass(), "y").get(q));
                    break;
                }
                case "select": {
                    Object q = currentScreen(); String[] rc = arg.split(" ");
                    int rx = Integer.parseInt(rc[0]), ry = Integer.parseInt(rc[1]);
                    field(q.getClass(), "x").setInt(q, rx);
                    field(q.getClass(), "y").setInt(q, ry);
                    Object[][] rows = (Object[][]) field(q.getClass(), "a").get(q);
                    for (Object[] row : rows) for (Object e : row) focus(e, false);
                    Object target = rows[rx][ry];
                    focus(target, true);
                    if (target.getClass().getName().equals("v")) { field(target.getClass(), "a").setInt(target, 1); field(q.getClass(), "q").setBoolean(q, true); }
                    Thread.sleep(150);
                    break;
                }
            } } catch (Exception ex) { System.out.println("[harness] command failed: " + line + " -> " + ex); }
        }
        System.exit(0);
    }
}
