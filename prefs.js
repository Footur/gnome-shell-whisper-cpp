import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WhisperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Speech to text'});

        this._addRecordingKey(group, settings);
        this._addEntry(group, settings, 'whisper-cli', 'whisper-cli executable', 'whisper-cli');
        this._addEntry(group, settings, 'model-path', 'Model file', '/path/to/ggml-base.en.bin');
        this._addEntry(group, settings, 'language', 'Language', 'auto');
        this._addEntry(group, settings, 'whisper-arguments', 'Additional whisper.cpp arguments', '-nt');
        this._addEntry(group, settings, 'clipboard-command', 'Clipboard command', 'wl-copy');

        const hint = new Gtk.Label({
            label: 'Fn may be handled by laptop firmware and not appear as a key. Use a key such as F9 if needed. Install wl-copy to copy transcriptions to the clipboard.',
            wrap: true,
            xalign: 0,
        });
        group.add(hint);
        page.add(group);
        window.add(page);
    }

    _addRecordingKey(group, settings) {
        const row = new Adw.ActionRow({title: 'Hold key'});
        const button = new Gtk.Button({
            label: settings.get_string('recording-key'),
            valign: Gtk.Align.CENTER,
        });
        let capturing = false;
        const controller = new Gtk.EventControllerKey();
        controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
        controller.connect('key-pressed', (_controller, keyval) => {
            if (!capturing)
                return false;

            const keyName = Gdk.keyval_name(keyval);
            if (!keyName)
                return false;

            settings.set_string('recording-key', keyName);
            button.set_label(keyName);
            capturing = false;
            return true;
        });
        button.add_controller(controller);
        button.connect('clicked', () => {
            capturing = true;
            button.set_label('Press a key...');
            button.grab_focus();
        });
        row.add_suffix(button);
        group.add(row);
    }

    _addEntry(group, settings, key, title, placeholder) {
        const row = new Adw.EntryRow({title});
        row.set_text(settings.get_string(key));
        row.set_input_purpose(Gtk.InputPurpose.FREE_FORM);
        row.connect('notify::text', () => settings.set_string(key, row.get_text()));
        row.set_tooltip_text(placeholder);
        group.add(row);
    }
}