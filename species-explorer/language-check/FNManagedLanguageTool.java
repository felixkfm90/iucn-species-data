package org.languagetool.server;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.languagetool.server.HTTPServer;
import org.languagetool.server.HTTPServerConfig;

/** One unchanged local LT server; EOF or the private pipe command stops it normally. */
public final class FNManagedLanguageTool {
  public static void main(String[] args) throws Exception {
    if (args.length != 3 || !args[0].matches("[0-9]{1,5}") || !args[2].matches("[a-f0-9]{48}")) {
      System.exit(2);
    }
    int port = Integer.parseInt(args[0]);
    if (port < 1024 || port > 65535) System.exit(2);
    HTTPServerConfig config = new HTTPServerConfig(new String[] {"--config", args[1], "--port", args[0]});
    DatabaseAccess.init(config);
    HTTPServer server = new HTTPServer(config, false, "127.0.0.1", Set.of("127.0.0.1"));
    int result = 0;
    try {
      server.run();
      System.out.println("FN_LT_READY " + args[2]);
      System.out.flush();
      BufferedReader commands = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
      String line;
      while ((line = commands.readLine()) != null) {
        if (line.equals("FN_LT_STOP " + args[2])) break;
      }
    } catch (Throwable failure) {
      result = 1;
    } finally {
      server.stop();
      System.out.println("FN_LT_STOPPED " + args[2]);
      System.out.flush();
    }
    System.exit(result);
  }
}
