using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Launcher {
    static string Quote(string value) {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
    [STAThread]
    static int Main(string[] args) {
        string runFile = null;
        try {
            string basis = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\')).FullName;
            string repo = Path.Combine(basis, "workspace");
            string electron = Path.Combine(repo, "node_modules", "electron", "dist", "electron.exe");
            string main = Path.Combine(repo, "species-explorer", "desktop", "main.mjs");
            if (!File.Exists(Path.Combine(basis, "installation.json")) || !File.Exists(electron) || !File.Exists(main))
                throw new Exception("Die Installation ist unvollstaendig. Bitte das Installationspaket erneut oeffnen und Reparieren waehlen. Ihre Daten bleiben erhalten.");
            foreach (string arg in args) if (!System.Text.RegularExpressions.Regex.IsMatch(arg, "^--taxonomy-correction-request=[0-9a-fA-F-]{36}$")) throw new Exception("Unbekanntes Startargument.");
            var info = new ProcessStartInfo(electron, Quote(main) + (args.Length == 0 ? "" : " " + String.Join(" ", args.Select(Quote).ToArray())));
            info.UseShellExecute = false;
            info.WorkingDirectory = repo;
            string nodeDir = Path.Combine(repo, "runtime", "node");
            string gitDir = Path.Combine(repo, "runtime", "git", "cmd");
            string existingPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            info.EnvironmentVariables["PATH"] = nodeDir + ";" + existingPath + ";" + gitDir;
            info.EnvironmentVariables["FN_EXPLORER_INSTALLED"] = "1";
            info.EnvironmentVariables["FN_EXPLORER_INSTALL_ROOT"] = basis;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            runFile = Path.Combine(basis, "app-running.json");
            bool ownsRecord = false;
            try {
                using (var stream = new FileStream(runFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read)) {
                    byte[] bytes = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new { pid = Process.GetCurrentProcess().Id, createdAt = DateTime.UtcNow.ToString("o") }));
                    stream.Write(bytes, 0, bytes.Length);
                }
                ownsRecord = true;
            } catch (IOException) {
                try {
                    var value = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(File.ReadAllText(runFile));
                    using (var previous = Process.GetProcessById(Convert.ToInt32(value["pid"]))) {
                        if (!String.Equals(previous.MainModule.FileName, Process.GetCurrentProcess().MainModule.FileName, StringComparison.OrdinalIgnoreCase))
                            throw new Exception("Der alte Laufnachweis gehoert nicht zu diesem Programm. Der letzte Programmabschluss muss zuerst geprueft werden; es wird keine weitere Instanz gestartet.");
                    }
                } catch (ArgumentException) { File.Delete(runFile); return Main(args); }
            }
            try {
                using (var child = Process.Start(info)) { child.WaitForExit(); return child.ExitCode; }
            } finally { if (ownsRecord) File.Delete(runFile); }
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Arten-Explorer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
