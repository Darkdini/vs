package javax.microedition.io;

import java.io.*;
import java.net.Socket;

// Замена заглушки Connector из freej2me: настоящие TCP-сокеты (socket://host:port) для тестов клиента.
// -Dj2me.host=<host> подменяет хост из jar (удобно, если jar не пропатчен).
public class Connector
{
	public static final int READ = 1;
	public static final int WRITE = 2;
	public static final int READ_WRITE = 3;

	public static Connection open(String name) throws IOException { return open(name, READ_WRITE, false); }

	public static Connection open(String name, int mode) throws IOException { return open(name, mode, false); }

	public static Connection open(String name, int mode, boolean timeouts) throws IOException
	{
		if (!name.startsWith("socket://")) throw new ConnectionNotFoundException("unsupported: " + name);
		String hp = name.substring(9);
		String host = hp.substring(0, hp.lastIndexOf(':'));
		int port = Integer.parseInt(hp.substring(hp.lastIndexOf(':') + 1));
		if (System.getProperty("j2me.host") != null) host = System.getProperty("j2me.host");
		System.out.println("[harness] socket connect " + host + ":" + port + " (asked " + name + ")");
		final Socket sock = new Socket(host, port);
		return new SocketConnection()
		{
			public String getAddress() { return sock.getInetAddress().getHostAddress(); }
			public String getLocalAddress() { return sock.getLocalAddress().getHostAddress(); }
			public int getLocalPort() { return sock.getLocalPort(); }
			public int getPort() { return sock.getPort(); }
			public int getSocketOption(byte o) { return 0; }
			public void setSocketOption(byte o, int v) { }
			public InputStream openInputStream() { try { return sock.getInputStream(); } catch (IOException e) { throw new RuntimeException(e); } }
			public DataInputStream openDataInputStream() { return new DataInputStream(openInputStream()); }
			public OutputStream openOutputStream() { try { return sock.getOutputStream(); } catch (IOException e) { throw new RuntimeException(e); } }
			public DataOutputStream openDataOutputStream() { return new DataOutputStream(openOutputStream()); }
			public void close() { try { sock.close(); } catch (IOException e) { } }
		};
	}

	public static InputStream openInputStream(String name) { return new ByteArrayInputStream(new byte[0]); }
	public static DataInputStream openDataInputStream(String name) { return new DataInputStream(openInputStream(name)); }
	public static OutputStream openOutputStream(String name) { return OutputStream.nullOutputStream(); }
	public static DataOutputStream openDataOutputStream(String name) { return new DataOutputStream(openOutputStream(name)); }
}
