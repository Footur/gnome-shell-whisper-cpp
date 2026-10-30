import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SIGNAL_INT = 2;

export default class WhisperExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._enabled = true;
        this._recordingProcess = null;
        this._recordingPath = null;
        this._busy = false;
        this._held = false;
        this._eventId = global.stage.connect('captured-event', this._onCapturedEvent.bind(this));
    }

    disable() {
        this._enabled = false;
        if (this._eventId) {
            global.stage.disconnect(this._eventId);
            this._eventId = null;
        }

        if (this._recordingProcess) {
            const process = this._recordingProcess;
            const path = this._recordingPath;
            this._recordingProcess = null;
            this._recordingPath = null;
            process.send_signal(SIGNAL_INT);
            this._removeAfterExit(process, path);
        }

        this._settings = null;
        this._busy = false;
        this._held = false;
    }

    _onCapturedEvent(_actor, event) {
        const type = event.type();
        if (type !== Clutter.EventType.KEY_PRESS && type !== Clutter.EventType.KEY_RELEASE)
            return Clutter.EVENT_PROPAGATE;

        const keyName = this._settings.get_string('recording-key');
        const keySymbol = Clutter[`KEY_${keyName}`];
        if (keySymbol === undefined || event.get_key_symbol() !== keySymbol)
            return Clutter.EVENT_PROPAGATE;

        if (type === Clutter.EventType.KEY_PRESS && !this._held) {
            this._held = true;
            this._startRecording();
        } else if (type === Clutter.EventType.KEY_RELEASE && this._held) {
            this._held = false;
            this._stopRecording();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _startRecording() {
        if (this._busy)
            return;

        const path = `/dev/shm/gnome-whisper-${GLib.uuid_string_random()}.wav`;
        try {
            this._recordingProcess = Gio.Subprocess.new([
                'pw-record', '--rate', '16000', '--channels', '1', '--format', 's16', path,
            ], Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            this._recordingPath = path;
            this._busy = true;
        } catch (error) {
            Main.notify('GNOME whisper.cpp', `Could not start pw-record: ${error.message}`);
        }
    }

    _stopRecording() {
        if (!this._recordingProcess)
            return;

        const process = this._recordingProcess;
        const path = this._recordingPath;
        this._recordingProcess = null;
        this._recordingPath = null;
        process.send_signal(SIGNAL_INT);
        this._transcribe(process, path).catch(error => {
            if (this._enabled)
                Main.notify('GNOME whisper.cpp', error.message);
        }).finally(() => {
            this._removeFile(path);
            this._busy = false;
        });
    }

    async _transcribe(recordingProcess, recordingPath) {
        const settings = this._settings;
        await this._wait(recordingProcess);
        if (!this._enabled)
            return;

        const model = settings.get_string('model-path').trim();
        if (!model)
            throw new Error('Set the whisper.cpp model path in extension preferences.');

        const cli = settings.get_string('whisper-cli').trim() || 'whisper-cli';
        const language = settings.get_string('language').trim();
        const outputBase = `/dev/shm/gnome-whisper-${GLib.uuid_string_random()}`;
        const outputPath = `${outputBase}.txt`;
        let extraArguments;

        try {
            [, extraArguments] = GLib.shell_parse_argv(settings.get_string('whisper-arguments'));
        } catch (error) {
            throw new Error(`Invalid whisper.cpp arguments: ${error.message}`);
        }

        const argumentsList = [cli, '-m', model, '-f', recordingPath, '-otxt', '-of', outputBase];
        if (language && language !== 'auto')
            argumentsList.push('-l', language);
        argumentsList.push(...extraArguments);

        try {
            const process = Gio.Subprocess.new(argumentsList,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            await this._waitCheck(process);
            if (!this._enabled)
                return;
            const transcription = await this._readFile(outputPath);
            if (!transcription)
                throw new Error('whisper-cli produced no transcription.');
            if (this._enabled)
                await this._copyText(transcription, settings);
        } finally {
            this._removeFile(outputPath);
        }
    }

    async _copyText(text, settings) {
        let command;
        try {
            [, command] = GLib.shell_parse_argv(settings.get_string('clipboard-command'));
        } catch (error) {
            throw new Error(`Invalid clipboard command: ${error.message}`);
        }

        if (command.length === 0)
            throw new Error('Set a clipboard command such as wl-copy in extension preferences.');

        const process = Gio.Subprocess.new(command,
            Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_SILENCE |
            Gio.SubprocessFlags.STDERR_SILENCE);

        await new Promise((resolve, reject) => {
            process.communicate_utf8_async(text, null, (source, result) => {
                try {
                    source.communicate_utf8_finish(result);
                    if (!source.get_successful())
                        throw new Error('Clipboard command failed. Check that wl-copy is installed.');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _wait(process) {
        return new Promise((resolve, reject) => {
            process.wait_async(null, (source, result) => {
                try {
                    source.wait_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _waitCheck(process) {
        return new Promise((resolve, reject) => {
            process.wait_check_async(null, (source, result) => {
                try {
                    source.wait_check_finish(result);
                    resolve();
                } catch (_error) {
                    reject(new Error('A transcription or typing command failed. Check its executable and arguments.'));
                }
            });
        });
    }

    _readFile(path) {
        return new Promise((resolve, reject) => {
            Gio.File.new_for_path(path).load_contents_async(null, (file, result) => {
                try {
                    const [, contents] = file.load_contents_finish(result);
                    resolve(new TextDecoder().decode(contents).trim());
                } catch (error) {
                    reject(new Error(`Could not read whisper-cli output: ${error.message}`));
                }
            });
        });
    }

    _removeAfterExit(process, path) {
        this._wait(process).then(() => this._removeFile(path), () => this._removeFile(path));
    }

    _removeFile(path) {
        if (!path)
            return;

        try {
            Gio.File.new_for_path(path).delete(null);
        } catch (_error) {
        }
    }
}