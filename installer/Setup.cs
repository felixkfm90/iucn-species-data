using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;

static class Setup {
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    static string Extract(string target) {
        if (Directory.Exists(target)) throw new Exception("Der Entpackordner ist bereits vorhanden.");
        Directory.CreateDirectory(target);
        string prefix = Path.GetFullPath(target).TrimEnd('\\') + "\\";
        using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        using (var zip = new ZipArchive(input, ZipArchiveMode.Read)) {
            foreach (var entry in zip.Entries) {
                string name = entry.FullName.Replace('\\', '/');
                if (name.StartsWith("/") || name.Contains(":") || Array.Exists(name.Split('/'), part => part == "..")) throw new Exception("Ungueltiger Paketpfad.");
                string file = Path.GetFullPath(Path.Combine(target, name));
                if (!file.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new Exception("Paketpfad liegt ausserhalb des Ziels.");
                if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(file); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                using (var source = entry.Open()) using (var output = new FileStream(file, FileMode.CreateNew)) source.CopyTo(output);
            }
        }
        return target;
    }
    static int Run(string exe, string arguments) {
        var info = new ProcessStartInfo(exe, arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        using (var process = Process.Start(info)) {
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            process.WaitForExit();
            Task.WaitAll(output, error);
            if (process.ExitCode != 0) throw new Exception(error.Result + "\n" + output.Result);
            return process.ExitCode;
        }
    }
    [STAThread]
    static int Main(string[] args) {
        if (args.Length == 2 && args[0] == "--extract-test") {
            try { Extract(Path.GetFullPath(args[1])); return 0; } catch { return 1; }
        }
        if (Environment.OSVersion.Version.Build < 22000) {
            MessageBox.Show("Dieses Paket ist fuer Windows 11 auf einem x64-PC vorgesehen.", "Arten-Explorer");
            return 1;
        }
        Application.EnableVisualStyles();
        var form = new Form { Text = "Arten-Explorer einrichten", Width = 640, Height = 460, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false };
        try { form.Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }
        var title = new Label { Text = "Arten-Explorer", Left = 24, Top = 22, Width = 580, Font = new Font("Segoe UI", 18), Height = 40 };
#if PREVIEW
        form.Text += " - Pruefpaket";
        title.Text += " - Pruefpaket";
#endif
        var explanation = new Label { Text = "Windows 11 · FN Wildlife & Travel\nProgramme und Lightroom-Plug-in werden bereitgestellt.\nIhre Anmeldungen und privaten Daten werden nicht mitgeliefert.", Left = 24, Top = 73, Width = 580, Height = 70 };
        var pathBox = new TextBox { Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "FN Wildlife Travel", "Arten-Explorer"), Left = 24, Top = 155, Width = 570 };
        var action = new ComboBox { Left = 24, Top = 200, Width = 570, DropDownStyle = ComboBoxStyle.DropDownList };
        action.Items.AddRange(new object[] { "Installieren oder aktualisieren", "Reparieren", "Deinstallieren und Arbeitsordner behalten" }); action.SelectedIndex = 0;
        var desktop = new CheckBox { Text = "Zusaetzlich eine Desktop-Verknuepfung anlegen", Left = 24, Top = 242, Width = 570, Checked = false };
        var status = new Label { Text = "Ein neuer, leerer Zielordner schuetzt vorhandene Installationen.\nFuer die gemeinsame Nutzung ist danach die Dienstanmeldung erforderlich.", Left = 24, Top = 278, Width = 570, Height = 60 };
        var button = new Button { Text = "Einrichten", Left = 420, Top = 355, Width = 174, Height = 34 };
        var cancel = new Button { Text = "Schliessen", Left = 24, Top = 355, Width = 130, Height = 34 };
        cancel.Click += (sender, evt) => form.Close();
        button.Click += async (sender, evt) => {
            button.Enabled = false; cancel.Enabled = false; pathBox.Enabled = false; action.Enabled = false; desktop.Enabled = false;
            string stage = Path.Combine(Path.GetTempPath(), "FN-ArtenExplorer-Setup-" + Guid.NewGuid().ToString("N"));
            string basis = pathBox.Text;
            string operation = action.SelectedIndex == 2 ? "uninstall" : action.SelectedIndex == 1 ? "repair" : "install";
            bool desktopRequested = desktop.Checked;
            status.Text = "Paket wird geprueft und eingerichtet. Bitte warten …";
            try {
                basis = Path.GetFullPath(basis).TrimEnd('\\', '/');
                await Task.Run(() => {
                    Extract(stage);
                    string options = Path.Combine(stage, "options.json");
                    File.WriteAllText(options, new JavaScriptSerializer().Serialize(new { packageRoot = stage, @base = basis, operation = operation, testMode = false }));
                    string node = Path.Combine(stage, "workspace", "runtime", "node", "node.exe");
                    Run(node, Quote(Path.Combine(stage, "program", "install-engine.mjs")) + " " + Quote(options));
                    string integration = Path.Combine(stage, "program", "windows-integration.ps1");
                    Run(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
                        "-NoProfile -ExecutionPolicy Bypass -File " + Quote(integration) + " -Action " + (operation == "uninstall" ? "Remove" : "Install") + " -Base " + Quote(basis) + (desktopRequested ? " -DesktopShortcut" : ""));
                });
                status.Text = operation == "uninstall" ? "Deinstalliert. Der gesamte Arbeitsordner bleibt erhalten." : "Erfolgreich eingerichtet. Starten Sie Arten-Explorer im Startmenue.\nDienst-/Git-/Squarespace-Anmeldung und Lightroom-Einrichtung folgen im Programm.";
                MessageBox.Show(status.Text, "Arten-Explorer", MessageBoxButtons.OK, MessageBoxIcon.Information);
            } catch (Exception error) {
                status.Text = "Einrichtung angehalten. Vorhandene Daten bleiben erhalten.";
                MessageBox.Show(error.Message, "Arten-Explorer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            } finally {
                try { if (Directory.Exists(stage)) Directory.Delete(stage, true); } catch { }
                button.Enabled = true; cancel.Enabled = true; pathBox.Enabled = true; action.Enabled = true; desktop.Enabled = true;
            }
        };
        form.Controls.AddRange(new Control[] { title, explanation, pathBox, action, desktop, status, button, cancel });
        Application.Run(form);
        return 0;
    }
}
