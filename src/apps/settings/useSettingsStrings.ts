import { useShell } from "@/components/shell/ShellContext";
import { settingsStrings } from "./strings";

export const useSettingsStrings = () => settingsStrings(useShell((s) => s.prefs.locale) === "fr" ? "fr" : "en");
