import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { Resource } from "./types.js";

const MAX_LOG_SIZE_IN_BYTES = 100_000;
const OUTPUT_READ_CHUNK_SIZE_IN_BYTES = 4096;

// A type alias for making the maps' type definitions more informative
export type ResourceKey = string;

export const getResourceKey = (resource: Resource): ResourceKey =>
    `${resource.context}/${resource.type}/${resource.namespace}/${resource.name}`;

export interface ProcessState {
    // We're nulling just the process property instead of the entire state because the PID and exit message remain to be displayed in the log.
    process: Gio.Subprocess | null;
    // As returned by Gio.Subprocess.get_identifier()
    pidString: string | null;
    log: string;
    exitMessage: string | null;
}

export class ProcessManager {
    state = new Map<ResourceKey, ProcessState>();
    onLogUpdated: ((resourceKey: ResourceKey) => void) | null = null;

    spawnPortForward = (
        resource: Resource,
        onExit: () => void,
    ): Gio.Subprocess | null => {
        try {
            const process = Gio.Subprocess.new(
                [
                    "kubectl",
                    "port-forward",
                    `--context=${resource.context}`,
                    `--namespace=${resource.namespace}`,
                    `${resource.type}/${resource.name}`,
                    `${resource.localPort}:${resource.remotePort}`,
                ],
                Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE,
            );
            const resourceKey = getResourceKey(resource);
            this.state.set(resourceKey, {
                process,
                pidString: process.get_identifier(),
                log: "",
                exitMessage: null,
            });
            const stdout = process.get_stdout_pipe();
            const stderr = process.get_stderr_pipe();
            if (stdout) {
                this._readStream(stdout, resourceKey);
            }
            if (stderr) {
                this._readStream(stderr, resourceKey);
            }
            process.wait_async(null, () => onExit());
            return process;
        } catch (e) {
            Main.notifyError(
                "Port-forward failed",
                `${resource.name}: ${(e as Error).message}`,
            );
            return null;
        }
    };

    addExitMessage = (resourceKey: ResourceKey) => {
        const processState = this.state.get(resourceKey);
        if (!processState) {
            return;
        }
        const pidStr = processState.pidString
            ? `${processState.pidString} `
            : "";
        processState.exitMessage = `Process ${pidStr}exited.`;
        this.onLogUpdated?.(resourceKey);
    };

    buildLogMarkup = (resourceKey: ResourceKey): string => {
        const processState = this.state.get(resourceKey);
        const rawLog = processState?.log ?? "";
        const escaped = GLib.markup_escape_text(rawLog, -1);
        const exitMsg = processState?.exitMessage;
        if (exitMsg) {
            return `<span color="#dddddd">${escaped}</span>\n<span color="#ff5555">${GLib.markup_escape_text(exitMsg, -1)}</span>`;
        }
        return `<span color="#dddddd">${escaped || "(Process has no output yet.)"}</span>`;
    };

    clearResourceState = (resourceKey: ResourceKey) => {
        this.state.delete(resourceKey);
    };

    destroyAllProcesses = () => {
        for (const processState of this.state.values()) {
            if (processState.process) {
                processState.process.force_exit();
            }
        }
        this.state.clear();
    };

    _readStream = (stream: Gio.InputStream, resourceKey: ResourceKey) => {
        stream.read_bytes_async(
            OUTPUT_READ_CHUNK_SIZE_IN_BYTES,
            0,
            null,
            (_source, result) => {
                try {
                    const bytes = stream.read_bytes_finish(result);
                    if (bytes && bytes.get_size() > 0) {
                        const data = bytes.get_data();
                        if (data) {
                            const text = new TextDecoder().decode(data);
                            const processState = this.state.get(resourceKey);
                            if (processState) {
                                processState.log += text;
                                if (
                                    processState.log.length >
                                    MAX_LOG_SIZE_IN_BYTES
                                ) {
                                    // Keep only the last MAX_LOG_IN_BYTES bytes
                                    processState.log = processState.log.slice(
                                        -MAX_LOG_SIZE_IN_BYTES,
                                    );
                                }
                                this.onLogUpdated?.(resourceKey);
                            }
                        }
                        this._readStream(stream, resourceKey);
                    }
                } catch {
                    // Stream closed or process exited
                }
            },
        );
    };
}
