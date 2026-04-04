import St from "gi://St";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { ProcessManager, ResourceKey } from "./process-management.js";

export class LogDialog {
    _dialog: St.BoxLayout | null = null;
    _label: Clutter.Text | null = null;
    _dialogKey: ResourceKey | null = null;
    _contextMenu: St.BoxLayout | null = null;
    _processManager: ProcessManager;

    constructor(processManager: ProcessManager) {
        this._processManager = processManager;
        processManager.onLogUpdated = (key) => {
            if (this._dialogKey === key && this._label) {
                this._label.set_markup(
                    this._processManager.buildLogMarkup(key),
                );
            }
        };
    }

    show = (resourceKey: ResourceKey) => {
        this.close();

        const container = new St.BoxLayout({
            vertical: true,
            style: "background-color: rgba(30, 30, 30, 0.95); border-radius: 12px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1);",
        });

        const titleBar = new St.BoxLayout({ vertical: false });
        const title = new St.Label({
            text: resourceKey,
            style: "font-weight: bold; font-size: 14px; color: #fff;",
            x_expand: true,
        });
        const closeButton = new St.Button({
            child: new St.Icon({
                icon_name: "window-close-symbolic",
                style_class: "popup-menu-icon",
            }),
            style_class: "system-menu-action",
        });
        closeButton.connect("clicked", () => this.close());
        titleBar.add_child(title);
        titleBar.add_child(closeButton);
        container.add_child(titleBar);

        title.reactive = true;
        title.connect(
            "button-press-event",
            (_actor: Clutter.Actor, event: Clutter.Event) => {
                if (event.get_button() !== 1) {
                    return Clutter.EVENT_PROPAGATE;
                }
                const [mouseX, mouseY] = event.get_coords();
                const [containerX, containerY] = container.get_position();
                const offsetX = mouseX - containerX;
                const offsetY = mouseY - containerY;

                const grab = global.stage.grab(title);

                const motionId = title.connect(
                    "motion-event",
                    (_a: Clutter.Actor, motionEvent: Clutter.Event) => {
                        const [mx, my] = motionEvent.get_coords();
                        container.set_position(mx - offsetX, my - offsetY);
                        return Clutter.EVENT_STOP;
                    },
                );

                const releaseId = title.connect("button-release-event", () => {
                    title.disconnect(motionId);
                    title.disconnect(releaseId);
                    grab.dismiss();
                    return Clutter.EVENT_STOP;
                });

                return Clutter.EVENT_STOP;
            },
        );

        const scrollView = new St.ScrollView({
            style: "height: 400px; width: 600px; margin-top: 8px;",
            overlay_scrollbars: true,
        });

        const label = new Clutter.Text({
            use_markup: true,
            line_wrap: true,
            selectable: true,
            reactive: true,
            font_name: "Monospace 11",
        });
        label.set_markup(this._processManager.buildLogMarkup(resourceKey));
        label.connect(
            "button-press-event",
            (_actor: Clutter.Actor, event: Clutter.Event) => {
                if (event.get_button() === 3) {
                    const [x, y] = event.get_coords();
                    this._showContextMenu(x, y, label);
                    return Clutter.EVENT_STOP;
                }
                this._closeContextMenu();
                return Clutter.EVENT_PROPAGATE;
            },
        );

        const box = new St.BoxLayout({
            vertical: true,
            style: "padding: 8px;",
        });
        box.add_child(label);
        scrollView.set_child(box);
        container.add_child(scrollView);

        Main.layoutManager.uiGroup.add_child(container);
        this._dialog = container;
        this._label = label;
        this._dialogKey = resourceKey;

        const monitor = Main.layoutManager.primaryMonitor!;
        const [, natWidth] = container.get_preferred_width(-1);
        const [, natHeight] = container.get_preferred_height(-1);
        container.set_position(
            Math.floor((monitor.width - natWidth) / 2),
            Math.floor((monitor.height - natHeight) / 2),
        );
    };

    close = () => {
        this._closeContextMenu();
        if (this._dialog) {
            Main.layoutManager.uiGroup.remove_child(this._dialog);
            this._dialog.destroy();
            this._dialog = null;
            this._label = null;
            this._dialogKey = null;
        }
    };

    _showContextMenu = (x: number, y: number, textActor: Clutter.Text) => {
        this._closeContextMenu();

        const menu = new St.BoxLayout({
            vertical: true,
            style: "background-color: rgba(40, 40, 40, 0.95); border-radius: 8px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.1);",
        });

        const copyButton = new St.Button({
            label: "Copy",
            style_class: "popup-menu-item",
        });
        copyButton.connect("clicked", () => {
            const selection = textActor.get_selection();
            const text = selection || textActor.get_text();
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD,
                text,
            );
            this._closeContextMenu();
        });

        const selectAllButton = new St.Button({
            label: "Select All",
            style_class: "popup-menu-item",
        });
        selectAllButton.connect("clicked", () => {
            textActor.set_selection(0, textActor.get_text().length);
            this._closeContextMenu();
        });

        menu.add_child(copyButton);
        menu.add_child(selectAllButton);

        Main.layoutManager.uiGroup.add_child(menu);
        menu.set_position(Math.floor(x), Math.floor(y));
        this._contextMenu = menu;
    };

    _closeContextMenu = () => {
        if (this._contextMenu) {
            Main.layoutManager.uiGroup.remove_child(this._contextMenu);
            this._contextMenu.destroy();
            this._contextMenu = null;
        }
    };
}
